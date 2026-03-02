# Blueprint: Live Ticker & Game History

> **Module**: Live match-day scores, game history, trophy cabinet
> **PRD reference**: Section 4.5.2 (Tournament Management — live ticker, game history, trophy cabinet)
> **Integration research**: `docs/INTEGRATION_RESEARCH.md` section 6 (Brave Search API)

---

## 1. Module Overview

On match day, a scheduler (cron job) periodically fetches tournament result pages from the web, sends the raw page text to the configured LLM, and extracts structured match scores. These scores are displayed as a live ticker on the tournament detail page.

After the match day ends (configurable cutoff time), the system copies the final ticker entries into permanent game history records. Coaches can mark history entries as trophies (1st place, 2nd place, fair-play award, etc.). A "History" tab on the website shows all past tournaments chronologically with participant initials.

**Important**: Brave Search API is a search engine, NOT a web scraper. It cannot fetch page content. Use it only for URL discovery (helping coaches find the results URL for a tournament). For actual page content, use `axios` + `cheerio` (static HTML) or `puppeteer` (JavaScript-rendered pages).

---

## 2. Dependencies

### New npm packages to install

```bash
npm install cheerio node-cron
npm install -D @types/node-cron
# Optional — only if JS-heavy tournament pages are common:
npm install puppeteer
```

### Already available in the project

| Package | Purpose |
|---------|---------|
| `axios` | HTTP client (already used for WAHA calls) |
| `express` | Route handlers |
| `sql.js` | Database |
| `vitest` | Tests |

### External services used

| Service | Purpose | Notes |
|---------|---------|-------|
| Configured LLM (OpenAI / Claude / Euria) | Extract structured scores from raw page text | Uses existing `chatCompletion()` from `server/src/services/llm.ts` |
| Brave Search API | URL discovery only (optional) | Free tier: 2,000 queries/month, 1 req/s. See `docs/INTEGRATION_RESEARCH.md` section 6 |

---

## 3. File Structure

```
server/src/
  services/
    live-ticker.service.ts          # Crawl scheduler, page fetcher, LLM score extraction
    brave-search.service.ts         # URL discovery helper (optional, for finding result URLs)
    game-history.service.ts         # Store final results, trophy management
    __tests__/
      live-ticker.test.ts
      brave-search.test.ts
      game-history.test.ts
  routes/
    live-ticker.routes.ts           # SSE or polling endpoint for frontend
    game-history.routes.ts          # History CRUD + trophy marking
    __tests__/
      live-ticker.test.ts
      game-history.test.ts
```

---

## 4. Database Schema

Add these tables to the schema in `server/src/database.ts`. Follow the existing pattern (all tables in the `SCHEMA` constant, `CREATE TABLE IF NOT EXISTS`).

```sql
-- URL to crawl for each tournament event
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

-- Live ticker entries (scores as they come in during match day)
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

-- Unique constraint: one score per match per tournament (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_match
  ON live_ticker_entries(tournamentId, homeTeam, awayTeam, matchLabel);

-- Permanent game history (filled at end of match day)
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

-- Participant initials for privacy (first-name initial + optional last-name initial)
CREATE TABLE IF NOT EXISTS game_history_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historyId INTEGER NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
  playerInitial TEXT NOT NULL
);

-- Individual match results stored with the history entry
CREATE TABLE IF NOT EXISTS game_history_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historyId INTEGER NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
  matchLabel TEXT,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  score TEXT
);
```

---

## 5. TypeScript Interfaces

Place these in the respective service files.

