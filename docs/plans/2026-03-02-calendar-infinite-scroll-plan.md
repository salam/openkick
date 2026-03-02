# Calendar Infinite Scroll + Attendance + Events Merge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the calendar list view infinitely scrollable in both directions, show compact attendance/absence counts per event, and merge the standalone Events page into the Calendar list view.

**Architecture:** The backend calendar endpoint gets a LEFT JOIN for attendance counts. The frontend ListView becomes self-managing: it tracks a growing array of loaded months, uses IntersectionObserver for bidirectional infinite scroll, and includes type filter pills. The Events page redirects to Calendar with `?view=list`.

**Tech Stack:** React (Next.js), TypeScript, sql.js (SQLite), IntersectionObserver API, Tailwind CSS

---

### Task 1: Backend — Add Attendance Counts to Calendar API

**Files:**
- Modify: `server/src/routes/calendar.ts:270-276` (the standalone events query)
- Modify: `server/src/routes/calendar.ts:312-323` (training instances — add null counts)
- Test: `server/src/routes/__tests__/calendar.test.ts`

**Step 1: Write the failing test**

Add to `server/src/routes/__tests__/calendar.test.ts`:

```typescript
it("GET /api/calendar?month=... includes attendance counts per event", async () => {
  const db = getDB();
  // Create an event for today's month
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dateStr = `${monthStr}-15`;

  db.run(
    "INSERT INTO events (type, title, date, startTime) VALUES (?, ?, ?, ?)",
    ["tournament", "Test Cup", dateStr, "10:00"]
  );
  const eventId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;

  // Create players
  db.run("INSERT INTO players (firstName, lastName) VALUES ('Alice', 'A')");
  const p1 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
  db.run("INSERT INTO players (firstName, lastName) VALUES ('Bob', 'B')");
  const p2 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
  db.run("INSERT INTO players (firstName, lastName) VALUES ('Charlie', 'C')");
  const p3 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;

  // Add attendance records
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, 'yes')", [eventId, p1]);
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, 'no')", [eventId, p2]);
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, 'unknown')", [eventId, p3]);

  const res = await fetch(`${baseUrl}/api/calendar?month=${monthStr}`);
  const data = await res.json();

  const event = data.events.find((e: any) => e.title === "Test Cup");
  expect(event).toBeDefined();
  expect(event.attendingCount).toBe(1);
  expect(event.absentCount).toBe(1);
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run --reporter=verbose src/routes/__tests__/calendar.test.ts`
Expected: FAIL — `attendingCount` is undefined

**Step 3: Implement attendance LEFT JOIN**

In `server/src/routes/calendar.ts`, replace the standalone events query (around line 270-276):

```typescript
// 1. Standalone events with attendance counts
const events: Record<string, unknown>[] = rowsToObjects(
  db.exec(
    `SELECT e.*,
       COALESCE(SUM(CASE WHEN a.status = 'yes' THEN 1 ELSE 0 END), 0) AS attendingCount,
       COALESCE(SUM(CASE WHEN a.status = 'no' THEN 1 ELSE 0 END), 0) AS absentCount
     FROM events e
     LEFT JOIN attendance a ON a.eventId = e.id
     WHERE e.seriesId IS NULL AND e.date >= ? AND e.date <= ?
     GROUP BY e.id
     ORDER BY e.date ASC`,
    [startDate, endDate],
  ),
);
```

Also get total player count once for the response:

```typescript
const totalPlayersResult = db.exec("SELECT COUNT(*) as cnt FROM players");
const totalPlayers = (totalPlayersResult[0]?.values[0]?.[0] as number) || 0;

// Add totalPlayers to each event
for (const ev of events) {
  ev.totalPlayers = totalPlayers;
}
```

For training instances (line ~312-323), add null attendance fields:

```typescript
trainings.push({
  // ... existing fields ...
  attendingCount: null,
  absentCount: null,
  totalPlayers: null,
});
```

For expanded series instances, also add attendance counts. After the series expansion loop, query attendance for those IDs and merge:

```typescript
// After expanding series into events array, add attendance for series events that have real IDs
const seriesEventIds = events
  .filter(e => e.seriesId != null && typeof e.id === 'number')
  .map(e => e.id as number);
if (seriesEventIds.length > 0) {
  const placeholders = seriesEventIds.map(() => '?').join(',');
  const attCounts = rowsToObjects(
    db.exec(
      `SELECT eventId,
         SUM(CASE WHEN status = 'yes' THEN 1 ELSE 0 END) AS attendingCount,
         SUM(CASE WHEN status = 'no' THEN 1 ELSE 0 END) AS absentCount
       FROM attendance WHERE eventId IN (${placeholders}) GROUP BY eventId`,
      seriesEventIds as unknown as import("sql.js").SqlValue[],
    ),
  );
  const attMap = new Map(attCounts.map(r => [r.eventId as number, r]));
  for (const ev of events) {
    if (ev.seriesId != null && typeof ev.id === 'number') {
      const att = attMap.get(ev.id as number);
      ev.attendingCount = att ? att.attendingCount : 0;
      ev.absentCount = att ? att.absentCount : 0;
      ev.totalPlayers = totalPlayers;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run --reporter=verbose src/routes/__tests__/calendar.test.ts`
