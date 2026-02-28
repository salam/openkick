# Live Ticker & Turnieragenda.ch Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a live match-day ticker system that scrapes turnieragenda.ch (and other tournament sites via LLM), supports manual score entry, and displays results on the public homepage.

**Architecture:** Server-side crawl scheduler (node-cron) fetches tournament pages periodically, extracts scores via cheerio (turnieragenda.ch) or cheerio+LLM (generic), stores in SQLite. Frontend polls a public REST endpoint every 30s. Homepage shows a compact ticker bar during match day, or next/last tournament info when idle.

**Tech Stack:** cheerio, node-cron, existing LLM service, vitest, Next.js (React), existing `apiFetch` client.

**Design doc:** `docs/plans/2026-02-28-live-ticker-turnieragenda-design.md`

---

## Task 1: Install Dependencies

**Files:**
- Modify: `server/package.json`

**Step 1: Install cheerio and node-cron**

```bash
cd server && npm install cheerio node-cron && npm install -D @types/node-cron
```

**Step 2: Verify installation**

```bash
cd server && node -e "require('cheerio'); require('node-cron'); console.log('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore: install cheerio and node-cron for live ticker"
```

---

## Task 2: Database Schema — New Tables

**Files:**
- Modify: `server/src/database.ts` (append to SCHEMA constant, line ~142)

**Step 1: Write the failing test**

Create `server/src/services/__tests__/live-ticker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { initDB, getDB } from "../../database.js";

describe("live-ticker schema", () => {
  beforeEach(async () => {
    await initDB();
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
```

**Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/services/__tests__/live-ticker.test.ts
```

Expected: FAIL — tables don't exist yet.

**Step 3: Add tables to SCHEMA in database.ts**

In `server/src/database.ts`, find the closing backtick of the SCHEMA constant (line ~142, right after the `broadcasts` table). Insert these tables before the closing backtick:

```sql
CREATE TABLE IF NOT EXISTS tournament_results_url (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  crawlIntervalMin INTEGER NOT NULL DEFAULT 10,
  lastCrawledAt TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tournamentId, url)
);

CREATE TABLE IF NOT EXISTS live_ticker_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  matchLabel TEXT,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  score TEXT,
  matchTime TEXT,
  source TEXT NOT NULL DEFAULT 'crawl' CHECK(source IN ('crawl', 'manual')),
  crawledAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_match
  ON live_ticker_entries(tournamentId, homeTeam, awayTeam, matchLabel);

CREATE TABLE IF NOT EXISTS game_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER REFERENCES events(id) ON DELETE SET NULL,
  tournamentName TEXT NOT NULL,
  teamName TEXT,
  date TEXT NOT NULL,
  placeRanking INTEGER,
  isTrophy INTEGER NOT NULL DEFAULT 0,
  trophyType TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_history_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historyId INTEGER NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
  playerInitial TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_history_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historyId INTEGER NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
  matchLabel TEXT,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  score TEXT
);
```

**Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/services/__tests__/live-ticker.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat(db): add live ticker and game history tables" -- server/src/database.ts server/src/services/__tests__/live-ticker.test.ts
```

---

## Task 3: Turnieragenda.ch HTML Parser

**Files:**
- Create: `server/src/services/turnieragenda.parser.ts`
- Create: `server/src/services/__tests__/turnieragenda.parser.test.ts`

**Step 1: Save a sample HTML snapshot for testing**

Fetch and save the HTML from `https://www.turnieragenda.ch/de/event/schedule/7918` to use as a test fixture. Store it at `server/src/services/__tests__/fixtures/turnieragenda-schedule.html`. This should be the actual HTML from the page.

**Step 2: Write the failing test**

