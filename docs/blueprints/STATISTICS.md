# Statistics & Reporting Module -- Implementation Blueprint

> **PRD reference:** Section 4.5.9
> **Target implementer:** LLM agent
> **Status:** Draft

---

## 1. Module Overview

The statistics module computes and exposes aggregated training, attendance and tournament numbers for three audiences:

1. **Coaches / Admins** (authenticated) -- dashboard widgets, per-team and per-player breakdowns, CSV/PDF export.
2. **Club board** (authenticated) -- semester and school-year summaries for reporting to the canton (Sportamt) and insurance.
3. **Public homepage** (no auth) -- a handful of headline numbers (lifetime athletes, trophies, etc.) cached server-side.

All outputs are anonymised. Player names are replaced by nicknames or initials; phone numbers and full names never appear in any response or export (PRD 4.5.5).

---

## 2. Dependencies

| Layer | Dependency | Notes |
|-------|-----------|-------|
| Backend | `sql.js` (already in project) | All queries run against the existing SQLite database via `getDB()`. |
| Backend | None additional | No new npm packages for the core stats queries. |
| Backend (export) | TBD -- lightweight CSV/PDF lib | For CSV: manual string building or `csv-stringify`. For PDF: `pdfkit` or `pdfmake`. Choose the smallest option that satisfies a simple table layout. |
| Frontend | Charting library (optional) | `chart.js` or `recharts` for bar/pie widgets on the coach dashboard. Not part of this backend blueprint. |

---

## 3. File Structure

All paths are relative to `server/src/`.

```
server/src/
  utils/
    semester.ts                         # getSemesterBounds(), getSchoolYearBounds()
  services/
    statistics.service.ts               # Query builders for every stat type
    export.service.ts                   # CSV and PDF generation (anonymised)
    __tests__/
      statistics.service.test.ts
      export.service.test.ts
      semester.test.ts                  # in utils/__tests__/
  routes/
    statistics.routes.ts                # GET /api/admin/stats/* (auth required)
    public/
      homepage-stats.routes.ts          # GET /api/public/homepage-stats (no auth)
    __tests__/
      statistics.routes.test.ts
      homepage-stats.routes.test.ts
```

### Integration point

In `server/src/index.ts`, register the new routers:

```ts
import { statisticsRouter } from "./routes/statistics.js";
import { homepageStatsRouter } from "./routes/public/homepage-stats.js";

// After existing app.use() calls:
app.use("/api", statisticsRouter);       // auth-gated inside the router
app.use("/api", homepageStatsRouter);    // public, no auth
```

---

## 4. Semester & School-Year Definitions

| Period | Start | End | Label format |
|--------|-------|-----|-------------|
| Spring semester | Feb 1 | Jul 31 | `"Spring 2026"` |
| Autumn semester | Aug 1 | Jan 31 (next year) | `"Autumn 2025/26"` |
| School year | Aug 1 | Jul 31 (next year) | `"2025/26"` |

### Helper: `utils/semester.ts`