Expected: PASS

**Step 5: Commit**

```
git restore --staged :/ && git add server/src/routes/calendar.ts server/src/routes/__tests__/calendar.test.ts && git commit -m "feat: add attendance counts to calendar API" -- server/src/routes/calendar.ts server/src/routes/__tests__/calendar.test.ts
```

---

### Task 2: Frontend — Update CalendarEvent Type and ListView Attendance Display

**Files:**
- Modify: `web/src/components/CalendarView.tsx` (CalendarEvent type + ListView rendering)

**Step 1: Add `absentCount` to the CalendarEvent interface**

In `web/src/components/CalendarView.tsx` around line 9-18, add `absentCount`:

```typescript
export interface CalendarEvent {
  id: string;
  title: string;
  type: 'training' | 'tournament' | 'match';
  date: string;
  time: string;
  attendingCount?: number;
  absentCount?: number;
  totalPlayers?: number;
  cancelled?: boolean;
}
```

**Step 2: Add compact attendance chips to ListView event rows**

In the ListView component, find the attendance display section (around line 505-510) and replace:

```typescript
{/* Attendance */}
{ev.attendingCount != null && ev.totalPlayers != null && (
  <span className="shrink-0 text-xs text-gray-500">
    {ev.attendingCount}/{ev.totalPlayers}
  </span>
)}
```

With:

```typescript
{/* Compact attendance */}
{(ev.attendingCount != null && ev.attendingCount > 0) || (ev.absentCount != null && ev.absentCount > 0) ? (
  <span className="flex shrink-0 items-center gap-2 text-xs">
    {ev.attendingCount != null && ev.attendingCount > 0 && (
      <span className="text-green-600">&#10003; {ev.attendingCount}</span>
    )}
    {ev.absentCount != null && ev.absentCount > 0 && (
      <span className="text-red-500">&#10007; {ev.absentCount}</span>
    )}
  </span>
) : null}
```

**Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit`

**Step 4: Commit**

```
git restore --staged :/ && git add web/src/components/CalendarView.tsx && git commit -m "feat: show compact attendance chips in calendar list view" -- web/src/components/CalendarView.tsx
```

---

### Task 3: Frontend — Infinite Scroll in ListView

**Files:**
- Modify: `web/src/components/CalendarView.tsx` (ListView component — major rewrite)
- Modify: `web/src/app/calendar/page.tsx` (pass fetch function to ListView)

**Step 1: Add `onFetchMonth` callback prop to ListView**

Update the ListView props and CalendarViewProps:

```typescript
// Add to CalendarViewProps
interface CalendarViewProps {
  viewMode: ViewMode;
  year: number;
  month: number;
  events: CalendarEvent[];
  vacations: CalendarVacation[];
  onMonthClick?: (month: number) => void;
  onDayClick?: (date: string) => void;
  onChangeMonth?: (year: number, month: number) => void;
  onFetchMonth?: (monthKey: string) => Promise<{ events: CalendarEvent[]; vacations: CalendarVacation[] }>;
}
```

Pass it through to ListView in the main CalendarView component.

**Step 2: Rewrite ListView with infinite scroll**

Replace the entire ListView function with a new implementation that:

1. Manages a `months` map: `Record<string, { events: CalendarEvent[]; vacations: CalendarVacation[] }>`
2. Seeds the initial month from props
3. Uses `useRef` for top and bottom sentinel elements
4. Uses `IntersectionObserver` to trigger loading
5. Tracks `earliestMonth` and `latestMonth` strings
6. Has `loadingTop` and `loadingBottom` states
7. Guards to max 12 months in each direction

Key implementation details:

- Use `useRef` + `IntersectionObserver` with `rootMargin: '200px'` for early triggering
- Month key arithmetic: `prevMonthKey(key)` and `nextMonthKey(key)` helper functions
- `monthDiff(a, b)` to check the 12-month guard
- On prepend: measure `scrollHeight` before and after, adjust `scrollTop` to preserve position
- Reuse the existing per-month rendering logic (vacation dedup, event/vacation interleaving, etc.)

**Step 3: Update calendar page to pass onFetchMonth**

In `web/src/app/calendar/page.tsx`, add a fetch callback:

```typescript
const fetchMonth = useCallback(async (monthKey: string) => {
  const data = await apiFetch<CalendarApiResponse>(`/api/calendar?month=${monthKey}`);
  const allEvents = [...(data.events || []), ...(data.trainings || [])];
  return { events: allEvents, vacations: data.vacations || [] };
}, []);
```

Pass it to `CalendarView`:

```typescript
<CalendarView
  viewMode={viewMode}
  year={year}
  month={month}
  events={events}
  vacations={vacations}
  onMonthClick={handleMonthClick}
  onDayClick={(date) => console.log('Day clicked:', date)}
  onChangeMonth={handleChangeMonth}
  onFetchMonth={fetchMonth}
