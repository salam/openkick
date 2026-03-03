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

## Theming

- [✔️] **BUG10** — Primary tint color setting has no effect on UI. Root cause: `--tint` CSS variable is set on `<main>` in HomeClient.tsx but no CSS rule or Tailwind utility consumes it. All 343 color references across 57 files use hardcoded `bg-emerald-*` / `text-emerald-*` Tailwind classes, ignoring the user-configured `tint_color`. Fix: define a `primary-*` color palette in `@theme` derived from `--tint` via `color-mix()`, inject `--tint` globally, and replace all `emerald-*` usages with `primary-*`.

## WhatsApp Bot

- [✔️] **BUG11** — WhatsApp phone number matching fails for local-format numbers. Root cause: `normalizePhone()` strips `+`, `00`, and whitespace but does not convert local format (e.g., `0765612900`) to international format (`41765612900`). WAHA sends phones as `41765612900@c.us` (international, no `+`), but guardians entered via admin UI in local format are stored as `0765612900`, causing `findGuardianByPhone` exact match to fail. Fixed by creating shared `normalizePhone()` in `utils/phone.ts` that also strips leading `0` and prepends country code (default `41`, configurable via `default_country_code` setting).

- [✔️] **BUG12** — WhatsApp bot replies "Kein bevorstehendes Event gefunden" even when weekly training exists. Root cause: `findNextUpcomingEvent()` and `findNextEvent()` only query the `events` table. Recurring training schedules (stored in `training_schedule`) and virtual event series instances (expanded from `event_series`) are not checked. Fixed by creating `findNextUpcomingEventAny()` in `services/next-event.ts` that checks all three sources (events, series, training schedules) and auto-materializes virtual events into the `events` table so attendance can be recorded.

## Guardians / Players

- [✔️] **BUG13** — Adding a second player for the same guardian crashes with "UNIQUE constraint failed: guardians.phone". Root cause: `POST /api/guardians` does a blind `INSERT INTO guardians` without checking if a guardian with that phone already exists. The `guardians.phone` column has a `UNIQUE` constraint, so a second insert for the same phone fails. The same issue existed in the WhatsApp onboarding flow. Fixed by checking for an existing guardian by phone first; if found, return the existing record (200) instead of inserting a duplicate. Also added `INSERT OR IGNORE` for the `guardian_players` link in the onboarding flow.

## Homepage / Localization

- [✔️] **BUG14** — Homepage stats bar labels not localized (hardcoded English: "Athletes", "Active", "Tournaments", etc.). Root cause: `HomepageStatsBar` used hardcoded `label` strings in `STAT_CONFIG` instead of i18n keys. Weather descriptions were also English-only from the server's `weatherCodeToDescription()`. Fixed by adding `stat_*` and `weather_*` i18n keys for all three languages (de/en/fr) and localizing on the client side via a shared `weatherDescription()` helper.

- [✔️] **BUG14b** — Weather description text (e.g. "Clear sky") not localized on homepage, navbar, event cards, and event detail. Root cause: server returns English-only `description` from WMO code mapping. Fixed by creating `web/src/lib/weather.ts` with `weatherDescription(code)` that maps WMO codes to localized i18n keys, used in all four weather display locations.

- [✔️] **BUG16** — Dates not localized across the app. Root cause: 15+ scattered `formatDate` implementations with 5 different hardcoded locales (`'en-GB'`, `'en-US'`, `'de-CH'`, `'de-DE'`, `'en'`). Some used `undefined` (browser default), some used `getLanguage()` which returns `'de'`/`'en'`/`'fr'` (not valid BCP 47 locale tags). Fixed by creating a centralized `web/src/lib/date.ts` with `formatDate()`, `formatDateLong()`, `formatDateTime()`, `formatWeekdayShort()`, and `formatDateWeekday()` that map the app language to proper locale tags (`de-CH`, `en-GB`, `fr-CH`). Replaced all 17 call sites across 17 files.

- [✔️] **BUG15** — Trophy count on homepage always shows 0. Root cause: `statistics.service.ts` counts trophies from `game_history WHERE isTrophy = 1` (legacy table), but actual tournament results are stored in the `tournament_results` table. The trophy cabinet component correctly reads from `tournament_results`. Fixed by changing the stats query to `SELECT COUNT(*) FROM tournament_results`.

## Calendar / Events Merge