```ts
export interface StatsPeriod {
  /** ISO date string YYYY-MM-DD */
  start: string;
  /** ISO date string YYYY-MM-DD */
  end: string;
  /** Human-readable label, e.g. "Spring 2026" or "2025/26" */
  label: string;
  /** "spring" | "autumn" | "school_year" */
  type: "spring" | "autumn" | "school_year";
}

/**
 * Given a date, return the semester it falls in.
 *
 * Feb 1 -- Jul 31  ->  Spring semester of that year
 * Aug 1 -- Jan 31  ->  Autumn semester (Aug year / next Jan year)
 *
 * Edge case: Jan 31 belongs to the autumn semester that started the
 * previous August.
 */
export function getSemesterBounds(date: Date): StatsPeriod {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: Jan=0, Feb=1, ...

  if (month >= 1 && month <= 6) {
    // Feb (1) through Jul (6) -> Spring
    return {
      start: `${year}-02-01`,
      end: `${year}-07-31`,
      label: `Spring ${year}`,
      type: "spring",
    };
  }

  // Aug (7) through Dec (11) -> Autumn of this year / next year
  if (month >= 7) {
    return {
      start: `${year}-08-01`,
      end: `${year + 1}-01-31`,
      label: `Autumn ${year}/${(year + 1).toString().slice(2)}`,
      type: "autumn",
    };
  }

  // Jan (0) -> belongs to autumn semester that started previous August
  return {
    start: `${year - 1}-08-01`,
    end: `${year}-01-31`,
    label: `Autumn ${year - 1}/${year.toString().slice(2)}`,
    type: "autumn",
  };
}

/**
 * School year: Aug 1 of year N to Jul 31 of year N+1.
 * If the date is Jan--Jul, the school year started the previous August.
 */
export function getSchoolYearBounds(date: Date): StatsPeriod {
  const year = date.getFullYear();
  const month = date.getMonth();

  const startYear = month >= 7 ? year : year - 1;
  return {
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-07-31`,
    label: `${startYear}/${(startYear + 1).toString().slice(2)}`,
    type: "school_year",
  };
}

/**
 * Parse a period query parameter into a StatsPeriod.
 * Accepted formats:
 *   "spring-2026"      -> Spring 2026
 *   "autumn-2025"      -> Autumn 2025/26
 *   "year-2025"        -> School year 2025/26
 *   "current"          -> current semester
 *   "current-year"     -> current school year
 *   undefined / empty  -> current semester
 */
export function parsePeriodParam(param?: string): StatsPeriod {
  // implementation parses the string and delegates to the functions above
}
```

---

## 5. TypeScript Interfaces

Place these in `server/src/services/statistics.service.ts` (exported).

```ts
import { StatsPeriod } from "../utils/semester.js";

/** Re-export for convenience */
export type { StatsPeriod };

export interface TrainingHoursResult {
  teamId: number | null;
  teamName: string | null;
  period: StatsPeriod;
  /** Total offered training hours (sum of session durations) */
  trainingHours: number;
  /** Number of sessions in the period */
  sessionCount: number;
}

export interface PersonHoursResult {
  teamId: number | null;
  teamName: string | null;
  period: StatsPeriod;
  /** SUM(attending_players * session_duration_minutes) / 60 */
  personHours: number;
}

export interface CoachHoursResult {
  coachId: number;
  coachName: string;        // nickname only, never full name
  period: StatsPeriod;
  /** Total hours this coach led or assisted sessions */
  coachHours: number;
  sessionCount: number;
}

export interface NoShowResult {
  /** Player or team level */
  entityType: "player" | "team";
  entityId: number;
  entityLabel: string;      // nickname or team name
  period: StatsPeriod;
  /** registered AND did NOT attend AND did NOT cancel in advance */
  noShowCount: number;
  /** total registered sessions in the period */
  registeredCount: number;
  /** noShowCount / registeredCount (0..1) */
  noShowRate: number;
}

export interface AttendanceRateResult {
  entityType: "player" | "team";
  entityId: number;
  entityLabel: string;
  period: StatsPeriod;
  attendedCount: number;
  totalSessions: number;
  /** attendedCount / totalSessions (0..1) */
  attendanceRate: number;
}

export interface TournamentParticipationResult {
  entityType: "player" | "team";
  entityId: number;
  entityLabel: string;
  period: StatsPeriod;
  tournamentCount: number;
}

export interface HomepageStats {
  lifetimeAthletes: number;
  activeAthletes: number;
  tournamentsPlayed: number;
  trophiesWon: number;
  trainingSessionsThisSeason: number;
  activeCoaches: number;
  /** ISO timestamp of when this snapshot was computed */
  computedAt: string;
}

