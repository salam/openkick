# Bugfixes

## Navigation / Layout

- [✔️] **BUG1** — Calendar and Settings pages missing toolbar (Navbar). Root cause: these routes had no `layout.tsx` with Navbar, unlike `/dashboard/`, `/events/`, and `/players/`. Fixed by adding `layout.tsx` for both routes and removing inline `AuthGuard` from the page components.

## Holidays / Sync

- [✔️] **BUG3** — "Sync Zurich Holidays" button always fails with "Failed to sync Zurich holidays." Root cause: the frontend `handleSyncZurich()` calls `POST /api/vacations/sync-zurich` without sending a JSON body. The backend expects `{ year }` in `req.body` and returns 400 when it's missing. The error message is swallowed by a generic catch block. Fixed by sending `{ year: new Date().getFullYear() }` in the request body and showing the actual error message on failure.

- [✔️] **BUG3b** — Syncing holidays creates duplicate rows, causing "upcoming" to show the same vacation 3 times. Root cause: `vacation_periods` table had no UNIQUE constraint, so `INSERT OR IGNORE` never ignored anything. Fixed by adding `UNIQUE(name, startDate, endDate, source)` to the table schema.

- [✔️] **BUG3c** — Missing single-day public holidays (Karfreitag, Auffahrt, Pfingstmontag, Bundesfeier, etc.). Root cause: `getZurichHolidays()` only returned the 5 multi-week school vacation blocks. Fixed by adding `getZurichPublicHolidays()` with 6 fixed-date + 4 Easter-based movable holidays, and including them in `syncZurichHolidays()`.

## Settings

- [✔️] **BUG4** — Saved settings not populated when settings page is reloaded. Root cause: `GET /api/settings` returns a plain object `{ key: value }`, but `loadSettings()` treats the response as an array of `{ key, value }` records and calls `.forEach()` — which throws `TypeError` silently caught by the empty catch block, leaving `settings` as `{}`.

- [✔️] **BUG5** — "Test Connection" button for LLM always fails. Root cause: the frontend calls `POST /api/settings/test-llm` but this endpoint does not exist in the server routes — returns 404. Fixed by adding the endpoint to `settingsRouter` that sends a minimal test prompt via `chatCompletion()`.

- [✔️] **BUG5b** — LLM provider name mismatch between frontend and backend. Frontend sends `"anthropic"` but `chatCompletion()` switch expects `"claude"`, causing `Unknown LLM provider` error for Anthropic users. Fixed by accepting both `"anthropic"` and `"claude"` in the provider type and switch statement.

## Tournament Import

- [✔️] **BUG6** — "Import from URL" on tournament creation page returns 404. Root cause: the frontend calls `POST /api/events/import-url` but this route was never registered in the events router. The service layer (`tournament-import.ts`) has `extractFromUrl()` ready, but it was never wired to a route handler. Same issue affects `POST /api/events/import-pdf` (`extractFromPdf()`). Fixed by adding both route handlers to `eventsRouter` with dynamic imports to avoid pdfjs-dist DOMMatrix issues in test environments.

- [✔️] **BUG7** — Dynamic routes (`/events/[id]`, `/tournaments/[id]`, `/live/[tournamentId]`, `/reset-password/[token]`) fail with "missing param in generateStaticParams()" in Next.js 15 with `output: "export"`. Root cause: Next.js 15.5 strictly enforces that `dynamicParams: true` is unsupported with static export, blocking all dynamic routes not pre-rendered by `generateStaticParams`. Fixed by conditionally applying `output: "export"` only in production builds (`process.env.NODE_ENV === 'production'`), so the dev server supports dynamic routes natively while production builds still produce a static export.

## Tournament Results

- [✔️] **BUG8** — Saving custom achievements fails with "Invalid achievement type: custom_4th_place". Root cause: the frontend generates custom achievement types as `"custom_<label>"` (e.g., `"custom_4th_place"`), but the backend validation only allows the literal string `"custom"` in `VALID_ACHIEVEMENT_TYPES`. Fixed by also accepting any type that starts with `"custom_"` in the validation check.

## Captcha

- [✔️] **BUG9** — Altcha captcha "Verified" but RSVP button stays disabled. Root cause: `AltchaWidget.tsx` listens for the `"verification"` DOM event, but Altcha v2.x fires `"verified"` instead. The `onVerify` callback was never called, leaving captcha payload empty. Fixed by changing the event listener from `"verification"` to `"verified"`. This affected all captcha-gated flows (parent RSVP, public RSVP, login).

## Setup / Persistence

- [✔️] **BUG2** — Setup page shown even when an admin account already exists. Root cause: sql.js runs in-memory and `saveDB()` is never called in production code. After creating an admin via `POST /api/setup`, the admin is stored only in memory. On server restart, the DB reloads from disk (which was never updated), so the admin is lost and setup shows again. Fixed by adding auto-persist: `db.run()` is wrapped to call `saveDB()` after every mutation when a `dbPath` is configured.