- [✔️] **BUG16** — Events tab disappeared after calendar merge. The events page redirects to `/calendar/?view=list` but the list view had multiple broken features (BUG17–20). Fixed by resolving all sub-bugs below.

- [✔️] **BUG17** — Events in calendar monthly view not clickable. Root cause: event badges were plain `<div>` elements inside a day `<button>` that only fired `onDayClick` (`console.log`). Fixed by wrapping event badges in `<Link>` to `/events/{id}/` with `stopPropagation`, and changing day cell from `<button>` to `<div role="button">` to avoid invalid nested interactive elements.

- [✔️] **BUG18** — "Zu heute scrollen" button doesn't work in list view. Root cause: `scrollToToday()` looked for `id="calendar-today"` only set on events matching today's date. Fixed by inserting a "today" marker at the correct chronological position when no event exists today.

- [✔️] **BUG19** — Filter pills (Alle/Training/Turnier/Spiel) in list view don't work. Root cause: `filter` prop was never passed to `<CalendarView>`. Fixed by adding `filter={filter}` to the CalendarView JSX.

- [✔️] **BUG20** — Training events duplicated in calendar (gray + primary color). Root cause: backend training_schedule entries lacked `type`, `title`, `time` fields. Fixed by adding `id`, `type: 'training'`, `title: 'Training'`, and `time` fields to training_schedule entries in the calendar API.

- [✔️] **BUG20b** — Sidebar legend showed redundant "Trainingsplan" and "Veranstaltungsserien" sections for the same weekly training. Fixed by filtering training-type event series from the Event Series sidebar section.

- [✔️] **BUG23** — Calendar shows both a standalone event and a virtual series instance for the same date (e.g. `/events/2/` and `/events/series-1-2026-03-04/`). Root cause: the calendar API fetches standalone events (`seriesId IS NULL`) and separately expands event series, without checking for date overlap. Additionally, `materializeVirtualEvent()` in `next-event.ts` creates events WITHOUT setting `seriesId`, so WhatsApp-bot-materialized events appear as orphaned standalone events instead of being linked to their parent series. Fixed by: (1) querying ALL events (not just `seriesId IS NULL`) in the calendar API, (2) using all event dates for series dedup via `coveredDates` set, (3) extracting `seriesId` from virtual event id format `series-{id}-{date}` in `materializeVirtualEvent()`.

## Surveys / Public Access

- [✔️] **BUG24** — Unauthenticated users cannot access survey respond page (`/surveys/respond/[id]/`). Root cause: `surveys/layout.tsx` wraps ALL `/surveys/*` routes in `<AuthGuard>`, redirecting unauthenticated users to `/login/` before `SurveyRespondClient` can render. The backend `GET /api/public/surveys/:id` and `POST /api/public/surveys/:id/respond` correctly require no auth, but the frontend layout blocks access. Same pattern as BUG22 (events). Fixed by removing `AuthGuard` from `surveys/layout.tsx`, conditionally showing `Navbar` only for authenticated users, and wrapping admin-only pages (`surveys/page.tsx`, `surveys/new/page.tsx`, `surveys/[id]/SurveyDetailClient.tsx`) in `AuthGuard` individually.

## Event Detail / Public Access

- [✔️] **BUG22** — Unauthenticated users cannot view event detail pages (regression). Root cause: `events/layout.tsx` wraps all `/events/*` routes in `<AuthGuard>`, redirecting unauthenticated users to `/login/` before `EventDetailClient` can run its public-view logic (which fetches from `/api/public/events/:id`). Fixed by removing `AuthGuard` from the shared events layout and wrapping it only around `/events/new` (which requires authentication).

## API / Frontend Console Errors

- [✔️] **BUG21** — `/api/game-history/latest` returns 404 on every page load when no history exists, flooding the browser console with red errors. Root cause: endpoint returns `404` for "no entries" which is semantically wrong — the resource exists, it's just empty. Fixed by returning 200 with `null` instead of 404.

- [✔️] **BUG21b** — `/api/payments/checkout` returns 400 when donation use case is enabled but payment provider isn't fully configured. The `DonateCard` silently swallows the error, leaving users clicking "Donate" with no feedback. Root cause: `/api/public/payment-status` reports donation as enabled without verifying the linked provider has valid credentials. Fixed by joining `payment_use_cases` with `payment_providers` in the payment-status query and only reporting `enabled: true` when both the use case AND its linked provider are enabled. Also added error display in DonateCard.