export interface HomepageStatsSettings {
  /** Each key matches a field in HomepageStats (excluding computedAt).
   *  true = shown on homepage, false = hidden. */
  lifetimeAthletes: boolean;
  activeAthletes: boolean;
  tournamentsPlayed: boolean;
  trophiesWon: boolean;
  trainingSessionsThisSeason: boolean;
  activeCoaches: boolean;
}
```

---

## 6. Database Considerations

### Existing tables used

| Table | Relevant columns | Purpose |
|-------|-----------------|---------|
| `events` | `id`, `type`, `date`, `startTime`, `categoryRequirement` | Filter training sessions (`type = 'training'`) and tournaments (`type = 'tournament'`). |
| `attendance` | `eventId`, `playerId`, `status` | Count attending / absent / no-show per session. |
| `training_schedule` | `startTime`, `endTime` | Compute session duration in minutes. |
| `players` | `id`, `name`, `category` | Player identity (use `name` as nickname -- never expose phone or guardian data). |
| `guardians` | `id`, `role` | Identify coaches (`role = 'coach'`). |
| `teams` | `id`, `eventId`, `name` | Tournament team rosters. |
| `team_players` | `teamId`, `playerId` | Player-to-team mapping for tournaments. |
| `settings` | `key`, `value` | Store `homepage_stats_settings` as JSON. |

### Session duration

The `events` table does not currently store an explicit `durationMinutes` column. Two options:

**Option A (preferred):** Derive duration from `training_schedule`. Join `events` to `training_schedule` on day-of-week and matching time. Compute duration as `(endTime - startTime)` in minutes.

**Option B:** Add a `durationMinutes INTEGER` column to `events`. This is simpler for queries but requires a migration. If you choose this, add a migration in `database.ts` schema:

```sql
ALTER TABLE events ADD COLUMN durationMinutes INTEGER;
```

The implementing agent should use **Option A** first and fall back to a default of 90 minutes if no schedule match is found. If the team later decides to store duration explicitly, Option B can be added as a migration.

### Game history / trophies

The current schema has no `game_history` table. The PRD (section 4.5.2) describes storing final tournament results and trophy flags. Until that table exists, tournament stats should query:

- `events WHERE type = 'tournament'` for tournament count.
- A future `game_history` table for trophies. For now, return `0` for `trophiesWon` and leave a `// TODO: query game_history when table exists` comment.

### Coach identification

Coaches are guardians with `role = 'coach'` or `role = 'admin'` in the `guardians` table. The `events.createdBy` column links to the guardian who created the event. For coach hours, query events created by a coach. If a dedicated `event_coaches` junction table is added later, prefer that.

---

## 7. Statistics Queries (SQL Patterns)

All queries use parameterised date ranges from `StatsPeriod.start` and `StatsPeriod.end`. The placeholder `?start` and `?end` below represent those bound parameters.

### 7.1 Training Hours

```sql
-- Total training hours per team (via categoryRequirement) in a period
SELECT
  e.categoryRequirement AS teamCategory,
  COUNT(*)              AS sessionCount,
  SUM(
    CASE
      WHEN ts.startTime IS NOT NULL AND ts.endTime IS NOT NULL
      THEN (strftime('%s', ts.endTime) - strftime('%s', ts.startTime)) / 60.0
      ELSE 90  -- default 90 minutes
    END
  ) / 60.0 AS trainingHours
FROM events e
LEFT JOIN training_schedule ts
  ON ts.dayOfWeek = CAST(strftime('%w', e.date) AS INTEGER)
  AND ts.startTime = e.startTime
WHERE e.type = 'training'
  AND e.date BETWEEN ?start AND ?end
GROUP BY e.categoryRequirement;
```

### 7.2 Person Hours

```sql
-- Person hours = SUM(attending_count * session_duration_minutes) / 60
SELECT
  e.categoryRequirement AS teamCategory,
  SUM(
    att_count.cnt *
    CASE
      WHEN ts.startTime IS NOT NULL AND ts.endTime IS NOT NULL
      THEN (strftime('%s', ts.endTime) - strftime('%s', ts.startTime)) / 60.0
      ELSE 90
    END
  ) / 60.0 AS personHours
FROM events e
LEFT JOIN training_schedule ts
  ON ts.dayOfWeek = CAST(strftime('%w', e.date) AS INTEGER)
  AND ts.startTime = e.startTime
LEFT JOIN (
  SELECT eventId, COUNT(*) AS cnt
  FROM attendance
  WHERE status = 'attending'
  GROUP BY eventId
) att_count ON att_count.eventId = e.id
WHERE e.type = 'training'
  AND e.date BETWEEN ?start AND ?end
GROUP BY e.categoryRequirement;
```

