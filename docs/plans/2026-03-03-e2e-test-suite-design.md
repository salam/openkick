# E2E Test Suite Design

## Goal

Add a comprehensive Playwright-based E2E test suite covering 11 user journeys — from initial onboarding through admin navigation, WhatsApp attendance, tournament import, feeds validation, MCP, surveys, and unauthenticated access.

## Tech Choice: Playwright

- Full browser automation + API-level testing via `request` context
- Auto-starts both server (3001) and web (3000) via `webServer` config
- Headless console execution: `npx playwright test`
- Route interception for external URL fixtures (turnieragenda.ch)
- HTTP interception for LLM mocking (WhatsApp intent parsing)

## Directory Structure

```
e2e/
├── playwright.config.ts
├── global-setup.ts              # Wipe DB, ensure clean state
├── fixtures/
│   ├── turnieragenda-7918.html
│   ├── turnieragenda-7918-results-*.html
│   └── waha-messages.json
├── helpers/
│   ├── api.ts                   # Seed data, auth, cleanup
│   ├── onboarding.ts            # Reusable onboarding flow
│   └── auth.ts                  # Login/logout, token storage
├── tests/
│   ├── 01-onboarding.spec.ts
│   ├── 02-add-users.spec.ts
│   ├── 03-add-events.spec.ts
│   ├── 04-tournament-import.spec.ts
│   ├── 05-tournament-results.spec.ts
│   ├── 06-whatsapp-attendance.spec.ts
│   ├── 07-feeds-and-footer.spec.ts
│   ├── 08-mcp-experiments.spec.ts
│   ├── 09-admin-navigation.spec.ts
│   ├── 10-survey-flow.spec.ts
│   └── 11-unauthenticated-pages.spec.ts
└── package.json
```

## Test Specifications

### 01 — Onboarding & Setup from Scratch

- Fresh DB (wiped in `global-setup.ts`)
- Visit `/setup` → fill club name, admin email, password
- Complete onboarding wizard (language, skip WhatsApp config, team creation)
- Verify redirect to dashboard
- Save auth `storageState` for subsequent tests

### 02 — Adding Users

- Navigate to `/dashboard/players`
- Add players: Ava, Marlo, Luca, Noah (with year of birth, category)
- Add 2 guardians linked to players
- Verify player list shows all entries
- Verify guardian associations

### 03 — Adding Events

- Create a training event via `/events/new`
- Create a match event
- Create a tournament event
- Verify events appear in `/calendar`
- Verify event detail pages render correctly
- Verify event counts on dashboard

### 04 — Tournament Import (turnieragenda.ch)

- Use `page.route()` to intercept `turnieragenda.ch/event/detail/7918` → serve fixture HTML
- Trigger import via API (`POST /api/events` with tournament URL) or UI
- Verify event created with correct: title, date, location, category
- Verify imported event appears in calendar

### 05 — Tournament Results (turnieragenda.ch)

- Intercept turnieragenda.ch "Resultate" subpages with fixture HTML
- Import results via `POST /api/tournament-results/:eventId/import`
- Verify results display: placement, scores, achievements
- Check game history entries created
- Verify trophy cabinet updated at `/trophies`

### 06 — WhatsApp Attendance (Mocked WAHA)

- Mock outgoing LLM calls → return deterministic intent JSON
- Mock WAHA `/api/sendText` → capture response messages
- Send webhook payloads to `POST /api/whatsapp/webhook`:
  - `"Ava kommt, Marlo nicht"` → Ava=attending, Marlo=absent
  - `"Ava kann nächste Woche nicht. Marlo kann diese Woche nicht."` → date-aware absences
- Verify attendance records via `GET /api/attendance`
- Verify response messages contain correct confirmations

### 07 — Feeds & Footer Links

- `GET /api/feeds/rss` → validate RSS 2.0 XML structure, events present
- `GET /api/feeds/atom` → validate Atom 1.0 XML structure
- `GET /api/sitemap.xml` → validate sitemap schema, check event/trophy URLs
- `GET /llms.txt` → verify club info + stats
- `GET /robots.txt` → verify feed paths allowed
- `GET /.well-known/security.txt` → validate RFC 9116 fields
- Visit `/imprint` → verify page renders with club data
- Visit `/privacy` → verify page renders
- Test feed content with 0 events (empty) and with populated data

### 08 — MCP Experiments

- `POST /mcp` with `initialize` → get session ID
- Call `get_club_info` tool → verify club name/description returned
- Call `list_upcoming_events` → verify seeded events returned
- Verify session management via `mcp-session-id` header
- Test invalid session handling

### 09 — Admin Navigation (Login/Logout, All Tabs)

- Login as admin via `/login`
- Navigate every dashboard tab:
  - `/dashboard` (events overview)
  - `/dashboard/players`
  - `/dashboard/broadcasts`
  - `/dashboard/checklists`
  - `/dashboard/payments`
  - `/dashboard/stats`
  - `/settings`
- Verify each page renders without console errors
- Logout → verify redirect to login
- Attempt protected page → verify redirect

### 10 — Survey Flow

- Create custom survey as admin
- Add questions: text input, multiple choice
- Verify survey appears in `/surveys`
- Open public respond URL (unauthenticated) → fill and submit
- Verify response in admin results view
- Close survey → verify no more responses accepted
- Archive survey → verify status change

### 11 — Unauthenticated Pages

- Visit `/` → verify public stats bar, recent trophies widget
- Visit `/calendar` → verify events listed, no admin actions visible
- Visit `/trophies` → verify trophy cabinet renders publicly
- Visit `/rsvp` → verify attendance/absence form loads
- Visit `/tournaments/[id]` → verify privacy-preserving initials (no full names)
- Visit `/events/[id]` → verify reduced event page (no edit/delete)
- Verify no admin links/buttons anywhere
- Verify API rejects unauthorized write operations

## Key Design Decisions

1. **Sequential numbered specs** — Tests build on each other (onboarding → users → events → ...). Playwright runs specs in filename order by default.

2. **Shared state via `storageState`** — Auth token from onboarding saved to file, reused by subsequent specs needing admin access.

3. **LLM mocking** — WhatsApp intent parsing calls an external LLM. We intercept the outbound HTTP request at the server level and return canned JSON so tests are deterministic and need no API key.

4. **Route interception for turnieragenda** — `page.route()` intercepts browser fetches; for server-side fetches we mock at the HTTP client level.

5. **API-level tests for feeds/MCP** — Use Playwright's `request` context (no browser) for direct HTTP assertions on XML/JSON endpoints.

6. **`webServer` auto-start** — `playwright.config.ts` starts both `npm run dev` (web, port 3000) and `npm run dev` (server, port 3001) before tests, kills them after.

7. **Fixtures for external sites** — HTML snapshots of turnieragenda.ch pages saved in `e2e/fixtures/`. Deterministic, fast, offline-capable.

## Run Command

```bash
cd e2e && npx playwright test           # all tests, headless
cd e2e && npx playwright test --headed  # watch in browser
cd e2e && npx playwright test 07        # single spec by number
```