```typescript
// ── live-ticker.service.ts ──────────────────────────────────────────

/** A single match result extracted by the LLM from a crawled page. */
export interface ExtractedMatchResult {
  match: string;        // e.g. "Group A, Game 3" or "Semi-final"
  home: string;         // home team name
  away: string;         // away team name
  score: string;        // e.g. "2:1", "0:0", "pending"
  time: string;         // e.g. "10:30", "14:00", or empty string
}

/** A ticker entry as stored in the database. */
export interface TickerEntry {
  id: number;
  tournamentId: number;
  matchLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  score: string | null;
  matchTime: string | null;
  source: 'crawl' | 'manual';
  crawledAt: string;
  updatedAt: string;
}

/** Configuration for a tournament's crawl URL. */
export interface TournamentCrawlConfig {
  id: number;
  tournamentId: number;
  url: string;
  crawlIntervalMin: number;
  lastCrawledAt: string | null;
  isActive: boolean;
}

/** Result of a single crawl cycle. */
export interface CrawlResult {
  tournamentId: number;
  url: string;
  success: boolean;
  entriesUpserted: number;
  error?: string;
}

// ── game-history.service.ts ─────────────────────────────────────────

export interface GameHistoryEntry {
  id: number;
  tournamentId: number | null;
  tournamentName: string;
  teamName: string | null;
  date: string;
  placeRanking: number | null;
  isTrophy: boolean;
  trophyType: string | null;
  notes: string | null;
  createdAt: string;
  players: string[];        // array of initials, e.g. ["J.", "L. M.", "K."]
  matches: GameHistoryMatch[];
}

export interface GameHistoryMatch {
  id: number;
  historyId: number;
  matchLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  score: string | null;
}

export type TrophyType =
  | 'first_place'
  | 'second_place'
  | 'third_place'
  | 'fair_play'
  | 'best_scorer'
  | 'other';

// ── brave-search.service.ts ─────────────────────────────────────────

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}
```

---

## 6. Crawl Architecture

### 6.1 Scheduler

Use `node-cron` to run a check every minute. The job queries `tournament_results_url` for active URLs whose `lastCrawledAt` is older than their `crawlIntervalMin`, and whose linked tournament event is happening today (within the event's date/time window).

```typescript
import cron from 'node-cron';

// Run every minute — the actual crawl frequency is controlled per-URL
// by the crawlIntervalMin column
cron.schedule('* * * * *', async () => {
  await crawlDueUrls();
});
```

**`crawlDueUrls()`** logic:

1. Query tournaments where `events.date` is today AND `events.type = 'tournament'`.
2. Join with `tournament_results_url` where `isActive = 1`.
3. Filter rows where `lastCrawledAt IS NULL` or `lastCrawledAt < datetime('now', '-' || crawlIntervalMin || ' minutes')`.
4. For each qualifying row, call `crawlAndExtract(tournamentId, url)`.
5. Update `lastCrawledAt` after each crawl attempt (success or fail).

### 6.2 Page Fetching (two-tier strategy)

Try the lightweight approach first. Fall back to headless browser only when needed.

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Tier 1: Static fetch with axios + cheerio.
 * Strips scripts, styles, nav, footer, header — returns plain text.
 */
async function fetchPageText(url: string): Promise<string> {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'OpenKickBot/1.0' },
    timeout: 15_000,
  });
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

/**
 * Tier 2: Headless browser for JS-rendered pages.
 * Only used when Tier 1 returns empty or near-empty text.
 */
async function fetchPageTextWithPuppeteer(url: string): Promise<string> {
  // Dynamic import so puppeteer is optional at runtime
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('OpenKickBot/1.0');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
    const text = await page.evaluate(() => document.body.innerText);
    return text.replace(/\s+/g, ' ').trim();
  } finally {
    await browser.close();
  }
}

/**
 * Combined fetch: try static first, fall back to puppeteer if result
 * is suspiciously short (< 100 chars usually means JS-only page).
 */
export async function fetchTournamentPageText(url: string): Promise<string> {
  const MIN_TEXT_LENGTH = 100;

  try {
    const text = await fetchPageText(url);
    if (text.length >= MIN_TEXT_LENGTH) return text;
  } catch (err) {
    // Static fetch failed — try puppeteer below
  }

  // Fallback: puppeteer (wrapped in try/catch; if puppeteer is not
  // installed, this throws and the caller handles the error)
  return fetchPageTextWithPuppeteer(url);
}
```

### 6.3 LLM Score Extraction

Use the existing `chatCompletion()` function from `server/src/services/llm.ts`. The LLM is provider-agnostic (OpenAI, Claude, or Euria — whichever the club has configured in settings).

```typescript
import { chatCompletion, type LLMMessage } from './llm.js';