/>
```

**Step 4: Verify it compiles and works**

Run: `cd web && npx tsc --noEmit`

**Step 5: Commit**

```
git restore --staged :/ && git add web/src/components/CalendarView.tsx web/src/app/calendar/page.tsx && git commit -m "feat: infinite scroll in calendar list view (bidirectional)" -- web/src/components/CalendarView.tsx web/src/app/calendar/page.tsx
```

---

### Task 4: Frontend — Type Filter Pills in List Mode

**Files:**
- Modify: `web/src/app/calendar/page.tsx` (add filter state + pills UI)
- Modify: `web/src/components/CalendarView.tsx` (pass filter to ListView)

**Step 1: Add filter state and UI to calendar page**

In `web/src/app/calendar/page.tsx`, add:

```typescript
type FilterType = 'all' | 'training' | 'tournament' | 'match';

const filterKeys: { value: FilterType; key: string }[] = [
  { value: 'all', key: 'filter_all' },
  { value: 'training', key: 'type_training' },
  { value: 'tournament', key: 'type_tournament' },
  { value: 'match', key: 'type_match' },
];
```

Add state: `const [filter, setFilter] = useState<FilterType>('all');`

In the header area, after the view mode toggle (only visible in list mode):

```typescript
{viewMode === 'list' && (
  <div className="flex flex-wrap gap-2">
    {filterKeys.map((btn) => (
      <button
        key={btn.value}
        onClick={() => setFilter(btn.value)}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          filter === btn.value
            ? 'bg-primary-500 text-white'
            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
        }`}
      >
        {t(btn.key)}
      </button>
    ))}
  </div>
)}
```

**Step 2: Pass filter through CalendarView to ListView**

Add `filter?: string` to CalendarViewProps and pass it down.

**Step 3: Verify compilation**

Run: `cd web && npx tsc --noEmit`

**Step 4: Commit**

```
git restore --staged :/ && git add web/src/app/calendar/page.tsx web/src/components/CalendarView.tsx && git commit -m "feat: add type filter pills to calendar list view" -- web/src/app/calendar/page.tsx web/src/components/CalendarView.tsx
```

---

### Task 5: Merge Events Page into Calendar

**Files:**
- Modify: `web/src/app/events/page.tsx` (redirect to calendar)
- Modify: `web/src/components/Navbar.tsx` (update nav link)
- Modify: `web/src/app/calendar/page.tsx` (read `?view=list` from URL)

**Step 1: Make calendar page respect `?view=list` URL param**

In `web/src/app/calendar/page.tsx`, use `useSearchParams`:

```typescript
import { useSearchParams } from 'next/navigation';

// Inside component:
const searchParams = useSearchParams();

// Initialize viewMode from URL
const [viewMode, setViewMode] = useState<ViewMode>(() => {
  const v = searchParams.get('view');
  if (v === 'list' || v === 'monthly' || v === 'yearly') return v;
  return 'monthly';
});
```

**Step 2: Redirect Events page to Calendar list view**

Replace `web/src/app/events/page.tsx` content:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EventsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/calendar/?view=list');
  }, [router]);
  return null;
}
```

**Step 3: Update Navbar**

In `web/src/components/Navbar.tsx`, remove the events entry and keep only calendar:

```typescript
const navLinks = [
  { href: '/dashboard/', label: 'dashboard' },
  { href: '/calendar/', label: 'calendar' },
  { href: '/players/', label: 'players' },
  { href: '/surveys/', label: 'surveys' },
  { href: '/dashboard/checklists/', label: 'checklists' },
  { href: '/dashboard/payments/', label: 'payments_title' },
  { href: '/settings/', label: 'settings' },
];
```

**Step 4: Verify compilation**

Run: `cd web && npx tsc --noEmit`

**Step 5: Commit**

```
git restore --staged :/ && git add web/src/app/events/page.tsx web/src/components/Navbar.tsx web/src/app/calendar/page.tsx && git commit -m "feat: merge events page into calendar list view" -- web/src/app/events/page.tsx web/src/components/Navbar.tsx web/src/app/calendar/page.tsx
```

---

### Task 6: Run Full Test Suite and Fix Issues

**Step 1: Run backend tests**

Run: `cd server && npx vitest run --reporter=verbose`

**Step 2: Run frontend build**

Run: `cd web && npx next build`

**Step 3: Fix any failures**

Address test failures or type errors iteratively.

**Step 4: Final commit if fixes were needed**

```
git restore --staged :/ && git add <fixed-files> && git commit -m "fix: address test/build issues from calendar merge"
```