### 7.3 Coach Hours

```sql
-- Hours per coach (events they created) in a period
SELECT
  g.id   AS coachId,
  g.name AS coachName,
  COUNT(*)  AS sessionCount,
  SUM(
    CASE
      WHEN ts.startTime IS NOT NULL AND ts.endTime IS NOT NULL
      THEN (strftime('%s', ts.endTime) - strftime('%s', ts.startTime)) / 60.0
      ELSE 90
    END
  ) / 60.0 AS coachHours
FROM events e
JOIN guardians g ON g.id = e.createdBy
LEFT JOIN training_schedule ts
  ON ts.dayOfWeek = CAST(strftime('%w', e.date) AS INTEGER)
  AND ts.startTime = e.startTime
WHERE e.type = 'training'
  AND g.role IN ('coach', 'admin')
  AND e.date BETWEEN ?start AND ?end
GROUP BY g.id;
```

### 7.4 No-Show Rate

A "no-show" is a player whose attendance status is `'unknown'` (never responded) when the event date has passed, or who was `'attending'` but was later marked absent by the coach post-session. In the current schema, the simplest heuristic:

```sql
-- No-show: status is still 'unknown' after the event date, or
-- status changed to 'absent' without a reason (no prior cancellation).
-- Approximation using current status values:
SELECT
  a.playerId,
  p.name AS playerLabel,
  COUNT(*) AS registeredCount,
  SUM(CASE WHEN a.status = 'unknown' THEN 1 ELSE 0 END) AS noShowCount
FROM attendance a
JOIN players p ON p.id = a.playerId
JOIN events e ON e.id = a.eventId
WHERE e.type = 'training'
  AND e.date BETWEEN ?start AND ?end
  AND e.date < date('now')  -- only past events
GROUP BY a.playerId;
-- noShowRate = noShowCount / registeredCount (compute in application code)
```

> **Implementation note:** The attendance system currently uses statuses: `attending`, `absent`, `waitlist`, `unknown`. A true no-show requires distinguishing "absent with notice" from "absent without notice". The `reason` column can help: if `status = 'absent'` and `reason IS NOT NULL`, it was a cancellation. If `status = 'absent'` and `reason IS NULL`, or `status = 'unknown'` after the event, it is a no-show. Refine the WHERE clause accordingly.

### 7.5 Attendance Rate

```sql
SELECT
  a.playerId,
  p.name AS playerLabel,
  COUNT(*)  AS totalSessions,
  SUM(CASE WHEN a.status = 'attending' THEN 1 ELSE 0 END) AS attendedCount
FROM attendance a
JOIN players p ON p.id = a.playerId
JOIN events e ON e.id = a.eventId
WHERE e.type = 'training'
  AND e.date BETWEEN ?start AND ?end
GROUP BY a.playerId;
-- attendanceRate = attendedCount / totalSessions (compute in application code)
```

### 7.6 Tournament Participation

```sql
-- Count distinct tournaments per player
SELECT
  tp.playerId,
  p.name AS playerLabel,
  COUNT(DISTINCT t.eventId) AS tournamentCount
FROM team_players tp
JOIN teams t ON t.id = tp.teamId
JOIN events e ON e.id = t.eventId
JOIN players p ON p.id = tp.playerId
WHERE e.type = 'tournament'
  AND e.date BETWEEN ?start AND ?end
GROUP BY tp.playerId;
```

---

## 8. API Endpoints

All admin endpoints sit behind `authMiddleware` + `requireRole('coach', 'admin')`.

