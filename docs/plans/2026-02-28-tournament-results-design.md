# Tournament Results & Trophy Cabinet — Design

**Date:** 2026-02-28
**Status:** Approved

## Summary

Allow coaches to manually track tournament results (placement, summary, achievements/trophies) after they occurred — either by entering data manually or by providing a results bracket URL for LLM-assisted extraction with manual review.

## Data Model

```sql
CREATE TABLE IF NOT EXISTS tournament_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  placement INTEGER,              -- e.g. 1, 2, 3, 5
  totalTeams INTEGER,             -- e.g. 12 (for "3rd out of 12")
  summary TEXT,                   -- free-text highlights/notes
  resultsUrl TEXT,                -- bracket/results page URL
  achievements TEXT DEFAULT '[]', -- JSON array
  createdBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Achievement JSON format:**
```json
[
  {"type": "1st_place", "label": "1st Place"},
  {"type": "custom", "label": "Best Goalkeeper"}
]
```

**Predefined achievement types:** `1st_place`, `2nd_place`, `3rd_place`, `fair_play`, `best_player`.
Custom achievements use type `custom` with a free-text `label`.

**Additional schema change:**
```sql
ALTER TABLE events ADD COLUMN teamName TEXT;
```

Used to identify the club's team in imported results. Falls back to `settings.clubName` with `%clubName%` wildcard matching in the LLM prompt.

## API Endpoints

### Tournament Results CRUD (coach-only, JWT auth)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/events/:eventId/results` | Get results for a tournament event |
| `POST` | `/api/events/:eventId/results` | Create results (manual entry) |
| `PUT` | `/api/events/:eventId/results` | Update existing results |
| `DELETE` | `/api/events/:eventId/results` | Remove results |
| `POST` | `/api/events/:eventId/results/import` | LLM extraction from URL — returns pre-filled data for review, does NOT auto-save |

### Trophy Cabinet (public)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/trophy-cabinet` | All events with results, date desc. Supports `?limit=` and `?offset=`. Player names as initials only. |

## LLM Results Import Flow

1. Coach pastes results URL, clicks "Import"
2. Frontend calls `POST /api/events/:eventId/results/import` with `{ url }`
3. Backend fetches page, sends to LLM with prompt requesting: placement, totalTeams, summary, achievements
4. Team identification: `event.teamName` if set, else `settings.clubName` with `%clubName%` wildcard
5. LLM returns structured JSON — backend returns to frontend
6. Form fields pre-filled — coach reviews, edits, submits via normal `POST`

## Frontend

### 1. Results Form (event detail page, coach-only)
- Shown on past tournament/match/friendly events
- Fields: placement, total teams, summary (textarea), achievements (predefined chips + custom), results URL + Import button
- View mode with Edit button when results exist

### 2. Results Display (event detail page, public)
- Placement badge ("3rd out of 12"), summary, achievement badges, results URL link
- Player names as initials for non-coaches

### 3. Trophy Cabinet Page (`/trophies`)
- Public, accessible from main navigation
- Chronological list, newest first
- Each entry: event title, date, placement badge, achievement badges
- Click-through to event detail

### 4. Dashboard Widget
- "Recent Trophies" card, latest 3-5 achievements
- Links to full trophy cabinet

## Error Handling & Edge Cases

- Results only for event types: `tournament`, `match`, `friendly`
- `placement` must be positive integer, `totalTeams` >= `placement`
- `achievements` JSON validated server-side
- One result per event (UNIQUE constraint)
- URL unreachable: clear error, coach enters manually
- LLM can't find team: partial data + warning, coach fills gaps
- Import timeout: 30s (fetch + LLM combined)
- Event deletion cascades to result deletion (ON DELETE CASCADE)

## Privacy

- Trophy cabinet and public event detail: player names as first-name initial + last initial (e.g. "M.S.")
- Coach view shows full names