- [✔️] **BUG21c** — Donate widget disappears after saving payment settings even though credentials are entered. Root cause: field name mismatch between frontend (`provider`) and backend (`providerId`). GET `/admin/payments/settings` returned `providerId` but the frontend read `provider` (undefined). On save, frontend sent `provider` but backend read `providerId` (undefined), wiping the provider link to NULL. Fixed by aligning the field name to `provider` in the backend GET/PUT responses.

## Anonymous RSVP

- [✔️] **BUGu** — Anonymous RSVP always fails with "Token required". Root cause: field name mismatch between frontend and backend. `handlePublicRsvpConfirm()` sends `{ token: rsvpToken }` but `POST /api/rsvp/confirm` reads `req.body.rsvpToken`. The server never sees the token and falls through to the "Token required" error branch. Fixed by changing the client to send `{ rsvpToken }` matching the server's expected field name.

- [✔️] **BUGv** — Events in the past cannot be joined or absented. Root cause: same as BUGu — the anonymous RSVP flow was broken for ALL events (past and future) due to the token field name mismatch. There are no date guards in either the frontend or backend preventing attendance on past events; the blocker was entirely the broken token passing.

- [✔️] **BUGw** — Unauthenticated users see the admin toolbar (Navbar with Dashboard, Settings, etc.) on public event detail pages. Root cause: `events/layout.tsx` unconditionally renders `<Navbar />` for all visitors. Fixed by checking `isAuthenticated()` on mount and only rendering the Navbar for authenticated users.

## RSVP / WhatsApp Link

- [✔️] **BUG25** — RSVP web link sent via WhatsApp (`http://…/rsvp`) is broken — shows error immediately. Root cause: the RSVP page requires `?event=<id>` query parameter but the WhatsApp help message and coach reminder send bare `/rsvp` URLs without it. The page immediately errors with "Link invalid" because `eventId` is null. Two-part fix: (1) include `?event=<id>` in WhatsApp URLs where event context is available (whatsapp.ts disambiguation + unknown intent, whatsapp-coach.ts reminder), (2) auto-resolve next upcoming event on the RSVP page via `/api/public/next-event` when no `event` param is provided.

## API Authentication / Secret Exposure

- [✔️] **BUG30** — `GET /api/settings` returns ALL settings including API keys, SMTP passwords, WAHA API key, LLM API key, and captcha secrets in plain text to unauthenticated users. Root cause: the settings endpoint had no authentication and no secret filtering. Fixed by defining a `SECRET_KEY_PREFIXES` list and filtering secret keys from unauthenticated responses. Authenticated admin/coach users still see all settings.

- [✔️] **BUG30b** — `GET /api/settings/:key` allows fetching any individual secret by key name without auth. Root cause: no auth check on the single-setting endpoint. Fixed by returning 403 for secret keys when the request lacks valid admin/coach auth.

- [✔️] **BUG30c** — `PUT /api/settings/:key` allows overwriting ANY setting without authentication, including WAHA URL, LLM API key, SMTP credentials. Root cause: no auth middleware on the PUT endpoint. Fixed by requiring `authMiddleware` + `requireRole("admin")`.

- [✔️] **BUG30d** — `POST /api/settings/upload-logo`, `upload-bg`, `remove-logo`, `remove-bg`, `test-llm`, `test-smtp` all operate without authentication. Root cause: none of these endpoints had auth middleware. Fixed by adding `authMiddleware, requireRole("admin")` to all of them.

- [✔️] **BUG31** — All CRUD routes (players, guardians, events, attendance, calendar, broadcasts, event-series, teams, tournament-results, live-ticker, game-history, notifications) have no authentication on write/delete operations. An unauthenticated attacker could create/modify/delete players, events, send WhatsApp broadcasts to all parents, or trigger SSRF via live-ticker crawl endpoints. Root cause: routes were designed without auth middleware. Fixed by adding `authMiddleware, requireRole("admin", "coach")` to all write/delete operations. Read-only endpoints for public data (calendar, trophy cabinet, public events) remain accessible. Notifications require any authenticated user.

## Setup / Persistence

- [✔️] **BUG2** — Setup page shown even when an admin account already exists. Root cause: sql.js runs in-memory and `saveDB()` is never called in production code. After creating an admin via `POST /api/setup`, the admin is stored only in memory. On server restart, the DB reloads from disk (which was never updated), so the admin is lost and setup shows again. Fixed by adding auto-persist: `db.run()` is wrapped to call `saveDB()` after every mutation when a `dbPath` is configured.