### 8.1 Admin Stats (authenticated)

| Method | Path | Query params | Response |
|--------|------|-------------|----------|
| GET | `/api/admin/stats/training-hours` | `team` (category string, optional), `semester` (period string, optional -- defaults to current) | `TrainingHoursResult[]` |
| GET | `/api/admin/stats/person-hours` | `team`, `semester` | `PersonHoursResult[]` |
| GET | `/api/admin/stats/coach-hours` | `coach` (guardian ID, optional), `semester` | `CoachHoursResult[]` |
| GET | `/api/admin/stats/no-shows` | `team`, `period` | `NoShowResult[]` |
| GET | `/api/admin/stats/attendance-rate` | `team`, `period` | `AttendanceRateResult[]` |
| GET | `/api/admin/stats/export` | `format` (`csv` or `pdf`), `type` (stat type), `period` | Binary file download with `Content-Disposition` header |

### 8.2 Homepage Stats Settings (authenticated)

| Method | Path | Body / Response |
|--------|------|----------------|
| GET | `/api/admin/settings/homepage-stats` | `HomepageStatsSettings` |
| PUT | `/api/admin/settings/homepage-stats` | Body: partial `HomepageStatsSettings`. Stored as JSON in `settings` table under key `homepage_stats_settings`. |

### 8.3 Public Homepage Stats (no auth)

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/public/homepage-stats` | `HomepageStats` (filtered by enabled settings) |

#### Router: `routes/statistics.routes.ts`

```ts
import { Router } from "express";
import { authMiddleware, requireRole } from "../auth.js";

export const statisticsRouter = Router();

// All admin stats routes require authentication + coach/admin role
statisticsRouter.use(
  "/admin/stats",
  authMiddleware,
  requireRole("coach", "admin")
);

statisticsRouter.get("/admin/stats/training-hours", (req, res) => { /* ... */ });
statisticsRouter.get("/admin/stats/person-hours",   (req, res) => { /* ... */ });
statisticsRouter.get("/admin/stats/coach-hours",     (req, res) => { /* ... */ });
statisticsRouter.get("/admin/stats/no-shows",        (req, res) => { /* ... */ });
statisticsRouter.get("/admin/stats/attendance-rate",  (req, res) => { /* ... */ });
statisticsRouter.get("/admin/stats/export",           (req, res) => { /* ... */ });

// Homepage stats settings (admin only)
statisticsRouter.use(
  "/admin/settings/homepage-stats",
  authMiddleware,
  requireRole("admin")
);
statisticsRouter.get("/admin/settings/homepage-stats", (req, res) => { /* ... */ });
statisticsRouter.put("/admin/settings/homepage-stats", (req, res) => { /* ... */ });
```

#### Router: `routes/public/homepage-stats.routes.ts`

```ts
import { Router } from "express";

export const homepageStatsRouter = Router();

// No auth -- public endpoint
homepageStatsRouter.get("/public/homepage-stats", (req, res) => { /* ... */ });
```

---

## 9. Homepage Stats -- Caching Strategy

Computing homepage stats hits multiple tables. To avoid running expensive queries on every page load:

1. **In-memory cache** with a 1-hour TTL (time-to-live).
2. On first request (or after TTL expires), run all homepage queries, store the result object and a timestamp.
3. Subsequent requests within the TTL return the cached object immediately.
4. When an admin updates `homepage_stats_settings`, invalidate the cache so the next request recomputes with the new visibility flags.

```ts
// Simplified cache in statistics.service.ts
let cachedHomepageStats: HomepageStats | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function getHomepageStats(): HomepageStats {
  const now = Date.now();
  if (cachedHomepageStats && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedHomepageStats;
  }
  cachedHomepageStats = computeHomepageStats(); // runs the SQL queries
  cacheTimestamp = now;
  return cachedHomepageStats;
}

export function invalidateHomepageStatsCache(): void {
  cachedHomepageStats = null;
}
```

### Homepage queries

```sql
-- Lifetime athletes: every player who has at least one attendance record
SELECT COUNT(DISTINCT playerId) AS lifetimeAthletes FROM attendance;

