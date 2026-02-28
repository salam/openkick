# Design: Live Ticker & Turnieragenda.ch Integration

> **Date**: 2026-02-28
> **Blueprint reference**: `docs/blueprints/LIVE_TICKER.md`
> **PRD reference**: Section 4.5.2 (Tournament Management)

---

## 1. Research Findings

**turnieragenda.ch has no public API.** The site is fully server-rendered HTML — no AJAX, no JSON feeds, no WebSockets. URL structure:

| Purpose | URL Pattern |
|---------|-------------|
| Event overview | `/de/event/detail/{id}` |
| Schedule/scores | `/de/event/schedule/{id}` (per category) |
| Live schedule | `/de/event/schedule-live/{id}` |

The HTML contains structured tables with team names, match schedules, and scores — suitable for cheerio parsing. A dedicated parser avoids unnecessary LLM calls for this structured source.

---

## 2. Architecture

Three layers:

1. **Crawl engine** (server) — Periodically fetches tournament pages, extracts scores via cheerio (turnieragenda.ch) or cheerio + LLM (generic sites)
2. **API layer** (server) — REST endpoints for ticker data, manual score entry, crawl configuration, and tournament import
3. **Public widget** (web) — Homepage component: compact ticker bar during match day, "next up / last results" when idle

### Data Flow

```
turnieragenda.ch HTML  OR  manual coach input
        │                        │
        ▼                        │
  cheerio parser                 │
  (turnieragenda.parser.ts)      │
        │                        │
        ▼                        ▼
  live_ticker_entries table (upsert, source = 'crawl' | 'manual')
        │
        ▼
  GET /api/live-ticker/:tournamentId (polling, 30s interval)
        │
        ▼
  Public homepage widget (React)
```

For generic tournament sites (not turnieragenda.ch), the flow adds an LLM extraction step between cheerio text and database upsert.

---

## 3. Database Schema

Following the blueprint (5 new tables):

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

-- Live ticker entries (scores during match day)
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

-- Participant initials for privacy
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

## 4. Turnieragenda.ch Parser

A dedicated cheerio-based parser (`turnieragenda.parser.ts`) that:

1. Fetches the schedule page at `/de/event/schedule/{id}` or `/de/event/schedule-live/{id}`
2. Extracts match rows from HTML tables (team names, scores, match times)
3. Returns `ExtractedMatchResult[]` without needing LLM calls
4. Auto-detects turnieragenda.ch URLs and routes to this parser instead of the generic LLM pipeline

---

## 5. API Endpoints

### Live Ticker Routes (`/api/live-ticker`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/:tournamentId` | Public | Get current ticker entries for a tournament |
| GET | `/active` | Public | Get all active tournament tickers (for homepage widget) |
| POST | `/:tournamentId/manual` | Coach | Add/update a manual score entry |
| PUT | `/:tournamentId/crawl-config` | Coach | Set/update crawl URL and interval |
| DELETE | `/:tournamentId/crawl-config/:id` | Coach | Remove a crawl URL |
| POST | `/:tournamentId/crawl-now` | Coach | Trigger an immediate crawl |

### Game History Routes (`/api/game-history`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | Public | List all game history entries |
| GET | `/:id` | Public | Get single history entry with matches and players |
| POST | `/` | Coach | Create history entry (or auto-archive from ticker) |
| PUT | `/:id/trophy` | Coach | Mark/unmark as trophy, set trophy type |
| DELETE | `/:id` | Coach | Delete history entry |

---

## 6. Crawl Scheduler

Uses `node-cron` (every minute check). Actual crawl frequency is per-URL via `crawlIntervalMin`.

Logic:
1. Query tournaments where `events.date` is today AND `events.type = 'tournament'`
2. Join with `tournament_results_url` where `isActive = 1`
3. Filter where `lastCrawledAt IS NULL` or older than `crawlIntervalMin`
4. For turnieragenda.ch URLs → use dedicated parser
5. For other URLs → use cheerio + LLM extraction
6. Upsert results into `live_ticker_entries`
7. Update `lastCrawledAt`

End-of-day archival: a separate cron job (runs at midnight) copies final ticker entries into `game_history` tables for completed tournaments.

---

## 7. Homepage Widget

### Component: `TournamentWidget.tsx`

Wrapper that checks for active tournaments and renders accordingly:

| State | Component | Behavior |
|-------|-----------|----------|
| Active tournament today | `LiveTickerBar` | Compact bar, rotates scores every 5s. Click → `/live/{tournamentId}` |
| No active tournament | Next tournament card + Last results card | Countdown to next, summary of last |

### Component: `LiveTickerBar.tsx`

- Polls `/api/live-ticker/active` every 30 seconds
- Shows one match at a time, auto-rotates
- Displays: `homeTeam score awayTeam` with match label
- Subtle animation on score changes
- Green dot indicator for "LIVE"

### Component: `LiveTickerDetail.tsx`

- Full page at `/live/[tournamentId]`
- All matches in a card grid grouped by match phase (group, semi-final, final)
- Group standings table
- Auto-refreshes every 30s

### Public page: `/live/[tournamentId]/page.tsx`

- No authentication required
- SEO-friendly with tournament name in title
- Shareable URL for parents to follow along

---

## 8. New Files

```
server/src/services/
  live-ticker.service.ts          # Crawl scheduler, generic page fetcher, LLM extraction
  turnieragenda.parser.ts         # Dedicated turnieragenda.ch HTML parser
  game-history.service.ts         # Post-match-day archival, trophy management
  __tests__/
    live-ticker.test.ts
    turnieragenda.parser.test.ts
    game-history.test.ts
server/src/routes/
  live-ticker.routes.ts           # Ticker + crawl config endpoints
  game-history.routes.ts          # History CRUD + trophy marking
  __tests__/
    live-ticker.test.ts
    game-history.test.ts
web/src/components/
  LiveTickerBar.tsx                # Compact rotating score ticker
  LiveTickerDetail.tsx             # Full match detail view
  TournamentWidget.tsx            # Homepage wrapper (picks active vs idle state)
web/src/app/live/
  [tournamentId]/page.tsx          # Public live detail page
```

---

## 9. Dependencies

### New packages

```bash
# server
npm install cheerio node-cron
npm install -D @types/node-cron
```

`puppeteer` is deferred — turnieragenda.ch works fine with static HTML fetching.

### Existing packages used

- `fetch` (Node built-in) — HTTP calls
- `vitest` — tests
- LLM service (`llm.ts`) — generic score extraction
- `sql.js` — database
