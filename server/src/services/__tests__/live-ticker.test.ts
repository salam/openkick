import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDB, getDB } from "../../database.js";

// Mock llm.js before importing anything that uses it
vi.mock("../llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../llm.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getTickerEntries,
  upsertTickerEntry,
  getActiveTournamentTickers,
  setCrawlConfig,
  getCrawlConfigs,
  removeCrawlConfig,
  updateLastCrawled,
  getDueCrawlUrls,
  crawlAndExtract,
} from "../live-ticker.service.js";

/** Helper: inserts a tournament event and returns its id */
function seedTournament(date: string): number {
  const db = getDB();
  db.run(
    `INSERT INTO events (type, title, date) VALUES ('tournament', 'Test Cup', ?)`,
    [date],
  );
  const rows = db.exec("SELECT last_insert_rowid()");
  return rows[0].values[0][0] as number;
}

/** Today in YYYY-MM-DD format */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Schema tests (kept from original)
// ---------------------------------------------------------------------------
describe("live-ticker schema", () => {
  beforeEach(async () => {
    await initDB();
    // Seed a parent event so foreign-key constraints are satisfied
    const db = getDB();
    db.run(`INSERT OR IGNORE INTO events (id, type, title, date) VALUES (999, 'tournament', 'Test Tournament', '2026-03-01')`);
  });

  it("tournament_results_url table exists and accepts rows", () => {
    const db = getDB();
    db.run(`INSERT INTO tournament_results_url (tournamentId, url) VALUES (999, 'https://example.com')`);
    const rows = db.exec("SELECT * FROM tournament_results_url WHERE tournamentId = 999");
    expect(rows[0].values).toHaveLength(1);
  });

  it("live_ticker_entries table exists and accepts rows", () => {
    const db = getDB();
    db.run(`INSERT INTO live_ticker_entries (tournamentId, homeTeam, awayTeam, score) VALUES (999, 'Team A', 'Team B', '2:1')`);
    const rows = db.exec("SELECT * FROM live_ticker_entries WHERE tournamentId = 999");
    expect(rows[0].values).toHaveLength(1);
  });

  it("live_ticker_entries upserts on same match", () => {
    const db = getDB();
    db.run(`INSERT INTO live_ticker_entries (tournamentId, homeTeam, awayTeam, matchLabel, score) VALUES (999, 'Team A', 'Team B', 'Group A Game 1', '0:0')`);
    db.run(`INSERT OR REPLACE INTO live_ticker_entries (tournamentId, homeTeam, awayTeam, matchLabel, score, updatedAt) VALUES (999, 'Team A', 'Team B', 'Group A Game 1', '2:1', datetime('now'))`);
    const rows = db.exec("SELECT score FROM live_ticker_entries WHERE tournamentId = 999");
    expect(rows[0].values).toHaveLength(1);
    expect(rows[0].values[0][0]).toBe("2:1");
  });

  it("game_history tables exist", () => {
    const db = getDB();
    db.run(`INSERT INTO game_history (tournamentName, date) VALUES ('Test Cup', '2026-03-01')`);
    const rows = db.exec("SELECT * FROM game_history");
    expect(rows[0].values).toHaveLength(1);
    const historyId = rows[0].values[0][0];

    db.run(`INSERT INTO game_history_players (historyId, playerInitial) VALUES (${historyId}, 'J. M.')`);
    db.run(`INSERT INTO game_history_matches (historyId, homeTeam, awayTeam, score) VALUES (${historyId}, 'A', 'B', '1:0')`);

    const players = db.exec(`SELECT * FROM game_history_players WHERE historyId = ${historyId}`);
    expect(players[0].values).toHaveLength(1);
    const matches = db.exec(`SELECT * FROM game_history_matches WHERE historyId = ${historyId}`);
    expect(matches[0].values).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Service CRUD tests (Task 4)
// ---------------------------------------------------------------------------
describe("live-ticker service", () => {
  beforeEach(async () => {
    await initDB();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -- upsertTickerEntry / getTickerEntries --
  it("upsertTickerEntry inserts a new entry and getTickerEntries returns it", () => {
    const tId = seedTournament(todayStr());
    upsertTickerEntry(tId, { match: "Game 1", home: "FC A", away: "FC B", score: "1:0", time: "10:00" }, "crawl");

    const entries = getTickerEntries(tId);
    expect(entries).toHaveLength(1);
    expect(entries[0].homeTeam).toBe("FC A");
    expect(entries[0].awayTeam).toBe("FC B");
    expect(entries[0].score).toBe("1:0");
    expect(entries[0].source).toBe("crawl");
  });

  it("upsertTickerEntry updates score on same match (upsert)", () => {
    const tId = seedTournament(todayStr());
    upsertTickerEntry(tId, { match: "Game 1", home: "FC A", away: "FC B", score: "0:0", time: "10:00" }, "crawl");
    upsertTickerEntry(tId, { match: "Game 1", home: "FC A", away: "FC B", score: "3:1", time: "10:00" }, "crawl");

    const entries = getTickerEntries(tId);
    expect(entries).toHaveLength(1);
    expect(entries[0].score).toBe("3:1");
  });

  // -- setCrawlConfig / getCrawlConfigs --
  it("setCrawlConfig stores config and getCrawlConfigs retrieves it", () => {
    const tId = seedTournament(todayStr());
    setCrawlConfig(tId, "https://turnieragenda.ch/de/event/schedule/123", 5);

    const configs = getCrawlConfigs(tId);
    expect(configs).toHaveLength(1);
    expect(configs[0].url).toBe("https://turnieragenda.ch/de/event/schedule/123");
    expect(configs[0].crawlIntervalMin).toBe(5);
    expect(configs[0].isActive).toBe(1);
  });

  // -- removeCrawlConfig --
  it("removeCrawlConfig deactivates a config", () => {
    const tId = seedTournament(todayStr());
    setCrawlConfig(tId, "https://example.com/results", 10);
    const configs = getCrawlConfigs(tId);
    expect(configs).toHaveLength(1);

    removeCrawlConfig(configs[0].id);

    const after = getCrawlConfigs(tId);
    expect(after).toHaveLength(0);
  });

  // -- updateLastCrawled --
  it("updateLastCrawled sets the lastCrawledAt timestamp", () => {
    const tId = seedTournament(todayStr());
    setCrawlConfig(tId, "https://example.com", 10);
    const configs = getCrawlConfigs(tId);
    expect(configs[0].lastCrawledAt).toBeNull();

    updateLastCrawled(configs[0].id);

    const after = getCrawlConfigs(tId);
    expect(after[0].lastCrawledAt).not.toBeNull();
  });

  // -- getActiveTournamentTickers --
  it("getActiveTournamentTickers returns entries for today's tournaments", () => {
    const tId = seedTournament(todayStr());
    upsertTickerEntry(tId, { match: "Game 1", home: "X", away: "Y", score: "2:0", time: "09:00" }, "crawl");

    const active = getActiveTournamentTickers();
    expect(active.length).toBeGreaterThanOrEqual(1);
    const t = active.find((a) => a.tournamentId === tId);
    expect(t).toBeDefined();
    expect(t!.entries).toHaveLength(1);
    expect(t!.entries[0].score).toBe("2:0");
  });

  it("getActiveTournamentTickers does NOT return past tournament entries", () => {
    const pastId = seedTournament("2020-01-01");
    upsertTickerEntry(pastId, { match: "Game 1", home: "Old A", away: "Old B", score: "1:1", time: "08:00" }, "crawl");

    const active = getActiveTournamentTickers();
    const found = active.find((a) => a.tournamentId === pastId);
    expect(found).toBeUndefined();
  });

  // -- getDueCrawlUrls --
  it("getDueCrawlUrls returns configs that are due for crawling", () => {
    const tId = seedTournament(todayStr());
    setCrawlConfig(tId, "https://example.com/live", 10);

    // Never crawled => should be due
    const due = getDueCrawlUrls();
    expect(due.length).toBeGreaterThanOrEqual(1);
    const found = due.find((d) => d.tournamentId === tId);
    expect(found).toBeDefined();
    expect(found!.url).toBe("https://example.com/live");
  });
});

// ---------------------------------------------------------------------------
// Crawl engine tests (Task 5)
// ---------------------------------------------------------------------------
describe("crawlAndExtract", () => {
  beforeEach(async () => {
    await initDB();
    mockFetch.mockReset();
    vi.mocked(chatCompletion).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses turnieragenda parser for turnieragenda.ch URLs", async () => {
    const tId = seedTournament(todayStr());
    const fakeHtml = `<html><body><table>
      <tr>
        <td>1</td><td>10:00</td><td>Home FC</td><td>2</td><td>:</td><td>1</td><td>Away FC</td>
      </tr>
    </table></body></html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(fakeHtml),
    });

    const result = await crawlAndExtract(tId, "https://www.turnieragenda.ch/de/event/schedule/7918");
    expect(result.success).toBe(true);
    expect(result.entriesUpserted).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // LLM should NOT be called for turnieragenda URLs
    expect(chatCompletion).not.toHaveBeenCalled();

    const entries = getTickerEntries(tId);
    expect(entries).toHaveLength(1);
    expect(entries[0].homeTeam).toBe("Home FC");
  });

  it("uses LLM for non-turnieragenda URLs", async () => {
    const tId = seedTournament(todayStr());
    const fakeHtml = `<html><body><p>Team A vs Team B: 3-2</p></body></html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(fakeHtml),
    });

    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify([
        { match: "Game 1", home: "Team A", away: "Team B", score: "3:2", time: "" },
      ]),
      model: "test",
    });

    const result = await crawlAndExtract(tId, "https://example.com/results");
    expect(result.success).toBe(true);
    expect(result.entriesUpserted).toBe(1);
    expect(chatCompletion).toHaveBeenCalledTimes(1);

    const entries = getTickerEntries(tId);
    expect(entries).toHaveLength(1);
    expect(entries[0].homeTeam).toBe("Team A");
    expect(entries[0].score).toBe("3:2");
  });

  it("returns error result when fetch fails", async () => {
    const tId = seedTournament(todayStr());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await crawlAndExtract(tId, "https://example.com/broken");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.entriesUpserted).toBe(0);
  });
});