-- Active athletes: attended >= 1 session in current semester
SELECT COUNT(DISTINCT a.playerId) AS activeAthletes
FROM attendance a
JOIN events e ON e.id = a.eventId
WHERE a.status = 'attending'
  AND e.date BETWEEN ?semesterStart AND ?semesterEnd;

-- Tournaments played (lifetime)
SELECT COUNT(DISTINCT e.id) AS tournamentsPlayed
FROM events e
WHERE e.type = 'tournament';

-- Trophies won
-- TODO: query game_history table when it exists. Return 0 for now.

-- Training sessions this school year
SELECT COUNT(*) AS trainingSessionsThisSeason
FROM events
WHERE type = 'training'
  AND date BETWEEN ?schoolYearStart AND ?schoolYearEnd;

-- Active coaches: coached >= 1 session in current semester
SELECT COUNT(DISTINCT e.createdBy) AS activeCoaches
FROM events e
JOIN guardians g ON g.id = e.createdBy
WHERE g.role IN ('coach', 'admin')
  AND e.type = 'training'
  AND e.date BETWEEN ?semesterStart AND ?semesterEnd;
```

The public endpoint filters the response object, setting hidden fields to `null` based on the admin's `HomepageStatsSettings`.

---

## 10. Export Service

### File: `services/export.service.ts`

Two export formats: CSV and PDF. Both receive the same data arrays from the statistics service.

### CSV

- First row: column headers.
- Delimiter: semicolon (`;`) for European Excel compatibility. Include a UTF-8 BOM (`\uFEFF`) so Excel auto-detects encoding.
- Player columns use `name` (which is a nickname in the data model), never phone numbers or guardian names.

```ts
export function generateCSV(
  headers: string[],
  rows: Record<string, string | number>[],
): Buffer {
  const BOM = "\uFEFF";
  const lines: string[] = [headers.join(";")];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? "")).join(";"));
  }
  return Buffer.from(BOM + lines.join("\n"), "utf-8");
}
```

### PDF

- Use `pdfkit` (or similar).
- Simple table layout: title row, column headers, data rows.
- Footer: "Generated by OpenKick -- [date]. Anonymised export -- no personal data."
- No player phone numbers, no guardian names, no full names. Only nicknames/initials.

```ts
export function generatePDF(
  title: string,
  headers: string[],
  rows: Record<string, string | number>[],
): Buffer {
  // Use pdfkit to create a document
  // Add title, then a table with headers and rows
  // Return the Buffer
}
```

### Export endpoint flow

1. Parse `format`, `type`, `period` from query params.
2. Call the appropriate statistics service function to get the data.
3. Call `generateCSV()` or `generatePDF()`.
4. Set response headers:
   - `Content-Type: text/csv; charset=utf-8` or `application/pdf`
   - `Content-Disposition: attachment; filename="openkick-training-hours-spring-2026.csv"`
5. Send the buffer.

---

## 11. Edge Cases

| Scenario | Expected behaviour |
|----------|--------------------|
| **No data for a period** | Return an empty array (admin endpoints) or zeros (homepage stats). Never return an error for "no data". |
| **Mid-semester query** | The period bounds are fixed (Feb 1 -- Jul 31 or Aug 1 -- Jan 31). If the current date is in the middle of a semester, queries return data up to today. The period label still shows the full semester name. |
| **Player switched teams** | A player's `category` may change mid-semester. Stats are computed per-event: each session's `categoryRequirement` determines which "team" it counts toward. A player who switched teams appears in both teams' stats for the sessions they attended. |
| **Coach coaches multiple teams** | Coach hours sum across all teams. The `coach-hours` endpoint returns one row per coach regardless of how many teams they coach. Per-team breakdown can be added later via a `groupBy=team` query param. |
| **Event with no training_schedule match** | Default to 90-minute duration. Log a warning so admins can fix the schedule data. |
| **Division by zero** (rates) | If `registeredCount` or `totalSessions` is 0, return a rate of `0` rather than `NaN` or an error. |
| **Future events** | Exclude events with `date > date('now')` from no-show and attendance rate calculations (you cannot be a no-show for a session that has not happened yet). Training hours and person hours include future scheduled sessions. |
| **Trophies (game_history missing)** | Return `0` until the game history module is implemented. Leave a `// TODO` marker. |

