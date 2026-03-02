# Vacation Info After Sync + Vacations in Calendar List View

**Date:** 2026-02-28

## Goal

Two small UI enhancements:
1. After syncing Zurich holidays, show the next 3 upcoming vacation blocks — both in the success message and as a persistent mini-list below the Sync button.
2. Interleave vacation periods into the calendar's list view chronologically (by month), instead of only showing them as a static banner at the top.

## 1. Settings Page — Upcoming Vacations After Sync

### Backend

`POST /api/vacations/sync-zurich` currently returns `{ synced: number }`.

Change: after syncing, query the DB for the next 3 vacation periods where `endDate >= today`, ordered by `startDate ASC`, limit 3. Return them as `upcoming: { name, startDate, endDate }[]` alongside `synced`.

### Frontend

In `handleSyncZurich()`:
- Store `upcoming` in component state.
- Show success toast: "Synced! Next: Sportferien (Feb 9–22), Fruhlingsferien (Apr 20–May 3), ..."
- Render a small list below the Sync button showing these 3 upcoming blocks persistently (until next page load).

## 2. Calendar List View — Vacations Interleaved

### Current state

`ListView` in `CalendarView.tsx` renders vacation banners as a block above all events (lines 367–380). Events are grouped by month.

### Change

Merge vacations into the month-grouped structure. For each vacation period, determine which months it spans and insert a vacation row into each relevant month group. Render vacation rows with the existing purple styling, positioned chronologically by `startDate` within the month.

## Files to modify

- `server/src/routes/calendar.ts` — enhance sync-zurich response
- `server/src/routes/__tests__/calendar.test.ts` — test upcoming field
- `web/src/app/settings/page.tsx` — display upcoming after sync
- `web/src/components/CalendarView.tsx` — interleave vacations in ListView
