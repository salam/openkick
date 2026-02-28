import { getDB } from "../database.js";
import { chatCompletion } from "./llm.js";
import {
  parseTurnieragendaSchedule,
  isTurnieragendaUrl,
  type ExtractedMatchResult,
} from "./turnieragenda.parser.js";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TickerEntry {
  id: number;
  tournamentId: number;
  matchLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  score: string | null;
  matchTime: string | null;
  source: "crawl" | "manual";
  crawledAt: string;
  updatedAt: string;
}

export interface TournamentCrawlConfig {
  id: number;
  tournamentId: number;
  url: string;
  crawlIntervalMin: number;
  lastCrawledAt: string | null;
  isActive: number;
}

export interface ActiveTournamentTicker {
  tournamentId: number;
  tournamentTitle: string;
  date: string;
  entries: TickerEntry[];
}

export interface CrawlResult {
  tournamentId: number;
  url: string;
  success: boolean;
  entriesUpserted: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// CRUD — Ticker Entries
// ---------------------------------------------------------------------------

/**
 * Returns all ticker entries for a given tournament, ordered by matchTime ASC.
 */
export function getTickerEntries(tournamentId: number): TickerEntry[] {
  const db = getDB();
  const stmt = db.prepare(
    "SELECT * FROM live_ticker_entries WHERE tournamentId = ? ORDER BY matchTime ASC",
  );
  stmt.bind([tournamentId]);
  const entries: TickerEntry[] = [];
  while (stmt.step()) {
    entries.push(stmt.getAsObject() as unknown as TickerEntry);
  }
  stmt.free();
  return entries;
}

/**
 * Insert or update a ticker entry. Uses the unique index
 * idx_ticker_match(tournamentId, homeTeam, awayTeam, matchLabel) to detect
 * duplicates and update the score / matchTime on conflict.
 */
export function upsertTickerEntry(
  tournamentId: number,
  match: ExtractedMatchResult,
  source: "crawl" | "manual",
): void {
  const db = getDB();
  db.run(
    `INSERT INTO live_ticker_entries (tournamentId, matchLabel, homeTeam, awayTeam, score, matchTime, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tournamentId, homeTeam, awayTeam, matchLabel) DO UPDATE SET
       score = excluded.score,
       matchTime = excluded.matchTime,
       updatedAt = datetime('now')`,
    [
      tournamentId,
      match.match || null,
      match.home,
      match.away,
      match.score,
      match.time || null,
      source,
    ],
  );
}

// ---------------------------------------------------------------------------
// CRUD — Active Tournament Tickers
// ---------------------------------------------------------------------------

/**
 * Returns today's tournaments that have at least one ticker entry.
 */
export function getActiveTournamentTickers(): ActiveTournamentTicker[] {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  const stmt = db.prepare(
    `SELECT id, title, date FROM events
     WHERE type = 'tournament' AND date = ?`,
  );
  stmt.bind([today]);

  const tournaments: { id: number; title: string; date: string }[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { id: number; title: string; date: string };
    tournaments.push(row);
  }
  stmt.free();

  const result: ActiveTournamentTicker[] = [];
  for (const t of tournaments) {
    const entries = getTickerEntries(t.id);
    if (entries.length > 0) {
      result.push({
        tournamentId: t.id,
        tournamentTitle: t.title,
        date: t.date,
        entries,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// CRUD — Crawl Configs
// ---------------------------------------------------------------------------

/**
 * Insert or update a crawl config for a tournament URL.
 */
export function setCrawlConfig(
  tournamentId: number,
  url: string,
  intervalMin = 10,
): void {
  const db = getDB();
  db.run(
    `INSERT INTO tournament_results_url (tournamentId, url, crawlIntervalMin)
     VALUES (?, ?, ?)
     ON CONFLICT(tournamentId, url) DO UPDATE SET
       crawlIntervalMin = excluded.crawlIntervalMin,
       isActive = 1`,
    [tournamentId, url, intervalMin],
  );
}

/**
 * Returns active crawl configs for a tournament.
 */
export function getCrawlConfigs(tournamentId: number): TournamentCrawlConfig[] {
  const db = getDB();
  const stmt = db.prepare(
    "SELECT * FROM tournament_results_url WHERE tournamentId = ? AND isActive = 1",
  );
  stmt.bind([tournamentId]);
  const configs: TournamentCrawlConfig[] = [];
  while (stmt.step()) {
    configs.push(stmt.getAsObject() as unknown as TournamentCrawlConfig);
  }
  stmt.free();
  return configs;
}

/**
 * Deactivates a crawl config (soft-delete).
 */
export function removeCrawlConfig(id: number): void {
  const db = getDB();
  db.run("UPDATE tournament_results_url SET isActive = 0 WHERE id = ?", [id]);
}

/**
 * Updates the lastCrawledAt timestamp for a crawl config.
 */
export function updateLastCrawled(configId: number): void {
  const db = getDB();
  db.run(
    "UPDATE tournament_results_url SET lastCrawledAt = datetime('now') WHERE id = ?",
    [configId],
  );
}

/**
 * Returns crawl configs that are due for crawling:
 * - Tournament is today and type = 'tournament'
 * - Config is active
 * - Either never crawled, or crawled longer ago than crawlIntervalMin
 */
export function getDueCrawlUrls(): TournamentCrawlConfig[] {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  const stmt = db.prepare(
    `SELECT c.* FROM tournament_results_url c
     JOIN events e ON e.id = c.tournamentId
     WHERE e.type = 'tournament'
       AND e.date = ?
       AND c.isActive = 1
       AND (
         c.lastCrawledAt IS NULL
         OR datetime(c.lastCrawledAt, '+' || c.crawlIntervalMin || ' minutes') <= datetime('now')
       )`,
  );
  stmt.bind([today]);

  const configs: TournamentCrawlConfig[] = [];
  while (stmt.step()) {
    configs.push(stmt.getAsObject() as unknown as TournamentCrawlConfig);
  }
  stmt.free();
  return configs;
}

// ---------------------------------------------------------------------------
// Crawl Engine — Fetch + Extract Pipeline (Task 5)
// ---------------------------------------------------------------------------

const LLM_SYSTEM_PROMPT =
  "You are a sports score extractor. Given the text content of a tournament results page, extract all match results as a JSON array. Each entry: { match, home, away, score, time }. Return ONLY the JSON array.";

/**
 * Fetches a URL, extracts match results, and upserts them into the ticker.
 *
 * - For turnieragenda.ch URLs, uses the dedicated HTML parser.
 * - For other URLs, strips HTML with cheerio and sends text to the LLM.
 */
export async function crawlAndExtract(
  tournamentId: number,
  url: string,
): Promise<CrawlResult> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "OpenKick-LiveTicker/1.0" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        tournamentId,
        url,
        success: false,
        entriesUpserted: 0,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    let matches: ExtractedMatchResult[];

    if (isTurnieragendaUrl(url)) {
      matches = parseTurnieragendaSchedule(html);
    } else {
      // Strip HTML, extract text
      const $ = cheerio.load(html);
      const textContent = $("body").text().replace(/\s+/g, " ").trim();

      const llmResponse = await chatCompletion([
        { role: "system", content: LLM_SYSTEM_PROMPT },
        { role: "user", content: textContent },
      ]);

      try {
        matches = JSON.parse(llmResponse.content) as ExtractedMatchResult[];
      } catch {
        return {
          tournamentId,
          url,
          success: false,
          entriesUpserted: 0,
          error: "Failed to parse LLM response as JSON",
        };
      }
    }

    let upserted = 0;
    for (const m of matches) {
      upsertTickerEntry(tournamentId, m, "crawl");
      upserted++;
    }

    return {
      tournamentId,
      url,
      success: true,
      entriesUpserted: upserted,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      tournamentId,
      url,
      success: false,
      entriesUpserted: 0,
      error: message,
    };
  }
}
