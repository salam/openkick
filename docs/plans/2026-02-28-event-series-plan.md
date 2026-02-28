# Event Series Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add event series with dynamic expansion, lazy materialization, vacation skipping, and empty-state CTA buttons on dashboard/events pages.

**Architecture:** New `event_series` table stores templates. A shared expansion service generates virtual instances at query time, skipping vacations and excluded dates. When a user interacts with an instance (RSVP/edit), it gets materialized as a real `events` row with `seriesId`. Frontend adds series toggle to event creation form and empty-state buttons.

**Tech Stack:** SQLite (sql.js), Express, Vitest, Next.js (React), TypeScript

---

### Task 1: Database Schema — Add `event_series` table and `seriesId` column

**Files:**
- Modify: `server/src/database.ts:8-101` (SCHEMA constant)
- Modify: `server/src/database.ts:155-162` (migration section)
- Test: `server/src/__tests__/database.test.ts`

**Step 1: Write the failing test**

Add to `server/src/__tests__/database.test.ts`:

```typescript
it("creates event_series table with expected columns", async () => {
  const db = await initDB();
  const info = db.exec("PRAGMA table_info(event_series)");
  const cols = info[0]?.values.map((r) => r[1]) ?? [];
  expect(cols).toContain("id");
  expect(cols).toContain("type");
  expect(cols).toContain("title");
  expect(cols).toContain("recurrenceDay");
  expect(cols).toContain("startDate");
  expect(cols).toContain("endDate");
  expect(cols).toContain("customDates");
  expect(cols).toContain("excludedDates");
  expect(cols).toContain("deadlineOffsetHours");
  db.close();
});

it("events table has seriesId column", async () => {
  const db = await initDB();
  const info = db.exec("PRAGMA table_info(events)");
  const cols = info[0]?.values.map((r) => r[1]) ?? [];
  expect(cols).toContain("seriesId");
  db.close();
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/database.test.ts`
Expected: FAIL — `event_series` table doesn't exist, `seriesId` column missing

**Step 3: Add schema and migration**

In `server/src/database.ts`, add to SCHEMA after the `events` table:

```sql
CREATE TABLE IF NOT EXISTS event_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  startTime TEXT,
  attendanceTime TEXT,
  location TEXT,
  categoryRequirement TEXT,
  maxParticipants INTEGER,
  minParticipants INTEGER,
  recurrenceDay INTEGER NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  customDates TEXT,
  excludedDates TEXT,
  deadlineOffsetHours INTEGER,
  createdBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add `seriesId` to the events CREATE TABLE:

```sql
  seriesId INTEGER REFERENCES event_series(id),
