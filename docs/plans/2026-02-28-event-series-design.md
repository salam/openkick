# Event Series Design

**Date**: 2026-02-28
**Status**: Approved

## Summary

Add event series support: coaches can create recurring weekly events that dynamically expand, skip vacation weeks, and allow per-instance overrides (edit, cancel, RSVP). Empty states on dashboard and events pages get action buttons.

## Approach: Hybrid Dynamic Expansion with Lazy Materialization

- Series stored as a template with recurrence rule
- Instances expanded dynamically at query time (no upfront row creation)
- When a user interacts with a specific instance (RSVP, edit, cancel), that instance gets materialized as a real `events` row linked to the series
- Vacation weeks auto-skipped during expansion

## Database Schema

### New table: `event_series`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Series ID |
| `type` | TEXT NOT NULL | training, tournament, match, friendly |
| `title` | TEXT NOT NULL | Base title for all instances |
| `description` | TEXT | Base description |
| `startTime` | TEXT | e.g. "18:00" |
| `attendanceTime` | TEXT | e.g. "17:45" |
| `location` | TEXT | Default location |
| `categoryRequirement` | TEXT | Comma-separated categories |
| `maxParticipants` | INTEGER | |
| `minParticipants` | INTEGER | |
| `recurrenceDay` | INTEGER NOT NULL | ISO day of week (1=Mon, 7=Sun) |
| `startDate` | TEXT NOT NULL | First occurrence (YYYY-MM-DD) |
| `endDate` | TEXT NOT NULL | Last possible occurrence (YYYY-MM-DD) |
| `customDates` | TEXT | JSON array of manually added dates |
| `excludedDates` | TEXT | JSON array of manually removed dates |
| `deadlineOffsetHours` | INTEGER | Hours before event for RSVP deadline |
| `createdBy` | INTEGER REFERENCES guardians(id) | |
| `createdAt` | TEXT DEFAULT (datetime('now')) | |

### Changes to `events` table

Add column: `seriesId INTEGER REFERENCES event_series(id)` — links materialized instance to series. NULL for standalone events.

## API Endpoints

### New endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST /api/event-series` | Create series | |
| `GET /api/event-series` | List all series | |
| `GET /api/event-series/:id` | Series detail + expanded dates | |
| `PUT /api/event-series/:id` | Update series template | |
| `DELETE /api/event-series/:id` | Delete series + materialized instances | |
| `POST /api/event-series/:id/exclude` | Exclude a date | |
| `POST /api/event-series/:id/materialize` | Materialize single instance | |

### Modified endpoints

- `GET /api/events` — merges expanded series instances with standalone events. Virtual instances get synthetic IDs: `series-{seriesId}-{date}`.
- `GET /api/calendar` — same merge logic for calendar views.
- `POST /api/attendance` — auto-materializes virtual series instances on RSVP.

### Expansion service

```
expandSeries(series, dateRange, vacationPeriods) → VirtualEvent[]
```

1. Generate weekly dates from `startDate` to `endDate` on `recurrenceDay`
2. Add `customDates`
3. Remove dates in `vacation_periods` ranges
4. Remove `excludedDates`
5. Filter to requested `dateRange`
6. Replace with materialized `events` row where one exists (by `seriesId` + `date`)

## Frontend Changes

### Event creation form (series mode)

- "Series" toggle replaces current "Recurring" toggle
- When enabled: day-of-week picker, start/end date range, deadline offset dropdown
- Submits to `POST /api/event-series`

### Calendar page

- Series instances render same as regular events
- Small series badge on instances
- Sidebar: "Series" section listing active series

### Event detail page (series instance)

- Banner: "Part of series: [Title]" with link
- RSVP auto-materializes
- Coach actions: edit this instance, cancel this instance, edit entire series

### Empty state buttons

On events page and dashboard when no events exist:
- Icon + "No events yet" text
- "Create Event" button → `/dashboard/events/new/`
- "Create Event Series" button → `/dashboard/events/new/?series=true`

### Events page filter

- "Series" filter button added alongside All/Training/Tournament/Match

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Vacation added after series | Expansion auto-skips new vacation dates |
| Coach edits series title | Virtual instances update; materialized keep overrides |
| Coach deletes materialized instance | Reverts to virtual instance |
| RSVP on virtual instance | Auto-materialize in transaction, then record attendance |
| Series end date in past | No expansion; visible in series list for history |

## Testing

- Unit: expansion logic (weekly gen, vacation skip, custom/excluded dates, materialized merging)
- Integration: API CRUD, materialization on RSVP, cascade delete
- Frontend: empty states, series toggle, filter