Create `server/src/services/__tests__/turnieragenda.parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseTurnieragendaSchedule, isTurnieragendaUrl, extractTurnieragendaEventId } from "../turnieragenda.parser.js";

const FIXTURE_PATH = path.join(__dirname, "fixtures/turnieragenda-schedule.html");

describe("turnieragenda.parser", () => {
  describe("isTurnieragendaUrl", () => {
    it("recognises turnieragenda.ch URLs", () => {
      expect(isTurnieragendaUrl("https://www.turnieragenda.ch/de/event/schedule/7918")).toBe(true);
      expect(isTurnieragendaUrl("https://turnieragenda.ch/event/detail/7918")).toBe(true);
    });

    it("rejects other URLs", () => {
      expect(isTurnieragendaUrl("https://example.com/schedule")).toBe(false);
    });
  });

  describe("extractTurnieragendaEventId", () => {
    it("extracts event ID from URL", () => {
      expect(extractTurnieragendaEventId("https://www.turnieragenda.ch/de/event/schedule/7918")).toBe("7918");
      expect(extractTurnieragendaEventId("https://www.turnieragenda.ch/event/detail/7918")).toBe("7918");
    });
  });

  describe("parseTurnieragendaSchedule", () => {
    it("extracts match results from schedule HTML", () => {
      const html = fs.existsSync(FIXTURE_PATH)
        ? fs.readFileSync(FIXTURE_PATH, "utf-8")
        : `<table class="table"><tbody>
            <tr><td>1</td><td>10:00</td><td>Team A</td><td>2</td><td>:</td><td>1</td><td>Team B</td></tr>
            <tr><td>2</td><td>10:15</td><td>Team C</td><td>0</td><td>:</td><td>0</td><td>Team D</td></tr>
           </tbody></table>`;

      const results = parseTurnieragendaSchedule(html);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("home");
      expect(results[0]).toHaveProperty("away");
      expect(results[0]).toHaveProperty("score");
      expect(results[0]).toHaveProperty("time");
    });

    it("handles matches without scores yet", () => {
      const html = `<table class="table"><tbody>
        <tr><td>1</td><td>10:00</td><td>Team A</td><td></td><td>:</td><td></td><td>Team B</td></tr>
      </tbody></table>`;
      const results = parseTurnieragendaSchedule(html);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe("pending");
    });
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd server && npx vitest run src/services/__tests__/turnieragenda.parser.test.ts
```

Expected: FAIL — module doesn't exist.

**Step 4: Implement the parser**

Create `server/src/services/turnieragenda.parser.ts`:

```typescript
import * as cheerio from "cheerio";

export interface ExtractedMatchResult {
  match: string;
  home: string;
  away: string;
  score: string;
  time: string;
}

/** Check if a URL belongs to turnieragenda.ch */
export function isTurnieragendaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "turnieragenda.ch" || host === "www.turnieragenda.ch";
  } catch {
    return false;
  }
}

/** Extract the numeric event ID from a turnieragenda.ch URL */
export function extractTurnieragendaEventId(url: string): string | null {
  const match = url.match(/\/(?:event\/(?:detail|schedule|schedule-live))\/(\d+)/);
  return match ? match[1] : null;
}

/** Build the schedule URL for a turnieragenda.ch event */
export function buildScheduleUrl(eventId: string): string {
  return `https://www.turnieragenda.ch/de/event/schedule/${eventId}`;
}

/** Build the live schedule URL for a turnieragenda.ch event */
export function buildLiveScheduleUrl(eventId: string): string {
  return `https://www.turnieragenda.ch/de/event/schedule-live/${eventId}`;
}

/**
 * Parse match results from turnieragenda.ch schedule HTML.
 *
 * The schedule pages use HTML tables where each row represents a match.
 * Column layout varies but typically: match#, time, home, homeScore, :, awayScore, away.
 */
export function parseTurnieragendaSchedule(html: string): ExtractedMatchResult[] {
  const $ = cheerio.load(html);
  const results: ExtractedMatchResult[] = [];

  $("table tbody tr, table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;

    const cellTexts = cells.map((_j, cell) => $(cell).text().trim()).get();
    const matchRow = extractMatchFromCells(cellTexts);
    if (matchRow) results.push(matchRow);
  });

  return results;
}

