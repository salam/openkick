# Public Event Detail Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a reduced, public version of `/events/[id]` when the user is not logged in, with basic event info and an inline RSVP flow.

**Architecture:** Remove `AuthGuard` from the events layout and add it individually to pages that still need it (events list, new event). Create a new `GET /api/public/events/:id` server endpoint following the existing `public-tournaments.ts` pattern. Adapt `EventDetailClient` to branch on auth state: public view fetches from the public endpoint and shows only safe info + inline RSVP; authenticated view stays unchanged.

**Tech Stack:** Express (server), Next.js/React (web), existing Altcha captcha, existing `/api/rsvp/*` endpoints

---

### Task 1: Create public events API endpoint

**Files:**
- Create: `server/src/routes/public-events.ts`
- Modify: `server/src/index.ts`

**Step 1: Write the endpoint**

Create `server/src/routes/public-events.ts` following the `public-tournaments.ts` pattern. It should:

- Accept `GET /public/events/:id`
- Support both numeric IDs and synthetic series IDs (`series-<id>-<date>`)
- For numeric IDs: query `events` table, return only safe fields (title, type, date, startTime, attendanceTime, location, description, categoryRequirement, deadline, maxParticipants, attachmentUrl, seriesId)
- For series IDs: query `event_series` table, build a virtual event response
- Never return player names, attendance data, or other sensitive fields

**Step 2: Mount in server index**

In `server/src/index.ts`, import `publicEventsRouter` and mount it at `/api` next to `publicTournamentsRouter` (around line 76).

**Step 3: Compile and verify**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

Commit `server/src/routes/public-events.ts` and `server/src/index.ts`.

---

### Task 2: Remove AuthGuard from events layout, add to individual pages

**Files:**
- Modify: `web/src/app/events/layout.tsx`
- Modify: `web/src/app/events/page.tsx`
- Modify: `web/src/app/events/new/page.tsx`

**Step 1: Update events layout — remove AuthGuard**

In `web/src/app/events/layout.tsx`, remove the `AuthGuard` import and wrapper. Keep `Navbar` and the page shell (`min-h-screen bg-gray-50`, `<main>` wrapper).

**Step 2: Wrap events list page in AuthGuard**

In `web/src/app/events/page.tsx`:
- Import `AuthGuard` from `@/components/AuthGuard`
- Wrap the entire return JSX in `<AuthGuard>...</AuthGuard>`

**Step 3: Wrap new event page in AuthGuard**

In `web/src/app/events/new/page.tsx`:
- Import `AuthGuard` from `@/components/AuthGuard`
- Wrap the entire return JSX in `<AuthGuard>...</AuthGuard>`

**Step 4: Compile and verify**

Run: `cd web && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

Commit all three layout/page files.

---

### Task 3: Add i18n keys for the public event view

**Files:**
- Modify: `web/src/lib/i18n.ts`

**Step 1: Add new i18n keys to all three language blocks (de, en, fr)**

Keys to add:
- `login_for_details` — "Log in to see full details." / "Melde dich an, um alle Details zu sehen." / "Connectez-vous pour voir tous les details."
- `login_button` — "Log in" / "Anmelden" / "Se connecter"
- `public_rsvp_title` — "Report Attendance" / "Anwesenheit melden" / "Signaler la presence"
- `public_rsvp_desc` — "Enter your child's name to report attendance." / "Gib den Namen deines Kindes ein, um die Anwesenheit zu melden." / "Entrez le nom de votre enfant pour signaler la presence."

**Step 2: Commit**

Commit `web/src/lib/i18n.ts`.

---

### Task 4: Adapt EventDetailClient for public view with inline RSVP

**Files:**
- Modify: `web/src/app/events/[id]/EventDetailClient.tsx`

This is the main task. Changes needed:

**Step 1: Add auth state tracking**

- Import `isAuthenticated` from `@/lib/auth`
- Add state: `const [authed, setAuthed] = useState<boolean | null>(null)` (null = loading)
- In the token decode useEffect, call `isAuthenticated()` and set `authed`. Only decode token if authenticated.

**Step 2: Branch the event fetch**

- When `authed === null`: don't fetch yet (still determining auth)
- When `authed === false`: fetch from `/api/public/events/${id}` — map response to EventDetail (set attendanceSummary to zeroes)
- When `authed === true`: existing fetch logic (unchanged)
- Add `authed` to the useEffect dependency array

**Step 3: Guard coach-only fetches**

- In the attendance fetch useEffect, also check `authed === true`
- In the teams fetch useEffect, also check `authed === true`

**Step 4: Add public RSVP state and handlers**

Add state for the 3-step RSVP flow:
- `rsvpStep`: 'search' | 'confirm' | 'done'
- `rsvpName`, `rsvpCaptcha`, `rsvpToken`, `rsvpPlayerInitials`, `rsvpEventTitle`
- `rsvpSearching`, `rsvpConfirming`, `rsvpResult`, `rsvpError`

Add two handlers:
- `handlePublicRsvpSearch()`: calls `POST /api/rsvp/search` with name, eventId, captcha. On success, stores rsvpToken and advances to 'confirm' step.
- `handlePublicRsvpConfirm(status)`: calls `POST /api/rsvp/confirm` with rsvpToken and status. On success, shows result and advances to 'done' step.

**Step 5: Render the public view**

Before the main authenticated return, add a branch: `if (authed === false && event)`. Render:

1. **Header** — type badge, deadline countdown, title (same as authenticated)
2. **Info grid** — date, start time, attendance time, location, deadline, max participants (same as authenticated)
3. **Description** — if present
4. **Category badges** — if present
5. **Attachment link** — if present
6. **Public RSVP section** — green bordered card with:
   - 'search' step: Altcha widget, name input, search button
   - 'confirm' step: confirmation question with player initials, Attending/Absent buttons, "select other" link
   - 'done' step: success message, "confirm another" link
7. **Login banner** — centered card with "Log in for full details" text and login button

Do NOT show: attendance summary, attendance table, teams, checklists, reminders, series actions, tournament results.

**Step 6: Compile and verify**

Run: `cd web && npx tsc --noEmit`
Expected: No type errors

**Step 7: Commit**

Commit `web/src/app/events/[id]/EventDetailClient.tsx`.

---

### Task 5: Test in target environment

**Step 1: Start server and frontend**

**Step 2: Test public API endpoint**

Curl `http://localhost:3001/api/public/events/1` — expect JSON with public fields only.

**Step 3: Test public event page in browser**

1. Open incognito / clear localStorage
2. Navigate to `/events/1/`
3. Verify: simplified view with header, info grid, description, RSVP section, login banner
4. Verify: NO attendance summary, NO coach tools

**Step 4: Test RSVP flow**

1. Complete captcha
2. Enter player name, click search
3. Confirm attendance
4. Verify success message

**Step 5: Test authenticated view unchanged**

1. Log in as coach
2. Navigate to same event URL
3. Verify: full view with all sections

**Step 6: Test auth-gated pages still redirect**

1. Log out
2. Navigate to `/events/` — should redirect to `/login/`
3. Navigate to `/events/new/` — should redirect to `/login/`

---

### Task 6: Update release notes and features

**Files:**
- Modify: `RELEASE_NOTES.md`
- Modify: `FEATURES.md`

**Step 1:** Add to RELEASE_NOTES.md: "Public event pages — share event links with anyone; visitors can view event details and RSVP without logging in"

**Step 2:** Add feature entry to FEATURES.md.

**Step 3:** Commit both files.