const EXTRACTION_SYSTEM_PROMPT = `You are a sports results extractor.
You receive raw text from a youth football tournament results page.
Extract all match results you can find.

Return ONLY a valid JSON array with this exact structure:
[
  {
    "match": "<match label, e.g. 'Group A Game 1' or 'Semi-final'>",
    "home": "<home team name>",
    "away": "<away team name>",
    "score": "<score, e.g. '2:1' or 'pending' if not played yet>",
    "time": "<kick-off time if available, e.g. '10:30', otherwise empty string>"
  }
]

Rules:
- If no results are found, return an empty array: []
- Do NOT invent results. Only extract what is explicitly on the page.
- Normalise team names (trim whitespace, consistent capitalisation).
- Use colon notation for scores (e.g. "2:1", not "2-1").
- If a match has not been played yet, set score to "pending".`;

export async function extractScoresFromText(
  pageText: string,
): Promise<ExtractedMatchResult[]> {
  // Truncate very long pages to avoid token limits (keep first ~8000 chars)
  const truncated = pageText.slice(0, 8000);

  const messages: LLMMessage[] = [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: truncated },
  ];

  const response = await chatCompletion(messages);
  const content = response.content.trim();

  // Extract JSON from response (LLM may wrap it in markdown code fences)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed as ExtractedMatchResult[];
  } catch {
    return [];
  }
}
```

### 6.4 Upsert Logic

After extracting scores, upsert (insert or replace) into `live_ticker_entries`. The unique index on `(tournamentId, homeTeam, awayTeam, matchLabel)` serves as the conflict target.

```typescript
export function upsertTickerEntry(
  tournamentId: number,
  result: ExtractedMatchResult,
  source: 'crawl' | 'manual' = 'crawl',
): void {
  const db = getDB();
  db.run(
    `INSERT INTO live_ticker_entries
       (tournamentId, matchLabel, homeTeam, awayTeam, score, matchTime, source, crawledAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(tournamentId, homeTeam, awayTeam, matchLabel)
     DO UPDATE SET
       score = excluded.score,
       matchTime = excluded.matchTime,
       updatedAt = datetime('now')`,
    [
      tournamentId,
      result.match || null,
      result.home,
      result.away,
      result.score || null,
      result.time || null,
      source,
    ],
  );
}
```

### 6.5 Full Crawl Cycle

```typescript
export async function crawlAndExtract(
  tournamentId: number,
  url: string,
): Promise<CrawlResult> {
  try {
    const pageText = await fetchTournamentPageText(url);
    const results = await extractScoresFromText(pageText);

    for (const r of results) {
      upsertTickerEntry(tournamentId, r, 'crawl');
    }

    return {
      tournamentId,
      url,
      success: true,
      entriesUpserted: results.length,
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
```

---

## 7. Brave Search Service (Optional URL Discovery)

This service helps coaches find the results URL for a tournament. It is NOT used for crawling page content. Brave Search is a search engine — it returns search result links, not page bodies.

```typescript
// server/src/services/brave-search.service.ts

export async function discoverTournamentUrl(
  query: string,
  count = 5,
): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_API_KEY not configured');
  }

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data.web?.results ?? []).map((r: any) => ({
    title: r.title,
    url: r.url,
    description: r.description ?? '',
  }));
}
```

### Usage

A coach uses the admin UI to search for "Juniorenturnier Winterthur 2026 Ergebnisse". The service returns candidate URLs. The coach picks one, and it is saved to `tournament_results_url`. From that point on, the crawler uses that URL directly.

---

## 8. API Endpoints

### 8.1 Live Ticker Routes (`server/src/routes/live-ticker.routes.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/tournaments/:id/live` | Public | Current ticker entries for a tournament (polling) |
| `GET` | `/api/tournaments/:id/live/stream` | Public | SSE stream of ticker updates (optional, stretch goal) |
| `POST` | `/api/admin/tournaments/:id/scores` | Coach/Admin | Manual score entry (fallback when crawl fails) |
| `GET` | `/api/admin/tournaments/:id/crawl-config` | Coach/Admin | Get crawl URL config for a tournament |
| `POST` | `/api/admin/tournaments/:id/crawl-config` | Coach/Admin | Set/update crawl URL for a tournament |
| `POST` | `/api/admin/tournaments/:id/crawl-now` | Coach/Admin | Trigger an immediate crawl (bypass scheduler) |
| `POST` | `/api/admin/search-tournament-url` | Coach/Admin | Brave Search URL discovery |

#### GET `/api/tournaments/:id/live`

**Response** `200`:
```json
{
  "tournamentId": 42,
  "lastUpdated": "2026-03-15T11:30:00Z",
  "entries": [
    {
      "id": 1,
      "matchLabel": "Group A, Game 1",
      "homeTeam": "FC Example E1",
      "awayTeam": "FC Rival",
      "score": "2:1",
      "matchTime": "09:00",
      "source": "crawl",
      "updatedAt": "2026-03-15T11:30:00Z"
    }
  ]
}
```

#### POST `/api/admin/tournaments/:id/scores`

**Request body**:
```json
{
  "matchLabel": "Semi-final",
  "homeTeam": "FC Example E1",
  "awayTeam": "FC Opponent",
  "score": "3:0",
  "matchTime": "14:00"
}
```

**Response** `201`: the created/updated ticker entry.

#### POST `/api/admin/tournaments/:id/crawl-config`

**Request body**:
```json
{
  "url": "https://fussball.de/tournament/xyz/results",
  "crawlIntervalMin": 10
}
```

#### POST `/api/admin/search-tournament-url`

**Request body**:
```json
{
  "query": "Juniorenturnier Winterthur 2026 Ergebnisse"
}
```

**Response** `200`:
```json
{
  "results": [
    { "title": "Ergebnisse - Juniorenturnier Winterthur", "url": "https://...", "description": "..." }
  ]
}
```

### 8.2 Game History Routes (`server/src/routes/game-history.routes.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/history` | Public | All game history entries, filterable by season/year |
| `GET` | `/api/history/:id` | Public | Single history entry with players and matches |
| `POST` | `/api/admin/history` | Coach/Admin | Create history entry manually |
| `PUT` | `/api/admin/history/:id` | Coach/Admin | Update history entry |
| `POST` | `/api/admin/history/:id/trophy` | Coach/Admin | Mark/unmark as trophy |
| `DELETE` | `/api/admin/history/:id` | Admin | Delete history entry |

#### GET `/api/history`

**Query params**: `?season=2025-2026` or `?year=2026`

**Response** `200`:
```json
[
  {
    "id": 1,
    "tournamentName": "Juniorenturnier Winterthur",
    "teamName": "FC Example E1",
    "date": "2026-03-15",
    "placeRanking": 1,
    "isTrophy": true,
    "trophyType": "first_place",
    "notes": "Undefeated!",
    "players": ["J.", "L. M.", "K.", "F. H."],
    "matches": [
      { "matchLabel": "Final", "homeTeam": "FC Example E1", "awayTeam": "FC Rival", "score": "2:0" }
    ]
  }
]
```

#### POST `/api/admin/history/:id/trophy`

**Request body**:
```json
{
  "isTrophy": true,
  "trophyType": "first_place"
}
```

---

## 9. Auto-Store Flow (End of Match Day)

At a configurable time after the tournament ends (default: 2 hours after `events.startTime` + estimated duration, or a specific `matchDayEndTime` setting), the system runs the auto-store process:

### 9.1 Trigger

Add a second cron job (or extend the existing one) that runs hourly:

```typescript
// Check every hour for tournaments that ended today
cron.schedule('0 * * * *', async () => {
  await autoStoreCompletedTournaments();
});
```

### 9.2 Logic of `autoStoreCompletedTournaments()`

1. Query tournaments where `events.date` is today and the current time exceeds the configured end time.
2. Check that the tournament does NOT already have a `game_history` entry (avoid duplicates).
3. For each qualifying tournament:
   a. Read all `live_ticker_entries` for that tournament.
   b. Create a `game_history` row with tournament name, date, and team name from the event.
   c. Copy each ticker entry into `game_history_matches`.
   d. Resolve participating player initials from the `teams` / `team_players` / `attendance` tables and insert into `game_history_players`. Use the privacy-preserving initial format:
      - Single first-name initial by default (e.g. "J.")
      - First-name initial + last-name initial when disambiguation is needed (e.g. "L. M.")
   e. Send a WhatsApp notification to the coach: "Match day results for [Tournament] have been saved to history. Review and add trophy marking if applicable."
4. Deactivate the crawl URL (`isActive = 0`) to stop polling.

### 9.3 Player Initial Resolution

```typescript
/**
 * Given a list of player IDs, return privacy-preserving initials.
 * Uses first-name initial. When two players share the same initial,
 * appends the last-name initial for disambiguation.
 *
 * The player's name field stores the first name (or nickname).
 * A lastNameInitial column may exist — if not, the system should have
 * asked the parent for disambiguation during onboarding (PRD 4.5.2).
 */