---

## 12. Testing Strategy

### Unit tests (`services/__tests__/statistics.service.test.ts`)

- Seed the in-memory database with known events, attendance records, players, guardians and training schedules.
- Test each query function independently:
  - Training hours for a single team, single semester.
  - Person hours with varying attendance counts.
  - Coach hours for a coach who created events across two teams.
  - No-show rate with a mix of `unknown`, `absent` (with reason), and `absent` (without reason).
  - Attendance rate with zero sessions (expect rate = 0).
  - Tournament participation count.
- Test `getSemesterBounds()` and `getSchoolYearBounds()` with dates at boundaries (Jan 31, Feb 1, Jul 31, Aug 1).

### Unit tests (`utils/__tests__/semester.test.ts`)

- `getSemesterBounds(new Date("2026-01-15"))` returns Autumn 2025/26 (Aug 1 -- Jan 31).
- `getSemesterBounds(new Date("2026-02-01"))` returns Spring 2026 (Feb 1 -- Jul 31).
- `getSemesterBounds(new Date("2026-08-01"))` returns Autumn 2026/27.
- `getSchoolYearBounds(new Date("2026-03-15"))` returns 2025/26 (Aug 1 -- Jul 31).

### Integration tests (`routes/__tests__/statistics.routes.test.ts`)

- Test auth: unauthenticated requests to `/api/admin/stats/*` return 401.
- Test role: parent role returns 403.
- Test happy path: seed data, call each endpoint, verify shape and values.
- Test export: verify CSV content-type and that the body starts with a BOM + headers.

### Integration tests (`routes/__tests__/homepage-stats.routes.test.ts`)

- Test that `/api/public/homepage-stats` returns 200 without auth.
- Test that disabled stats (via settings) return `null` for those fields.
- Test caching: call twice, verify the second call is fast and returns the same `computedAt`.

---

## 13. Implementation Order

Execute these steps in sequence. Each step should compile, pass lint, and pass its own tests before moving on.

1. **`utils/semester.ts`** + tests -- pure functions, no DB dependency.
2. **`services/statistics.service.ts`** -- implement query functions one by one. Write tests for each before the implementation (test-first).
3. **`routes/statistics.routes.ts`** -- wire up endpoints, add auth middleware. Write route tests.
4. **`routes/public/homepage-stats.routes.ts`** -- public endpoint + cache. Write route tests.
5. **Homepage stats settings** -- GET/PUT for `homepage_stats_settings` in the settings table. Wire into the public endpoint.
6. **`services/export.service.ts`** -- CSV first (simpler), then PDF. Write tests for CSV output shape.
7. **Register routers** in `index.ts`.
8. **Manual smoke test** -- start the server, seed some data, hit the endpoints with `curl`.

---

## 14. Future Considerations

- **`game_history` table:** When the live-ticker / game-history module is built (PRD 4.5.2), add a `trophiesWon` query to homepage stats and a `tournament-results` stat endpoint.
- **`event_coaches` junction table:** If multiple coaches can be assigned to a single session (not just the creator), coach-hours queries should join through that table instead of `events.createdBy`.
- **`durationMinutes` column:** If added to `events`, simplify all duration calculations by replacing the `training_schedule` join with a direct column read.
- **Dashboard charts:** The frontend can call these endpoints and render bar/pie charts. The backend provides raw numbers; chart rendering is a frontend concern.
- **Scheduled cache refresh:** Instead of lazy cache invalidation, a cron job or `setInterval` could refresh homepage stats every hour proactively, ensuring the first visitor after cache expiry does not wait.
