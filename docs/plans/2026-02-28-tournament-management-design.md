# Tournament Management (PRD 4.5.2) — Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Six remaining features from PRD 4.5.2: open call mode, threshold alerts, public tournament view, initial disambiguation, team name management, and upcoming tournaments widget.

## Decisions

- **Public tournament view**: Dedicated public API route (`/api/public/tournaments/:id`) + public Next.js page (`/tournaments/[id]`). Keeps public surface explicit and separate from authenticated API.
- **Threshold alerts**: Both WhatsApp (via WAHA) and in-app (dashboard notifications).
- **Homepage widget**: Read-only for all visitors — no register button on the public homepage.
- **Last-name initial**: Coach fills in manually for now; WhatsApp-based parent ask deferred to a later iteration.

## 1. Open Call Mode

**Database**: Add `minParticipants` INTEGER column to `events` (nullable). `maxParticipants = NULL` already means "no limit".

**Backend**:
- When `maxParticipants` is NULL, skip waitlist logic — all RSVPs go to `attending`.
- After deadline passes, auto-trigger team assignment if teams haven't been formed (lazy check on next access).
- Event create/update accepts `minParticipants`.

**Frontend**: Toggle "Open call (no participant limit)" on event creation form (tournament type only). When enabled, hide max participants field, show optional `minParticipants` input.

## 2. Registration Threshold Alerts

**Triggers** (checked on every RSVP change for tournament events):
- `attending >= maxParticipants * 0.8` → "Spots filling up"
- `attending >= maxParticipants` → "Tournament full"
- `attending < minParticipants` AND deadline < 48h away → "Not enough players"

**Notification channels**:
- **WhatsApp**: Send via WAHA to the event creator's phone number. One alert per threshold crossing.
- **In-app**: New `notifications` table (id, userId, eventId, type, message, read, createdAt). Dashboard bell icon with unread count.

**De-duplication**: Store `lastAlertType` per event in a `tournament_alerts` table to avoid re-sending.

## 3. Public Tournament View

**New API**: `GET /api/public/tournaments/:id`
- No auth required.
- Returns: title, date, startTime, location, teamName, teams with player initials (computed server-side).
- 404 if event is not type `tournament`.

**New page**: `/tournaments/[id]`
- Tournament title, date, time, location.
- Team cards: team name + player initials list.
- Status badge: "Registration open" / "Closing soon" / "Closed".
- Read-only, no register button. Shareable URL.

## 4. First-Name Initial Disambiguation

**Algorithm**:
1. Collect all attending players' first names per team.
2. Compute first initial: `"Jonas"` → `"J."`.
3. Detect collisions within the same team.
4. For colliding players, append last-name initial: `"J. M."` and `"J. S."`.

**Storage**: New column `lastNameInitial` CHAR(1) nullable on `players` table.

**UX**: Coach sets it from player management page. System flags players needing disambiguation (collision in an upcoming tournament) with a warning badge.

## 5. Tournament Team Name Management

**Database**: `teamName` column already exists on `events`. No schema change.

**Frontend**: "Team Name" text input on event create/edit form, visible when type is `tournament`. Placeholder: "e.g., FC Example E1". Displayed on public tournament view and event detail.

**Default fallback**: Club name from settings + " — Team A/B/C".

## 6. Upcoming Tournaments Widget

**API**: Extend `GET /api/events` with `upcoming=true` filter (date >= today, sorted ascending).

**Component**: `UpcomingTournaments` on dashboard page.
- Fetches next 3 upcoming tournaments.
- Each card: title, date, location, status badge, attending count.
- "View all" link to events page filtered by tournaments.
- Read-only for non-logged-in visitors.

**Placement**: Dashboard, after onboarding checklist, before event cards.