export function resolvePlayerInitials(playerIds: number[]): string[] {
  // Query player names, build initials, detect collisions,
  // use last-name initials where stored.
  // Implementation detail — see PRD section 4.5.2 on disambiguation.
}
```

---

## 10. SSE Endpoint (Stretch Goal)

For real-time updates without polling, implement Server-Sent Events on `GET /api/tournaments/:id/live/stream`.

```typescript
liveTickerRouter.get('/tournaments/:id/live/stream', (req, res) => {
  const tournamentId = Number(req.params.id);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  const entries = getTickerEntries(tournamentId);
  res.write(`data: ${JSON.stringify(entries)}\n\n`);

  // Set up interval to push updates
  const interval = setInterval(() => {
    const updated = getTickerEntries(tournamentId);
    res.write(`data: ${JSON.stringify(updated)}\n\n`);
  }, 30_000); // every 30 seconds

  req.on('close', () => {
    clearInterval(interval);
  });
});
```

A more efficient approach uses an in-memory event bus (EventEmitter) that fires when `upsertTickerEntry` writes new data, so connected SSE clients receive updates immediately rather than polling on a fixed interval.

---

## 11. Privacy

- **Player initials only**: `game_history_players` stores initials (e.g. "J.", "L. M."), never full names. This matches the PRD requirement in section 4.5.2.
- **Disambiguation**: When two players share the same first-name initial, use the last-name initial that was collected during onboarding. Never store or display full last names.
- **Public tournament view**: The live ticker shows team names (e.g. "FC Example E1") and scores. Individual player names are never shown in the ticker.
- **History view**: Shows participant initials only.
- **No PII in crawled data**: The crawler processes external tournament pages. Any personal data found on those pages is discarded — only team names and scores are extracted and stored.

---

## 12. Edge Cases

### 12.1 Page Returns 403 / Timeout / Network Error

- Log the error with timestamp and URL.
- Do NOT delete existing ticker entries (keep the last-known-good data).
- Increment a `consecutiveFailures` counter (in-memory or in `tournament_results_url`).
- After 5 consecutive failures, set `isActive = 0` and notify the coach via WhatsApp: "Crawling for [Tournament] has been paused after repeated failures. Check the URL or enter scores manually."
- The coach can re-activate crawling from the admin UI or trigger a manual crawl.

### 12.2 LLM Returns Garbage / Unparseable Response

- If `extractScoresFromText()` returns an empty array, treat it as "no new data" — do not wipe existing entries.
- If the JSON parse fails, log the raw LLM response for debugging (truncated to 500 chars, no PII).
- Never blindly overwrite good data with an empty or malformed result.

### 12.3 Duplicate Scores

- The unique index `idx_ticker_match` on `(tournamentId, homeTeam, awayTeam, matchLabel)` prevents duplicate rows.
- The `ON CONFLICT DO UPDATE` clause ensures the latest score wins.
- If the LLM returns the same match with slightly different team names (e.g. "FC Example" vs "FC Example E1"), this may create duplicates. Mitigation: include the club's own team name in the LLM prompt as context so it can normalise.

### 12.4 Tournament Spans Multiple Days

- The scheduler checks `events.date` against today. For multi-day tournaments, the `events` table should store both a start and end date. Extend the query to include tournaments where `today BETWEEN events.date AND events.endDate` (requires adding an `endDate` column to `events`, or using a convention like storing the last day in an existing field).
- Each day's scores accumulate in the same set of `live_ticker_entries` for that tournament.
- Auto-store triggers only after the final day.

### 12.5 No Results URL Configured

- If a tournament has no row in `tournament_results_url`, the scheduler simply skips it. No error, no log noise.
- The tournament detail page shows a message: "Live scores are not available for this tournament. The coach can enter scores manually."
- The admin UI should prompt the coach to configure a results URL when creating the tournament, but it is not required.

### 12.6 Crawl URL Changes Mid-Tournament

- Coaches can update the URL via `PUT /api/admin/tournaments/:id/crawl-config` at any time.
- The scheduler picks up the new URL on the next cycle.
- Existing ticker entries are preserved (they are linked to the tournament, not the URL).

### 12.7 Manual Score Entry Alongside Crawl

- Manual entries (`source = 'manual'`) follow the same upsert logic.
- If a crawl later finds the same match, the crawl result overwrites the manual entry. This is intentional — the crawl is authoritative.
- If the coach wants to prevent overwriting, they can deactivate the crawl URL and rely on manual entry only.

---

## 13. Router Registration

Register the new routers in `server/src/index.ts`:

```typescript
import { liveTickerRouter } from './routes/live-ticker.routes.js';
import { gameHistoryRouter } from './routes/game-history.routes.js';

