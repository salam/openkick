# Public Event Detail Page — Design

**Date:** 2026-03-01
**Status:** Approved

## Goal

When not logged in, show a reduced, simplified version of the `/events/[id]` page with only public information and an inline RSVP flow. Same URL, adaptive rendering based on auth state.

## Architecture

### 1. Layout restructuring

- Remove `AuthGuard` from `web/src/app/events/layout.tsx` (keep Navbar + page shell)
- Wrap `web/src/app/events/page.tsx` (events list) and `web/src/app/events/new/page.tsx` (create event) in `<AuthGuard>` individually, since those pages still require authentication

### 2. New public API endpoint: `GET /api/public/events/:id`

Following the existing `public-tournaments.ts` pattern. Returns only safe public fields:

- `title`, `type`, `date`, `startTime`, `attendanceTime`, `location`, `description`
- `categoryRequirement`, `deadline`, `maxParticipants`, `attachmentUrl`
- No player names, no attendance breakdown, no teams, no checklists

Also supports synthetic series IDs (`series-<id>-<date>`) by fetching from `event_series` table.

### 3. Adaptive EventDetailClient

Check `isAuthenticated()` on mount:

- **Not logged in** — fetch from `/api/public/events/:id`, render:
  - Header (type badge, deadline countdown, title)
  - Info grid (date, time, location, deadline, max participants)
  - Description
  - Category badges
  - Attachment download link
  - Inline RSVP section (see below)
  - "Log in for full details" banner
- **Logged in** — existing behavior unchanged (fetch `/api/events/:id`, role-based sections)

### 4. Public RSVP section

Embed the existing captcha-based RSVP flow on the public page. No new backend endpoints needed — `/api/rsvp/search` and `/api/rsvp/confirm` already work without JWT auth.

Flow:
1. Altcha captcha verification
2. Player name search field (`POST /api/rsvp/search`)
3. Once player found, show Attending / Absent buttons (`POST /api/rsvp/confirm`)

## Files to change

| File | Change |
|------|--------|
| `server/src/routes/public-events.ts` | **New** — public events endpoint |
| `server/src/index.ts` | Mount new public events router |
| `web/src/app/events/layout.tsx` | Remove `AuthGuard` wrapper |
| `web/src/app/events/page.tsx` | Wrap content in `<AuthGuard>` |
| `web/src/app/events/new/page.tsx` | Wrap content in `<AuthGuard>` |
| `web/src/app/events/[id]/EventDetailClient.tsx` | Add public view branch + inline RSVP |

## Privacy

- Public endpoint never exposes player names or attendance details
- RSVP flow uses captcha to prevent abuse
- Only event metadata is publicly visible