function extractMatchFromCells(cells: string[]): ExtractedMatchResult | null {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === ":" && i > 0 && i < cells.length - 1) {
      const homeScore = cells[i - 1];
      const awayScore = cells[i + 1];
      const home = findTeamName(cells, i - 2, "backward");
      const away = findTeamName(cells, i + 2, "forward");
      if (!home || !away) continue;

      const hasScore = homeScore !== "" && awayScore !== "";
      const score = hasScore ? `${homeScore}:${awayScore}` : "pending";
      const matchNum = cells[0] || "";
      const time = findTime(cells) || "";

      return {
        match: matchNum ? `Game ${matchNum}` : "Match",
        home,
        away,
        score,
        time,
      };
    }

    const scoreMatch = cells[i].match(/^(\d+)\s*:\s*(\d+)$/);
    if (scoreMatch && i > 0 && i < cells.length - 1) {
      const home = findTeamName(cells, i - 1, "backward");
      const away = findTeamName(cells, i + 1, "forward");
      if (!home || !away) continue;

      return {
        match: cells[0] ? `Game ${cells[0]}` : "Match",
        home,
        away,
        score: cells[i],
        time: findTime(cells) || "",
      };
    }
  }
  return null;
}

function findTeamName(cells: string[], startIdx: number, direction: "forward" | "backward"): string | null {
  const idx = Math.max(0, Math.min(startIdx, cells.length - 1));
  const text = cells[idx];
  if (text && !/^\d{1,2}$/.test(text) && !/^\d{1,2}:\d{2}$/.test(text)) {
    return text;
  }
  const nextIdx = direction === "backward" ? idx - 1 : idx + 1;
  if (nextIdx >= 0 && nextIdx < cells.length) {
    const next = cells[nextIdx];
    if (next && !/^\d{1,2}$/.test(next) && !/^\d{1,2}:\d{2}$/.test(next)) {
      return next;
    }
  }
  return null;
}

function findTime(cells: string[]): string | null {
  for (const cell of cells) {
    if (/^\d{1,2}:\d{2}$/.test(cell)) return cell;
  }
  return null;
}
```

**Note:** The actual HTML structure of turnieragenda.ch will need to be verified against the saved fixture. The parser should be adjusted based on the real HTML table layout.

**Step 5: Run test to verify it passes**

```bash
cd server && npx vitest run src/services/__tests__/turnieragenda.parser.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/services/turnieragenda.parser.ts server/src/services/__tests__/turnieragenda.parser.test.ts server/src/services/__tests__/fixtures/
git commit -m "feat: add turnieragenda.ch HTML parser with cheerio"
```

---

## Task 4: Live Ticker Service — Core CRUD

**Files:**
- Create: `server/src/services/live-ticker.service.ts`
- Extend: `server/src/services/__tests__/live-ticker.test.ts`

**Step 1: Write failing tests for the service**

Add to `server/src/services/__tests__/live-ticker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDB, getDB } from "../../database.js";