// After existing app.use() lines:
app.use('/api', liveTickerRouter);
app.use('/api', gameHistoryRouter);
```

Start the cron scheduler in the `main()` function, after `initDB()`:

```typescript
import { startLiveTickerScheduler } from './services/live-ticker.service.js';

async function main() {
  await initDB(DB_PATH);
  startLiveTickerScheduler();  // starts the node-cron jobs
  app.listen(PORT, () => { ... });
}
```

---

## 14. Environment Variables

Add to `.env` (but do NOT commit — `.env` is gitignored):

```
# Optional: Brave Search API key for URL discovery
BRAVE_API_KEY=BSA...

# Optional: override crawl defaults
LIVE_TICKER_DEFAULT_INTERVAL_MIN=10
LIVE_TICKER_AUTO_STORE_DELAY_HOURS=2
```

The LLM configuration (`llm_provider`, `llm_api_key`, `llm_model`) is already stored in the `settings` table and managed via the settings UI.

---

## 15. Testing Strategy

### Unit Tests

- **`live-ticker.test.ts`**: Mock `axios`, mock `chatCompletion()`. Test:
  - `extractScoresFromText()` with sample page text returns correct JSON.
  - `extractScoresFromText()` with garbage LLM response returns empty array.
  - `upsertTickerEntry()` inserts new rows and updates existing ones (upsert).
  - `crawlDueUrls()` skips tournaments without URLs.
  - `crawlDueUrls()` skips URLs not yet due (lastCrawledAt is recent).
  - Consecutive failure counter deactivates crawl URL after threshold.

- **`brave-search.test.ts`**: Mock `fetch`. Test:
  - Successful search returns parsed results.
  - Missing API key throws error.
  - API error (non-200) throws error.

- **`game-history.test.ts`**: Test:
  - `autoStoreCompletedTournaments()` copies ticker entries to history.
  - Duplicate auto-store is prevented (idempotent).
  - Trophy marking sets `isTrophy` and `trophyType`.
  - Player initials are resolved correctly (with disambiguation).
  - History filtering by season works.

### Integration Tests

- **`live-ticker.routes.test.ts`**: Test all endpoints with `supertest`.
- **`game-history.routes.test.ts`**: Test all endpoints with `supertest`.

### Manual / On-Device Testing

- Set up a test tournament with a known results URL (e.g. a static HTML file served locally).
- Verify the crawl scheduler picks it up and populates the ticker.
- Verify the live endpoint returns the data.
- Verify auto-store copies data to history at the configured time.
- Test manual score entry as fallback.

---

## 16. Implementation Order

1. **Database schema** — add tables to `database.ts`, run tests to ensure migrations work.
2. **`live-ticker.service.ts`** — page fetcher, LLM extraction, upsert logic. Write unit tests first.
3. **`live-ticker.routes.ts`** — polling endpoint + manual score entry + crawl config.
4. **Scheduler** — `node-cron` integration in the service, register in `index.ts`.
5. **`game-history.service.ts`** — auto-store flow, trophy management, player initial resolution.
6. **`game-history.routes.ts`** — history CRUD + trophy endpoint.
7. **`brave-search.service.ts`** — URL discovery helper (optional, low priority).
8. **SSE endpoint** — stretch goal, implement after polling works.
