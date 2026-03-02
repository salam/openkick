# Calendar List View: Infinite Scroll + Attendance + Events Merge

**Date:** 2026-03-02

## Summary

Three changes to the Calendar page's list mode:

1. **Infinite scroll** — bidirectional month loading (past and future)
2. **Compact attendance info** — show registration/absence counts per event
3. **Merge Events into Calendar** — the Calendar list view replaces the standalone Events page; add type filters from Events page into list mode

## Backend: Attendance Counts in Calendar API

**File:** `server/src/routes/calendar.ts`

The `GET /api/calendar` endpoint currently returns raw event rows without attendance. Add a LEFT JOIN to compute counts per event:

- `attendingCount` — COUNT where attendance.status = 'yes'
- `absentCount` — COUNT where attendance.status = 'no'
- `totalPlayers` — total player count from players table

Training instances (generated from schedule, not in events table) get no attendance data.

## Frontend: Infinite Scroll ListView

**File:** `web/src/components/CalendarView.tsx` (ListView function)

Current: ListView receives all events for the current month as props.

New: ListView manages its own month-range state internally:

- Starts at current month (seeded by parent props)
- Uses `IntersectionObserver` on sentinel `<div>`s at top and bottom
- When bottom sentinel enters viewport → fetch next month via `/api/calendar?month=YYYY-MM`, append
- When top sentinel enters viewport → fetch previous month, prepend (preserve scroll position)
- Guard: max 12 months in each direction
- Show small spinner at top/bottom while loading
- "Scroll to today" button already exists, continues working

**Parent page changes (`web/src/app/calendar/page.tsx`):**
- When `viewMode === 'list'`, pass the initial month's data plus a fetch callback
- ListView calls the callback internally for additional months

## Frontend: Type Filters in List Mode

Bring over the filter pills from the Events page (All / Training / Tournament / Match) into the Calendar page header, visible only when `viewMode === 'list'`. Pass active filter to ListView for client-side filtering.

## Frontend: Compact Attendance Display

In each event row in the list view, after the type badge, show:

```
✓ 8  ✗ 2
```

- Green `✓ N` for attending count
- Red `✗ N` for absent count
- Only shown when counts are available (> 0)
- Small text, inline with existing badges

## Frontend: Merge Events → Calendar

- The `/events` page becomes a redirect to `/calendar` with `?view=list`
- Remove EventsPage component (or make it redirect)
- The EventCard grid view is dropped in favor of the calendar list view
- Navigation links pointing to `/events` should point to `/calendar`

## Files Changed

| File | Change |
|------|--------|
| `server/src/routes/calendar.ts` | Add attendance LEFT JOIN to calendar endpoint |
| `web/src/components/CalendarView.tsx` | Infinite scroll in ListView, attendance chips |
| `web/src/app/calendar/page.tsx` | Type filter pills, fetch callback for ListView |
| `web/src/app/events/page.tsx` | Redirect to `/calendar?view=list` |
| `web/src/components/Navbar.tsx` | Update Events nav link if needed |
