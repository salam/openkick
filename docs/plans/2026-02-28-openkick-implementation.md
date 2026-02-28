# OpenKick Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-hosted youth football attendance & tournament management system with WhatsApp integration.

**Architecture:** Express API + sql.js database in `server/`, Next.js static export in `web/`, WAHA for WhatsApp. Monorepo with shared TypeScript.

**Tech Stack:** Node.js, Express, sql.js, Next.js, React, Tailwind CSS, Vitest, TypeScript

---

## Phase 1: Project Scaffolding & Database

### Task 1: Server project setup

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/index.ts`
- Create: `server/.env.example`

**Steps:**
1. Create `server/package.json` with dependencies matching the user's reference package.json (sql.js, express, cors, bcryptjs, jsonwebtoken, dotenv, vitest)
2. Create `server/tsconfig.json` targeting ES2022, module NodeNext, outDir dist
3. Create `server/vitest.config.ts`
4. Create `server/src/index.ts` — minimal Express app that listens on PORT env var, with CORS and JSON body parser
5. Create `server/.env.example` with PORT=3001
6. Run `cd server && npm install`
7. Run `npm test` (should pass with no tests)
8. Commit: "feat: scaffold server project"

### Task 2: Database layer with sql.js

**Files:**
- Create: `server/src/database.ts`
- Create: `server/src/__tests__/database.test.ts`

**Steps:**
1. Write test: database initializes, creates tables, returns a db instance
2. Write test: database persists to file and reloads
3. Implement `database.ts`: initDB() loads sql.js WASM, opens/creates DB file at `data/openkick.db`, runs migrations creating all tables (players, guardians, guardian_players, events, attendance, teams, team_players, vacation_periods, training_schedule, settings, broadcasts)
4. Run tests, verify pass
5. Commit: "feat: sql.js database layer with schema migrations"

### Task 3: i18n utility

**Files:**
- Create: `server/src/utils/i18n.ts`
- Create: `server/src/utils/__tests__/i18n.test.ts`
- Create: `server/src/utils/translations/de.json`
- Create: `server/src/utils/translations/fr.json`
- Create: `server/src/utils/translations/en.json`

**Steps:**
1. Write test: t('greeting', 'de') returns German string, t('greeting', 'en') returns English
2. Write test: t() with missing key returns key itself
3. Implement i18n.ts: load JSON files, export t(key, lang) function
4. Add initial translation keys for bot messages (welcome, attendance_confirmed, attendance_absent, reminder, etc.)
5. Run tests, verify pass
6. Commit: "feat: i18n translations for de/fr/en"

### Task 4: SFV category calculator

**Files:**
- Create: `server/src/services/categories.ts`
- Create: `server/src/services/__tests__/categories.test.ts`

**Steps:**
1. Write test: getCategoryForBirthYear(2017, 2025) returns "E"
2. Write test: getCategoryForBirthYear(2015, 2025) returns "D-7"
3. Write test: getCategoryForBirthYear(2014, 2025) returns "D-9"
4. Write test: getCategoryForBirthYear(2012, 2025) returns "C"
5. Write test: getSeasonYear() returns correct season based on current date (July 1 boundary)
6. Write test: getAllCategories() returns full list with metadata (name, format, teamSize)
7. Implement categories.ts with the SFV birth year mapping table and calculation logic
8. Run tests, verify pass
9. Commit: "feat: SFV junior category calculator"

## Phase 2: Auth & Core CRUD

### Task 5: Auth service

**Files:**
- Create: `server/src/auth.ts`
- Create: `server/src/__tests__/auth.test.ts`

**Steps:**
1. Write test: hashPassword and verifyPassword work correctly
2. Write test: generateJWT and verifyJWT round-trip a payload
3. Write test: generateAccessToken creates a random URL-safe token
4. Write test: authMiddleware rejects requests without valid JWT
5. Write test: tokenAuthMiddleware accepts valid access token in query param
6. Implement auth.ts with bcryptjs for passwords, jsonwebtoken for JWT, crypto.randomBytes for access tokens
7. Run tests, verify pass
8. Commit: "feat: auth with JWT and passwordless token links"

### Task 6: Players & Guardians routes

**Files:**
- Create: `server/src/routes/players.ts`
- Create: `server/src/routes/__tests__/players.test.ts`

**Steps:**
1. Write test: POST /api/players creates a player, returns id
2. Write test: GET /api/players returns all players with guardian info
3. Write test: PUT /api/players/:id updates player (including category override)
4. Write test: POST /api/guardians creates guardian with phone number
5. Write test: POST /api/guardians/:id/players links guardian to player
6. Write test: GET /api/players includes computed SFV category from birthYear
7. Implement routes using database.ts, wire into index.ts
8. Run tests, verify pass
9. Commit: "feat: player and guardian CRUD routes"

### Task 7: Events routes

**Files:**
- Create: `server/src/routes/events.ts`
- Create: `server/src/routes/__tests__/events.test.ts`

**Steps:**
1. Write test: POST /api/events creates event with all fields (type, date, deadline, maxParticipants, categoryRequirement, etc.)
2. Write test: GET /api/events returns upcoming events sorted by date
3. Write test: GET /api/events/:id returns event with attendance summary
4. Write test: PUT /api/events/:id updates event
5. Write test: DELETE /api/events/:id removes event
6. Write test: GET /api/events?type=tournament filters by type
7. Write test: categoryRequirement filtering works (only eligible players shown)
8. Implement routes
9. Run tests, verify pass
10. Commit: "feat: events CRUD with category filtering"

### Task 8: Attendance routes & waitlist logic

**Files:**
- Create: `server/src/routes/attendance.ts`
- Create: `server/src/services/attendance.ts`
- Create: `server/src/routes/__tests__/attendance.test.ts`
- Create: `server/src/services/__tests__/attendance.test.ts`

**Steps:**
1. Write test: POST /api/attendance sets player status for event
2. Write test: when maxParticipants reached, new attendees go to waitlist
3. Write test: when attending player cancels, first waitlisted player auto-promoted
4. Write test: GET /api/events/:id/attendance returns full attendance list
5. Write test: attendance tracks source (web, whatsapp, whisper, coach)
6. Implement attendance service with waitlist promotion logic
7. Implement attendance routes
8. Run tests, verify pass
9. Commit: "feat: attendance tracking with waitlist auto-promotion"

## Phase 3: Settings & LLM

### Task 9: Settings routes

**Files:**
- Create: `server/src/routes/settings.ts`
- Create: `server/src/routes/__tests__/settings.test.ts`

**Steps:**
1. Write test: GET /api/settings returns all settings as key-value object
2. Write test: PUT /api/settings/:key updates a setting
3. Write test: settings are JSON-encoded (llm_provider stores object)
4. Implement routes, seed default settings on DB init
5. Run tests, verify pass
6. Commit: "feat: settings CRUD"

### Task 10: LLM abstraction service

**Files:**
- Create: `server/src/services/llm.ts`
- Create: `server/src/services/__tests__/llm.test.ts`

**Steps:**
1. Write test: OpenAI provider formats request correctly (mock fetch)
2. Write test: Claude provider formats request with x-api-key header (mock fetch)
3. Write test: Euria provider uses correct Infomaniak URL pattern (mock fetch)
4. Write test: chatCompletion() reads provider from settings and dispatches
5. Write test: getAvailableModels() returns provider list
6. Implement llm.ts with LLMProvider interface, three implementations, factory function that reads from settings DB
7. Run tests, verify pass
8. Commit: "feat: multi-provider LLM abstraction (OpenAI, Claude, Euria)"

### Task 11: Whisper service

**Files:**
- Create: `server/src/services/whisper.ts`
- Create: `server/src/services/__tests__/whisper.test.ts`

**Steps:**
1. Write test: transcribeAudio() sends audio buffer to OpenAI Whisper API (mock fetch)
2. Write test: transcribeAudio() returns transcribed text
3. Implement whisper.ts using OpenAI's /v1/audio/transcriptions endpoint
4. Run tests, verify pass
5. Commit: "feat: Whisper speech-to-text service"

## Phase 4: WhatsApp & Broadcasts

### Task 12: WhatsApp service (WAHA integration)

**Files:**
- Create: `server/src/services/whatsapp.ts`
- Create: `server/src/services/__tests__/whatsapp.test.ts`
- Create: `server/src/routes/whatsapp.ts`

**Steps:**
1. Write test: sendMessage() calls WAHA REST API with correct payload (mock fetch)
2. Write test: parseAttendanceMessage() extracts player name and status from free-form text using LLM
3. Write test: webhook handler processes incoming message, updates attendance, sends confirmation
4. Write test: voice message triggers Whisper transcription then attendance parse
5. Implement whatsapp service and webhook route
6. Run tests, verify pass
7. Commit: "feat: WhatsApp integration via WAHA with message parsing"

### Task 13: Weather service

**Files:**
- Create: `server/src/services/weather.ts`
- Create: `server/src/services/__tests__/weather.test.ts`

**Steps:**
1. Write test: getWeatherForecast(lat, lon, date, time) returns temperature, precipitation, description (mock fetch)
2. Write test: isRainy() returns true when precipitation > 80%
3. Implement using OpenMeteo free API (no key needed)
4. Run tests, verify pass
5. Commit: "feat: weather forecast via OpenMeteo"

### Task 14: Broadcast service & routes

**Files:**
- Create: `server/src/services/broadcasts.ts`
- Create: `server/src/routes/broadcasts.ts`
- Create: `server/src/services/__tests__/broadcasts.test.ts`
- Create: `server/src/routes/__tests__/broadcasts.test.ts`

**Steps:**
1. Write test: composeTrainingHeadsup() generates message with weather, time, location using LLM
2. Write test: composeRainAlert() generates cancellation message
3. Write test: composeHolidayAnnouncement() generates break announcement with next training date
4. Write test: POST /api/broadcasts creates draft broadcast
5. Write test: POST /api/broadcasts/:id/send sends to all guardians via WhatsApp
6. Write test: broadcasts can be filtered by category (only notify parents of E-Junioren, etc.)
7. Implement broadcast templates and routes
8. Run tests, verify pass
9. Commit: "feat: half-automated broadcast system with templates"

### Task 15: Reminder scheduler

**Files:**
- Create: `server/src/services/reminders.ts`
- Create: `server/src/services/__tests__/reminders.test.ts`

**Steps:**
1. Write test: checkPendingReminders() finds events with upcoming deadlines and non-responding guardians
2. Write test: sendReminders() sends WhatsApp messages to non-responders
3. Implement with setInterval-based scheduler (runs every hour)
4. Run tests, verify pass
5. Commit: "feat: automatic attendance reminders"

## Phase 5: Calendar & Holidays

### Task 16: Holiday service

**Files:**
- Create: `server/src/services/holidays.ts`
- Create: `server/src/services/__tests__/holidays.test.ts`

**Steps:**
1. Write test: getZurichHolidays(2026) returns correct week-based vacation periods (Sportferien W7-8, etc.)
2. Write test: parseICS() extracts events from ICS content
3. Write test: extractHolidaysFromUrl() uses LLM to parse webpage content into dates
4. Write test: isVacationDay(date) checks against stored vacation periods
5. Implement holidays.ts with Zurich hardcoded schedule + ICS parser + LLM URL extraction
6. Run tests, verify pass
7. Commit: "feat: school holiday system with Zurich calendar and custom sources"

### Task 17: Calendar & training schedule routes

**Files:**
- Create: `server/src/routes/calendar.ts`
- Create: `server/src/routes/__tests__/calendar.test.ts`

**Steps:**
1. Write test: POST /api/training-schedule creates recurring training day
2. Write test: GET /api/calendar?year=2026 returns all events, trainings, vacations for the year
3. Write test: GET /api/calendar?month=2026-03 returns monthly view
4. Write test: training days during vacation weeks are auto-marked as cancelled
5. Write test: POST /api/vacations creates custom vacation period
6. Write test: POST /api/vacations/import-ics accepts ICS file upload
7. Write test: POST /api/vacations/import-url accepts URL and extracts via LLM
8. Implement calendar routes
9. Run tests, verify pass
10. Commit: "feat: calendar routes with vacation integration"

## Phase 6: Tournament Import & Teams

### Task 18: Tournament import service

**Files:**
- Create: `server/src/services/tournament-import.ts`
- Create: `server/src/services/__tests__/tournament-import.test.ts`

**Steps:**
1. Write test: extractFromPdf() sends PDF text to LLM and extracts event details (mock)
2. Write test: extractFromUrl() fetches URL content and extracts event details via LLM (mock)
3. Write test: extracted data maps to event creation fields (title, date, location, categories, deadline)
4. Implement tournament-import.ts
5. Run tests, verify pass
6. Commit: "feat: tournament import from PDF and URL via LLM"

### Task 19: Team assignment

**Files:**
- Create: `server/src/services/team-assignment.ts`
- Create: `server/src/routes/teams.ts`
- Create: `server/src/services/__tests__/team-assignment.test.ts`

**Steps:**
1. Write test: assignTeams(eventId, teamCount) distributes attending players evenly
2. Write test: assignment respects category grouping
3. Write test: POST /api/events/:id/teams triggers auto-assignment
4. Write test: GET /api/events/:id/teams returns team rosters
5. Write test: PUT /api/teams/:id/players allows manual adjustment
6. Implement team-assignment service and routes
7. Run tests, verify pass
8. Commit: "feat: team auto-assignment for tournaments"

## Phase 7: Web Frontend

### Task 20: Next.js project setup

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/tailwind.config.ts`
- Create: `web/next.config.ts` (static export)
- Create: `web/src/app/layout.tsx`
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/i18n.ts`

**Steps:**
1. Create Next.js app with App Router, TypeScript, Tailwind CSS
2. Configure next.config.ts with `output: 'export'` for static hosting
3. Create API client in lib/api.ts (fetch wrapper with auth token)
4. Create i18n.ts with browser language detection and translation loading
5. Create root layout with language provider
6. Run `npm run build` to verify static export works
7. Commit: "feat: scaffold Next.js frontend with static export"

### Task 21: Login & auth pages

**Files:**
- Create: `web/src/app/login/page.tsx`
- Create: `web/src/lib/auth.ts`
- Create: `web/src/components/AuthGuard.tsx`

**Steps:**
1. Build login page with email + password form for coaches/admins
2. Build auth.ts: store JWT in localStorage, attach to API calls
3. Build AuthGuard component that redirects unauthenticated users
4. Support token-link auth for parents (read token from URL query param)
5. Commit: "feat: login page and auth flow"

### Task 22: Dashboard page

**Files:**
- Create: `web/src/app/dashboard/page.tsx`
- Create: `web/src/components/EventCard.tsx`
- Create: `web/src/components/AttendanceTable.tsx`

**Steps:**
1. Build dashboard showing upcoming events as cards
2. Each card shows: title, date, attendance count, deadline
3. Build AttendanceTable showing player list with status indicators
4. Add quick filters: event type, category
5. Commit: "feat: coach dashboard with event cards and attendance"

### Task 23: Event detail & RSVP page

**Files:**
- Create: `web/src/app/events/[id]/page.tsx`

**Steps:**
1. Build event detail page showing all event info
2. For parents: show attend/absent buttons (one-click RSVP)
3. For coaches: show full attendance list, waitlist, team assignments
4. Show attached PDF/flyer if available
5. Commit: "feat: event detail page with RSVP"

### Task 24: Player management page

**Files:**
- Create: `web/src/app/dashboard/players/page.tsx`
- Create: `web/src/components/PlayerList.tsx`

**Steps:**
1. Build player list with name, category, birth year, attendance stats
2. Add/edit player form with category override
3. Link guardians to players
4. Show computed SFV category with manual override option
5. Commit: "feat: player management page"

### Task 25: Calendar page

**Files:**
- Create: `web/src/app/calendar/page.tsx`
- Create: `web/src/components/CalendarView.tsx`

**Steps:**
1. Build CalendarView with three modes: yearly, monthly, list
2. Yearly view: grid of months with colored dots for events/vacations
3. Monthly view: day cells with event cards
4. List view: chronological event list
5. Highlight vacation weeks, show training days
6. Allow coach to add vacation periods and training days from this view
7. Commit: "feat: calendar page with yearly/monthly/list views"

### Task 26: Broadcast composer page

**Files:**
- Create: `web/src/app/dashboard/broadcasts/page.tsx`
- Create: `web/src/components/BroadcastComposer.tsx`

**Steps:**
1. Build broadcast composer with template selection (training headsup, rain alert, cancellation, holiday, custom)
2. Show auto-generated message preview (from LLM)
3. Allow coach to edit message before sending
4. Show recipient count and category filter
5. Send button with confirmation dialog
6. Commit: "feat: broadcast composer page"

### Task 27: Settings page

**Files:**
- Create: `web/src/app/settings/page.tsx`

**Steps:**
1. Build settings form with sections: LLM Config, Bot Language, Holiday Sources, WAHA Config
2. LLM section: provider dropdown (OpenAI/Claude/Euria), model text input, API key input, product_id for Euria
3. Bot language: radio buttons de/fr/en
4. Holiday sources: list of URLs/ICS with add/remove
5. WAHA config: URL input
6. Save button that PUTs to /api/settings
7. Commit: "feat: admin settings page"

### Task 28: Event creation page with tournament import

**Files:**
- Create: `web/src/app/dashboard/events/new/page.tsx`

**Steps:**
1. Build event creation form with all fields
2. Add "Import from URL" button: paste URL, system extracts details via LLM, pre-fills form
3. Add "Import from PDF" button: upload PDF, system extracts details, pre-fills form
4. Category requirement multi-select (A through G)
5. Recurring event toggle with day-of-week selector
6. Commit: "feat: event creation with tournament import"

## Phase 8: Integration & Deployment

### Task 29: Docker compose for WAHA

**Files:**
- Create: `docker-compose.yml`

**Steps:**
1. Create docker-compose.yml with WAHA service
2. Configure WAHA webhook URL pointing to server's /api/whatsapp/webhook
3. Document QR code scanning setup in README
4. Commit: "feat: docker-compose for WAHA"

### Task 30: Build script for cyon.ch deployment

**Files:**
- Modify: `server/package.json` (build script)
- Create: `server/.htaccess`

**Steps:**
1. Add build script matching user's reference pattern (compile TS, reorganize dist/.server/, copy sql.js node_modules)
2. Create .htaccess for cyon.ch
3. Add static export build for web/
4. Test full build pipeline
5. Commit: "feat: cyon.ch deployment build scripts"

### Task 31: FEATURES.md, RELEASE_NOTES.md, .gitignore

**Files:**
- Create: `FEATURES.md`
- Create: `RELEASE_NOTES.md`
- Create: `.gitignore`

**Steps:**
1. Write FEATURES.md with checklist of all implemented features
2. Write RELEASE_NOTES.md following CLAUDE.md format
3. Create comprehensive .gitignore (node_modules, dist, .env, data/*.db, uploads/*)
4. Commit: "docs: features list and release notes"