```

Add migration for existing databases (after the guardian migration block):

```typescript
// Migrate: add seriesId to events if absent
const eventCols = db.exec("PRAGMA table_info(events)")[0]?.values.map(r => r[1]) ?? [];
if (!eventCols.includes('seriesId')) {
  db.run("ALTER TABLE events ADD COLUMN seriesId INTEGER REFERENCES event_series(id)");
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/database.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat(db): add event_series table and seriesId column to events" -- server/src/database.ts server/src/__tests__/database.test.ts
```

---

### Task 2: Series Expansion Service

**Files:**
- Create: `server/src/services/event-series.ts`
- Test: `server/src/services/__tests__/event-series.test.ts`

**Step 1: Write the failing tests**

Create `server/src/services/__tests__/event-series.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { expandSeries, type SeriesTemplate, type VacationPeriod } from "../event-series.js";

const baseSeries: SeriesTemplate = {
  id: 1,
  type: "training",
  title: "Monday Training",
  description: null,
  startTime: "18:00",
  attendanceTime: "17:45",
  location: "Sportplatz A",
  categoryRequirement: "E,F",
  maxParticipants: null,
  minParticipants: null,
  recurrenceDay: 1, // Monday
  startDate: "2026-03-02", // a Monday
  endDate: "2026-03-30",   // 5 Mondays
  customDates: null,
  excludedDates: null,
  deadlineOffsetHours: 48,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00",
};

describe("expandSeries", () => {
  it("generates weekly instances between start and end date", () => {
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"]);
  });

  it("filters to requested date range", () => {
    const result = expandSeries(baseSeries, "2026-03-08", "2026-03-20", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).toEqual(["2026-03-09", "2026-03-16"]);
  });

  it("skips vacation periods", () => {
    const vacations: VacationPeriod[] = [
      { startDate: "2026-03-09", endDate: "2026-03-15" },
    ];
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", vacations, []);
    const dates = result.map((e) => e.date);
    expect(dates).not.toContain("2026-03-09");
    expect(dates).toContain("2026-03-02");
    expect(dates).toContain("2026-03-16");
  });

  it("skips excluded dates", () => {
    const series = { ...baseSeries, excludedDates: JSON.stringify(["2026-03-16"]) };
    const result = expandSeries(series, "2026-03-01", "2026-03-31", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).not.toContain("2026-03-16");
  });

  it("includes custom dates outside weekly pattern", () => {
    const series = { ...baseSeries, customDates: JSON.stringify(["2026-03-05"]) }; // a Thursday
    const result = expandSeries(series, "2026-03-01", "2026-03-31", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).toContain("2026-03-05");
  });

  it("replaces virtual instance with materialized event", () => {
    const materialized = [
      { id: 99, seriesId: 1, date: "2026-03-09", title: "Edited Training", type: "training", startTime: "19:00" },
    ];
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", [], materialized as any);
    const mar9 = result.find((e) => e.date === "2026-03-09");
    expect(mar9?.title).toBe("Edited Training");
    expect(mar9?.startTime).toBe("19:00");
    expect(mar9?.materialized).toBe(true);
    expect(mar9?.id).toBe(99);
  });

  it("computes deadline from deadlineOffsetHours", () => {
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", [], []);
    const first = result[0];
    // 48h before 2026-03-02 18:00 = 2026-02-28 18:00
    expect(first.deadline).toBe("2026-02-28T18:00:00");
  });

  it("sets virtual instance fields from template", () => {
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-10", [], []);
    const first = result[0];
    expect(first.seriesId).toBe(1);
    expect(first.type).toBe("training");
    expect(first.title).toBe("Monday Training");
    expect(first.location).toBe("Sportplatz A");
    expect(first.materialized).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/event-series.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the expansion service**

Create `server/src/services/event-series.ts` with:

- `SeriesTemplate` interface (all event_series columns)
- `VacationPeriod` interface (`{ startDate, endDate }`)
- `ExpandedEvent` interface (union of event fields + `materialized` boolean)
- `expandSeries(series, rangeStart, rangeEnd, vacations, materializedEvents)` function:
  1. Generate weekly dates from `startDate` to `endDate` on `recurrenceDay`
  2. Add `customDates` (parsed from JSON)
  3. Remove `excludedDates` (parsed from JSON)
  4. Filter out vacation period dates and out-of-range dates
  5. Sort remaining dates
  6. For each date: return materialized event if one exists (by seriesId + date), otherwise build virtual event from template
  7. Compute deadline as `date + startTime - deadlineOffsetHours`

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/event-series.test.ts`
Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/event-series.ts server/src/services/__tests__/event-series.test.ts && git commit -m "feat: add event series expansion service with tests"
```

---

### Task 3: Event Series API Routes — CRUD

**Files:**
- Create: `server/src/routes/event-series.ts`
- Test: `server/src/routes/__tests__/event-series.test.ts`
- Modify: `server/src/index.ts:10-52` (register router)

**Step 1: Write the failing tests**

Create `server/src/routes/__tests__/event-series.test.ts` with tests for:

- `POST /api/event-series` — creates series, returns 201 with id
- `POST /api/event-series` — rejects missing title (400)
- `GET /api/event-series` — lists all series
- `GET /api/event-series/:id` — returns `{ series, instances }` with expanded dates
- `PUT /api/event-series/:id` — updates template fields
- `DELETE /api/event-series/:id` — deletes series and materialized events (204)
- `POST /api/event-series/:id/exclude` — adds date to excludedDates, verify expanded instances no longer include it
- `POST /api/event-series/:id/materialize` — creates real event row, returns event with numeric id and seriesId

Follow the test app pattern from `server/src/routes/__tests__/events.test.ts` (express app + createServer + initDB).

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/event-series.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the route**

Create `server/src/routes/event-series.ts`:

- Use `Router` from express, export as `eventSeriesRouter`
- Use `getDB()` from `../database.js` and `rowsToObjects` helper
- Import `expandSeries` from `../services/event-series.js`
- Implement all 7 endpoints as described in the design doc

Register in `server/src/index.ts`:
```typescript
import { eventSeriesRouter } from "./routes/event-series.js";
app.use("/api", eventSeriesRouter);
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/event-series.test.ts`
Expected: PASS (all 8 tests)

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/routes/event-series.ts server/src/routes/__tests__/event-series.test.ts server/src/index.ts && git commit -m "feat: add event series CRUD API routes"
```

---

### Task 4: Integrate Series into GET /api/events and GET /api/calendar

**Files:**
- Modify: `server/src/routes/events.ts:77-107` (GET /api/events)
- Modify: `server/src/routes/calendar.ts:224-305` (GET /api/calendar)
- Modify: `server/src/routes/__tests__/events.test.ts`
- Modify: `server/src/routes/__tests__/calendar.test.ts`

**Step 1: Write the failing tests**

Add to events test: create a series via direct DB insert or mounted eventSeriesRouter, then GET /api/events and verify series instances are included.

Add to calendar test: create a series, then GET /api/calendar?month=2026-03 and verify series instances appear in the `events` array.

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts src/routes/__tests__/calendar.test.ts`
Expected: FAIL — series instances not in response

**Step 3: Modify GET /api/events**

After fetching standalone events:
1. Query all `event_series`
2. Query `vacation_periods`
3. Query materialized events (`WHERE seriesId IS NOT NULL`)
4. For each series, call `expandSeries` with broad date range
5. Merge into events array, sort by date

**Step 4: Modify GET /api/calendar**

Same expansion logic, scoped to the requested month/year range. Append to the `events` array in response.

**Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts src/routes/__tests__/calendar.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git commit -m "feat: integrate series expansion into events and calendar endpoints" -- server/src/routes/events.ts server/src/routes/calendar.ts server/src/routes/__tests__/events.test.ts server/src/routes/__tests__/calendar.test.ts
```

---

### Task 5: Auto-materialize on RSVP

**Files:**
- Modify: `server/src/routes/attendance.ts:12-27` (POST /api/attendance)
- Modify: `server/src/routes/__tests__/attendance.test.ts`

**Step 1: Write the failing test**

Create a series, create a player, then POST /api/attendance with a synthetic `eventId` like `series-1-2026-03-02`. Expect 200 and the returned eventId to be a real numeric ID.

Test app must mount eventSeriesRouter and playersRouter alongside attendanceRouter.

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/attendance.test.ts`
Expected: FAIL — synthetic ID not recognized

**Step 3: Implement auto-materialization**

In POST /api/attendance, before processing:
1. Check if `eventId` is a string starting with `series-`
2. Parse seriesId and date from it
3. Check if a materialized event already exists for that series+date
4. If not, insert a new event row from the series template with that date and seriesId
5. Replace eventId with the real event ID
6. Continue normal RSVP flow

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/attendance.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: auto-materialize series instances on RSVP" -- server/src/routes/attendance.ts server/src/routes/__tests__/attendance.test.ts
```

---

### Task 6: Frontend — Series Toggle in Event Creation Form

**Files:**
- Modify: `web/src/app/dashboard/events/new/page.tsx`

**Step 1: Read the current form fully**

**Step 2: Add series mode**

- Read `?series=true` URL param with `useSearchParams()` → initialize series toggle
- Replace "Recurring" toggle with "Series" toggle
- When series enabled, show:
  - Day of week picker (Mon–Sun, single select)
  - Start date + end date inputs
  - Deadline offset dropdown (None, 24h, 48h, 72h)
- Hide single `date` field when series is on
- On submit in series mode: POST to `/api/event-series`, redirect to `/events/`

**Step 3: Verify in browser**

- Normal event creation still works
- `?series=true` pre-toggles series mode
- Series creation submits correctly

**Step 4: Commit**

```bash
git commit -m "feat(ui): add series creation mode to event form" -- web/src/app/dashboard/events/new/page.tsx
```

---

### Task 7: Frontend — Empty State Buttons

**Files:**
- Modify: `web/src/app/events/page.tsx:87-90`
- Modify: `web/src/app/dashboard/page.tsx:116-119`

**Step 1: Update events page empty state**

Replace current empty div with:
- Calendar icon (SVG)
- "No events yet" heading
- "Create your first event or set up a recurring series" subtext
- Two buttons: "Create Event" → `/dashboard/events/new/`, "Create Series" → `/dashboard/events/new/?series=true`
- Use emerald color scheme matching the app's design

**Step 2: Update dashboard page empty state**

Same pattern as events page.

**Step 3: Verify in browser**

- Empty tabs show new buttons
- Buttons navigate correctly
- With events present, normal grid renders

**Step 4: Commit**

```bash
git commit -m "feat(ui): add empty state buttons for event and series creation" -- web/src/app/events/page.tsx web/src/app/dashboard/page.tsx
```

---

### Task 8: Frontend — Series Badge on EventCard & Calendar Sidebar

**Files:**
- Modify: `web/src/components/EventCard.tsx`
- Modify: `web/src/app/calendar/page.tsx`

**Step 1: Add series badge to EventCard**

Add optional `seriesId` prop. When present, render a small "Series" pill badge next to the type badge.

**Step 2: Calendar sidebar — Series section**

After the vacations section, add "Event Series" section:
- Fetch `GET /api/event-series`
- List each series: title, day name, date range
- Link to series detail or edit

**Step 3: Verify in browser**

**Step 4: Commit**

```bash
git commit -m "feat(ui): add series badge to event cards and calendar sidebar" -- web/src/components/EventCard.tsx web/src/app/calendar/page.tsx
```

---

### Task 9: Frontend — Event Detail Page Series Actions

**Files:**
- Modify: `web/src/app/events/[id]/EventDetailClient.tsx`

**Step 1: Add series banner and coach actions**

When event has `seriesId`:
- Show "Part of series: [Title]" banner
- Coach actions: "Edit this instance", "Cancel this instance" (calls exclude endpoint), "Edit entire series"

**Step 2: Handle synthetic IDs**

If URL id matches `series-{id}-{date}` pattern:
- Parse seriesId and date
- Fetch series from `/api/event-series/{seriesId}`
- Display virtual event from template
- RSVP triggers auto-materialization

**Step 3: Verify in browser**

**Step 4: Commit**

```bash
git commit -m "feat(ui): add series awareness to event detail page" -- web/src/app/events/[id]/EventDetailClient.tsx
```

---

### Task 10: Run Full Test Suite & Compile

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All pass

**Step 2: Run frontend compile**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 3: Fix any failures and commit**

---

### Task 11: Update Documentation

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`
- Modify: `docs/QUICK_START_COACHES.md`

**Step 1: Update FEATURES.md** — add event series items

**Step 2: Update RELEASE_NOTES.md** — add entry for event series, empty state buttons

**Step 3: Update coach guide** — add "Creating Event Series" section

**Step 4: Commit**

```bash
git commit -m "docs: add event series to features, release notes, and coach guide" -- FEATURES.md RELEASE_NOTES.md docs/QUICK_START_COACHES.md
```