vi.mock("../llm.js", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "../llm.js";

let getTickerEntries: typeof import("../live-ticker.service.js").getTickerEntries;
let upsertTickerEntry: typeof import("../live-ticker.service.js").upsertTickerEntry;
let getActiveTournamentTickers: typeof import("../live-ticker.service.js").getActiveTournamentTickers;
let setCrawlConfig: typeof import("../live-ticker.service.js").setCrawlConfig;
let getCrawlConfigs: typeof import("../live-ticker.service.js").getCrawlConfigs;

beforeEach(async () => {
  await initDB();
  const mod = await import("../live-ticker.service.js");
  getTickerEntries = mod.getTickerEntries;
  upsertTickerEntry = mod.upsertTickerEntry;
  getActiveTournamentTickers = mod.getActiveTournamentTickers;
  setCrawlConfig = mod.setCrawlConfig;
  getCrawlConfigs = mod.getCrawlConfigs;
  vi.clearAllMocks();
});

afterEach(() => { vi.restoreAllMocks(); });

describe("live-ticker.service", () => {
  function seedTournament(date: string) {
    const db = getDB();
    db.run(`INSERT INTO events (type, title, date) VALUES ('tournament', 'Test Cup', '${date}')`);
    return db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
  }

  describe("upsertTickerEntry", () => {
    it("inserts a new ticker entry", () => {
      const tid = seedTournament("2026-03-01");
      upsertTickerEntry(tid, { match: "Game 1", home: "A", away: "B", score: "1:0", time: "10:00" }, "manual");
      const entries = getTickerEntries(tid);
      expect(entries).toHaveLength(1);
      expect(entries[0].homeTeam).toBe("A");
      expect(entries[0].score).toBe("1:0");
    });

    it("updates existing entry on same match", () => {
      const tid = seedTournament("2026-03-01");
      upsertTickerEntry(tid, { match: "Game 1", home: "A", away: "B", score: "0:0", time: "10:00" }, "crawl");
      upsertTickerEntry(tid, { match: "Game 1", home: "A", away: "B", score: "2:1", time: "10:00" }, "crawl");
      const entries = getTickerEntries(tid);
      expect(entries).toHaveLength(1);
      expect(entries[0].score).toBe("2:1");
    });
  });

  describe("setCrawlConfig / getCrawlConfigs", () => {
    it("stores and retrieves crawl config", () => {
      const tid = seedTournament("2026-03-01");
      setCrawlConfig(tid, "https://www.turnieragenda.ch/de/event/schedule/7918", 10);
      const configs = getCrawlConfigs(tid);
      expect(configs).toHaveLength(1);
      expect(configs[0].url).toContain("turnieragenda.ch");
      expect(configs[0].crawlIntervalMin).toBe(10);
    });
  });

  describe("getActiveTournamentTickers", () => {
    it("returns entries for tournaments happening today", () => {
      const today = new Date().toISOString().split("T")[0];
      const tid = seedTournament(today);
      upsertTickerEntry(tid, { match: "Game 1", home: "X", away: "Y", score: "3:0", time: "11:00" }, "manual");

      const active = getActiveTournamentTickers();
      expect(active.length).toBeGreaterThan(0);
      expect(active[0].entries).toHaveLength(1);
    });

    it("does not return entries for past tournaments", () => {
      const tid = seedTournament("2020-01-01");
      upsertTickerEntry(tid, { match: "Game 1", home: "X", away: "Y", score: "1:0", time: "10:00" }, "manual");
      const active = getActiveTournamentTickers();
      expect(active).toHaveLength(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd server && npx vitest run src/services/__tests__/live-ticker.test.ts
```

**Step 3: Implement live-ticker.service.ts**

Create `server/src/services/live-ticker.service.ts` with these exports:
- `getTickerEntries(tournamentId)` — SELECT from live_ticker_entries
- `upsertTickerEntry(tournamentId, match, source)` — INSERT ... ON CONFLICT DO UPDATE
- `getActiveTournamentTickers()` — join events (today + tournament) with ticker entries
- `setCrawlConfig(tournamentId, url, intervalMin)` — INSERT ... ON CONFLICT DO UPDATE
- `getCrawlConfigs(tournamentId)` — SELECT from tournament_results_url
- `removeCrawlConfig(id)` — UPDATE isActive = 0
- `updateLastCrawled(configId)` — UPDATE lastCrawledAt
- `getDueCrawlUrls()` — join events (today) with tournament_results_url (due)

Use the `rowsToObjects` helper pattern from the existing codebase (convert sql.js column/values to objects). Use parameterized queries for all user input.

**Step 4: Run tests to verify they pass**

```bash
cd server && npx vitest run src/services/__tests__/live-ticker.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/live-ticker.service.ts server/src/services/__tests__/live-ticker.test.ts
git commit -m "feat: add live ticker service with CRUD, upsert, and active ticker queries"
```

---

## Task 5: Crawl Engine — Fetch + Extract Pipeline

**Files:**
- Modify: `server/src/services/live-ticker.service.ts`
- Extend: `server/src/services/__tests__/live-ticker.test.ts`

**Step 1: Write failing test for crawlAndExtract**

Add to `server/src/services/__tests__/live-ticker.test.ts`:

```typescript
describe("crawlAndExtract", () => {
  it("uses turnieragenda parser for turnieragenda.ch URLs", async () => {
    const tid = seedTournament("2026-03-01");
    const fakeHtml = `<table><tbody>
      <tr><td>1</td><td>10:00</td><td>FC Test</td><td>2</td><td>:</td><td>1</td><td>SC Demo</td></tr>
    </tbody></table>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(fakeHtml, { status: 200 }));

    const mod = await import("../live-ticker.service.js");
    const result = await mod.crawlAndExtract(tid, "https://www.turnieragenda.ch/de/event/schedule/7918");
    expect(result.success).toBe(true);
    expect(result.entriesUpserted).toBeGreaterThan(0);
  });

  it("uses LLM extraction for non-turnieragenda URLs", async () => {
    const tid = seedTournament("2026-03-01");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html><body>Team A 2:1 Team B</body></html>", { status: 200 }));
    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify([{ match: "Game 1", home: "Team A", away: "Team B", score: "2:1", time: "10:00" }]),
      model: "test",
    });

    const mod = await import("../live-ticker.service.js");
    const result = await mod.crawlAndExtract(tid, "https://example.com/tournament");
    expect(result.success).toBe(true);
    expect(chatCompletion).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/services/__tests__/live-ticker.test.ts
```

**Step 3: Implement crawlAndExtract**

Add to `server/src/services/live-ticker.service.ts`:
- Import cheerio and turnieragenda parser
- Import chatCompletion from llm.js
- Add a `SCORE_EXTRACTION_PROMPT` constant for LLM extraction
- Implement `crawlAndExtract(tournamentId, url)`:
  1. Fetch URL with `fetch()` (15s timeout, User-Agent header)
  2. If turnieragenda URL → use `parseTurnieragendaSchedule(html)`
  3. Otherwise → strip HTML with cheerio, send text to LLM, parse JSON response
  4. Upsert each extracted match into ticker entries
  5. Return `CrawlResult` with success/error info

**Step 4: Run tests**

```bash
cd server && npx vitest run src/services/__tests__/live-ticker.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: add crawlAndExtract with turnieragenda.ch and LLM pipelines" -- server/src/services/live-ticker.service.ts server/src/services/__tests__/live-ticker.test.ts
```

---

## Task 6: Crawl Scheduler (node-cron)

**Files:**
- Create: `server/src/services/crawl-scheduler.ts`
- Modify: `server/src/index.ts` (start scheduler after DB init)

**Step 1: Implement the scheduler**

Create `server/src/services/crawl-scheduler.ts`:
- Import `cron` from `node-cron`
- Import `getDueCrawlUrls`, `crawlAndExtract`, `updateLastCrawled` from live-ticker service
- `startCrawlScheduler()` — schedules `* * * * *` (every minute), queries due URLs, crawls each, updates lastCrawledAt
- `stopCrawlScheduler()` — stops the cron task
- Log crawl results to console

**Step 2: Register scheduler in index.ts**

In `server/src/index.ts`, import and call `startCrawlScheduler()` after DB init (same location as `startHolidaySyncScheduler()`).

**Step 3: Verify compilation**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git restore --staged :/ && git add server/src/services/crawl-scheduler.ts server/src/index.ts
git commit -m "feat: add cron-based crawl scheduler for live ticker"
```

---

## Task 7: Live Ticker REST Routes

**Files:**
- Create: `server/src/routes/live-ticker.routes.ts`
- Create: `server/src/routes/__tests__/live-ticker.test.ts`
- Modify: `server/src/index.ts` (register route)

**Step 1: Write failing route tests**

Create `server/src/routes/__tests__/live-ticker.test.ts` following the existing pattern (in-process HTTP server with `createServer`, random port, native `fetch`):

Test cases:
- `GET /api/live-ticker/active` → 200, empty array
- `GET /api/live-ticker/:id` → 200, returns entries
- `POST /api/live-ticker/:id/manual` → 201, creates manual entry
- `PUT /api/live-ticker/:id/crawl-config` → 200, sets config

**Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/routes/__tests__/live-ticker.test.ts
```

**Step 3: Implement the route file**

Create `server/src/routes/live-ticker.routes.ts` exporting `liveTickerRouter`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/live-ticker/active` | Public: active tournament tickers |
| GET | `/live-ticker/:tournamentId` | Public: entries for one tournament |
| POST | `/live-ticker/:tournamentId/manual` | Coach: add manual score |
| PUT | `/live-ticker/:tournamentId/crawl-config` | Coach: set crawl URL |
| GET | `/live-ticker/:tournamentId/crawl-configs` | Coach: list crawl configs |
| DELETE | `/live-ticker/crawl-config/:id` | Coach: disable crawl config |
| POST | `/live-ticker/:tournamentId/crawl-now` | Coach: trigger immediate crawl |

All handlers use the service functions from Task 4/5. Validate `tournamentId` is numeric. Return appropriate status codes.

**Step 4: Register route in index.ts**

```typescript
import { liveTickerRouter } from "./routes/live-ticker.routes.js";
app.use("/api", liveTickerRouter);
```

**Step 5: Run tests**

```bash
cd server && npx vitest run src/routes/__tests__/live-ticker.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/routes/live-ticker.routes.ts server/src/routes/__tests__/live-ticker.test.ts server/src/index.ts
git commit -m "feat: add live ticker REST routes (public + coach endpoints)"
```

---

## Task 8: Game History Service & Routes

**Files:**
- Create: `server/src/services/game-history.service.ts`
- Create: `server/src/services/__tests__/game-history.test.ts`
- Create: `server/src/routes/game-history.routes.ts`
- Create: `server/src/routes/__tests__/game-history.test.ts`
- Modify: `server/src/index.ts` (register route)

Follow the same TDD pattern as Tasks 4–7.

**Service functions:**
- `createHistoryEntry(tournamentName, date, teamName?, placeRanking?)` — INSERT into game_history
- `addHistoryPlayers(historyId, initials[])` — INSERT into game_history_players
- `addHistoryMatches(historyId, matches[])` — INSERT into game_history_matches
- `getHistoryEntries()` — list all with joined players and matches
- `getHistoryEntry(id)` — single entry with players and matches
- `getLatestHistory()` — most recent entry (for homepage widget)
- `setTrophy(id, trophyType)` — UPDATE isTrophy and trophyType
- `archiveTournament(tournamentId)` — copy ticker entries into history tables
- `deleteHistoryEntry(id)` — DELETE

**Routes (gameHistoryRouter):**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/game-history` | Public: list all |
| GET | `/game-history/latest` | Public: most recent |
| GET | `/game-history/:id` | Public: single entry |
| POST | `/game-history` | Coach: create |
| PUT | `/game-history/:id/trophy` | Coach: set trophy |
| POST | `/game-history/archive/:tournamentId` | Coach: archive tournament |
| DELETE | `/game-history/:id` | Coach: delete |

Register `app.use("/api", gameHistoryRouter)` in index.ts.

**Commit:**

```bash
git restore --staged :/ && git add server/src/services/game-history.service.ts server/src/services/__tests__/game-history.test.ts server/src/routes/game-history.routes.ts server/src/routes/__tests__/game-history.test.ts server/src/index.ts
git commit -m "feat: add game history service and routes with trophy management"
```

---

## Task 9: Homepage Tournament Widget (Frontend)

**Files:**
- Create: `web/src/components/TournamentWidget.tsx`
- Create: `web/src/components/LiveTickerBar.tsx`
- Modify: `web/src/app/page.tsx`

**Step 1: Create LiveTickerBar component**

Create `web/src/components/LiveTickerBar.tsx`:
- `'use client'` component
- Polls `GET /api/live-ticker/active` every 30 seconds
- Flattens all entries across active tournaments
- Shows one match at a time, auto-rotates every 5 seconds
- Display: green pulsing dot + "Live" label + `homeTeam score awayTeam` + match time
- Wraps in a `<Link>` to `/live/{tournamentId}`
- Styled with emerald green accent (matches existing palette)
- Returns `null` when no active entries

**Step 2: Create TournamentWidget (wrapper)**

Create `web/src/components/TournamentWidget.tsx`:
- `'use client'` component
- Checks if there are active tickers → renders `<LiveTickerBar />`
- If no active tickers → renders two cards:
  - "Next Tournament" card: fetches from `GET /api/events?type=tournament`, shows first future event with date + location
  - "Last Tournament" card: fetches from `GET /api/game-history/latest`, shows name + ranking
- Uses `useEffect` + `fetch` pattern (no auth needed — public endpoints)

**Step 3: Add TournamentWidget to homepage**

In `web/src/app/page.tsx`, import `TournamentWidget` and add it between the nav links and `<SubscribeCard />`.

**Step 4: Verify it compiles**

```bash
cd web && npx next build
```

Expected: Build succeeds

**Step 5: Commit**

```bash
git restore --staged :/ && git add web/src/components/LiveTickerBar.tsx web/src/components/TournamentWidget.tsx web/src/app/page.tsx
git commit -m "feat(ui): add live ticker bar and tournament widget to homepage"
```

---

## Task 10: Public Live Detail Page

**Files:**
- Create: `web/src/app/live/[tournamentId]/page.tsx`
- Create: `web/src/app/live/layout.tsx`
- Create: `web/src/components/LiveTickerDetail.tsx`

**Step 1: Create the detail component**

Create `web/src/components/LiveTickerDetail.tsx`:
- `'use client'` component accepting `tournamentId` prop
- Fetches `GET /api/live-ticker/{tournamentId}` on mount + every 30s
- Displays all matches in a card grid
- Groups matches by phase if matchLabel contains group/semi/final keywords
- Shows group standings table (computed from scores)
- Auto-refreshes indicator ("Last updated: X seconds ago")
- Loading and empty states

**Step 2: Create the public layout (no AuthGuard)**

Create `web/src/app/live/layout.tsx` — no `<AuthGuard>`, minimal wrapper with centered content.

**Step 3: Create the page**

Create `web/src/app/live/[tournamentId]/page.tsx` — renders `<LiveTickerDetail>` with the route param.

**Step 4: Verify build**

```bash
cd web && npx next build
```

**Step 5: Commit**

```bash
git restore --staged :/ && git add web/src/app/live/ web/src/components/LiveTickerDetail.tsx
git commit -m "feat(ui): add public live tournament detail page at /live/:id"
```

---

## Task 11: Run Full Test Suite & Verify Build

**Step 1: Run all server tests**

```bash
cd server && npx vitest run
```

Expected: All tests pass.

**Step 2: Run TypeScript compilation**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Build frontend**

```bash
cd web && npx next build
```

Expected: Build succeeds.

**Step 4: Update FEATURES.md and RELEASE_NOTES.md**

Add live ticker feature entries to both files.

**Step 5: Final commit**

```bash
git add FEATURES.md RELEASE_NOTES.md
git commit -m "docs: add live ticker to features and release notes"
```

---

## Task Summary

| # | Task | Est. Files |
|---|------|-----------|
| 1 | Install dependencies | 2 |
| 2 | Database schema (5 tables) | 2 |
| 3 | Turnieragenda.ch parser | 3 |
| 4 | Live ticker service (CRUD) | 2 |
| 5 | Crawl engine (fetch + extract) | 2 |
| 6 | Crawl scheduler (cron) | 2 |
| 7 | Live ticker routes | 3 |
| 8 | Game history service & routes | 5 |
| 9 | Homepage widget (frontend) | 3 |
| 10 | Public live detail page | 3 |
| 11 | Full test suite & docs | 2 |
