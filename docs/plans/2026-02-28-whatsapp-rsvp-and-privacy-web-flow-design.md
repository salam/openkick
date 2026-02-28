# WhatsApp RSVP & Privacy Web Flow — Design

**Date:** 2026-02-28
**PRD Reference:** Section 4.5.1 — Attendance via WhatsApp

## Goals

1. Parents confirm/decline attendance via WhatsApp chat message (hardened flow)
2. Unknown numbers get onboarded via a 4-step WhatsApp conversation
3. Name-entry-first web flow for anonymous RSVP links (privacy mode)
4. Personalized deep links sent by the WhatsApp bot for one-tap RSVP

## Architecture Decisions

- **Stateful conversation engine** — a `whatsapp_sessions` table tracks per-phone state. LLM is used only for free-form intent classification when in `idle` state. Structured flows (onboarding, disambiguation) use a deterministic state machine.
- **Dedicated `/rsvp` page** — separate from the authenticated event detail page. Supports both personalized (token) and anonymous (name search) modes.

---

## 1. Database Changes

### New table: `whatsapp_sessions`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| phone | TEXT UNIQUE | Sender's phone number |
| state | TEXT | `idle`, `onboarding_name`, `onboarding_child`, `onboarding_birthyear`, `onboarding_consent`, `disambiguating_child` |
| context | JSON | Mutable bag: `{ guardianName, childName, birthYear, pendingEventId, pendingPlayerIds }` |
| wahaMessageId | TEXT | Last processed message ID for deduplication |
| updatedAt | TEXT | ISO timestamp |

### New table: `message_log`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| wahaMessageId | TEXT UNIQUE | WAHA message ID (dedup key) |
| phone | TEXT | Sender or recipient |
| direction | TEXT | `in` or `out` |
| body | TEXT | Message text |
| intent | TEXT | Classified intent (nullable) |
| createdAt | TEXT | ISO timestamp |

### New table: `rsvp_tokens`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| token | TEXT UNIQUE | Opaque random token |
| playerId | INTEGER FK | References players(id) |
| eventId | INTEGER FK | References events(id) |
| createdAt | TEXT | ISO timestamp |
| expiresAt | TEXT | ISO timestamp (default: +1 hour) |
| used | INTEGER | 0 or 1 |

---

## 2. WhatsApp Webhook Redesign

### Message routing

```
incoming message
  → dedup check (wahaMessageId in message_log? → drop)
  → log message to message_log
  → load or create whatsapp_session for phone
  → if session.state != 'idle':
      → route to state handler (onboarding step or disambiguation)
  → if unknown sender (no guardian record):
      → start onboarding: set state → 'onboarding_name', send welcome
  → if known sender:
      → LLM intent classification (attending | absent | unknown)
      → if multi-child guardian and name not in message:
          → set state → 'disambiguating_child', send numbered menu
      → else: call setAttendance(), send confirmation
```

### Onboarding flow (4 steps)

| Step | State | Bot message | Expected input | On success |
|------|-------|-------------|----------------|------------|
| 1 | `onboarding_name` | "Willkommen! Wie heisst du?" | Free text (guardian name) | Store in context, → `onboarding_child` |
| 2 | `onboarding_child` | "Wie heisst dein Kind?" | Free text (child name) | Fuzzy match against `players` table. If match → `onboarding_birthyear`. If no match → "Kein Kind mit diesem Namen gefunden. Bitte kontaktiere den Trainer." → `idle` |
| 3 | `onboarding_birthyear` | "In welchem Jahr ist [child] geboren?" | 4-digit year | Verify against player's birth year. If match → `onboarding_consent`. If mismatch → retry (max 2 attempts) |
| 4 | `onboarding_consent` | "Dürfen wir deine Daten verarbeiten? (Ja/Nein)" | "Ja" or "Nein" | If yes: create guardian, link to player via `guardian_players`, set `consentGiven=1` → `idle`. If no: "Okay, keine Daten gespeichert." → `idle` |

### Multi-child disambiguation

When a known guardian has multiple linked players and the message doesn't specify which child:

1. Bot sends: "Für welches Kind?\n1) Luca\n2) Mia"
2. State → `disambiguating_child`, context stores `{ pendingPlayerIds: [5, 8], pendingStatus: 'attending', pendingEventId: 42 }`
3. Parent replies with number → resolve player → `setAttendance()` → confirmation → state → `idle`
4. Timeout: if no reply within 30 minutes, reset to `idle`

### Confirmation messages

Use `guardians.language` column + i18n keys:

- `whatsapp.confirm.attending`: "✅ [PlayerName] ist für [EventTitle] am [Date] angemeldet."
- `whatsapp.confirm.absent`: "❌ [PlayerName] ist für [EventTitle] am [Date] abgemeldet."
- `whatsapp.confirm.waitlist`: "⏳ [PlayerName] steht auf der Warteliste für [EventTitle]."

### Message deduplication

Before processing, check `message_log` for `wahaMessageId`. If found, drop silently. This prevents double-processing from WAHA webhook retries.

---

## 3. Name-Entry-First Web Flow (`/rsvp`)

### Route: `/rsvp`

A new public Next.js page that operates in two modes based on URL parameters.

### Mode A — Personalized deep link

**URL:** `/rsvp?token=<accessToken>&event=<eventId>`

1. Frontend calls `GET /api/rsvp/resolve?token=X&event=Y`
2. Backend resolves guardian from `guardians.accessToken`, finds linked players
3. Returns `{ players: [{ id, firstName }], event: { id, title, date } }`
4. Frontend shows: "Kommt [Luca] zum [Training] am [Freitag]?" with Attend / Absent buttons
5. Submit calls `POST /api/rsvp/confirm` with `{ accessToken, playerId, eventId, status }`
6. No CAPTCHA needed — the accessToken is the authentication

**Deep links from WhatsApp bot:** Reminders and confirmations include a personalized link. Example: "Hier kannst du auch online antworten: https://club.example.com/rsvp?token=abc123&event=42"

### Mode B — Generic public link

**URL:** `/rsvp?event=<eventId>`

1. Frontend shows: name search field + CAPTCHA (Altcha)
2. Parent types child's name, solves CAPTCHA
3. Frontend calls `POST /api/rsvp/search` with `{ name, eventId, captcha }`
4. Backend fuzzy-matches against players assigned to the event's team
5. Returns `{ rsvpToken, playerInitials }` — initials only (e.g., "L. M.") for privacy
6. Frontend shows: "Kommt L. M. zum Training?" with Attend / Absent buttons
7. Submit calls `POST /api/rsvp/confirm` with `{ rsvpToken, status }`

### Privacy enforcement

- Public search returns initials only — never full names or IDs
- `rsvp_tokens` are single-use, expire in 1 hour
- No player IDs, guardian details, or phone numbers in public API responses
- CAPTCHA required for anonymous mode

---

## 4. New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/rsvp/resolve` | `?token=<accessToken>&event=<id>` | Resolve personalized deep link → players + event info |
| `POST` | `/api/rsvp/search` | Public + CAPTCHA | Search player by name → opaque rsvp_token + initials |
| `POST` | `/api/rsvp/confirm` | `accessToken` or `rsvpToken` | Submit attendance status |

### `GET /api/rsvp/resolve`

Query params: `token`, `event`

Response:
```json
{
  "players": [{ "id": 5, "firstName": "Luca" }],
  "event": { "id": 42, "title": "Training", "date": "2026-03-07" }
}
```

### `POST /api/rsvp/search`

Body: `{ name: "Luca", eventId: 42, captcha: "..." }`

Response:
```json
{
  "rsvpToken": "opaque-random-token",
  "playerInitials": "L. M.",
  "eventTitle": "Training",
  "eventDate": "2026-03-07"
}
```

Errors: 404 if no match, 429 if rate limited, 400 if CAPTCHA invalid.

### `POST /api/rsvp/confirm`

Body (personalized): `{ accessToken: "...", playerId: 5, eventId: 42, status: "attending" }`
Body (anonymous): `{ rsvpToken: "...", status: "attending" }`

Response:
```json
{ "finalStatus": "attending" }
```

`finalStatus` may be `"waitlist"` if max participants reached.

---

## 5. i18n Keys (new)

```
whatsapp.welcome
whatsapp.onboarding.askName
whatsapp.onboarding.askChild
whatsapp.onboarding.askBirthYear
whatsapp.onboarding.askConsent
whatsapp.onboarding.noMatch
whatsapp.onboarding.birthYearMismatch
whatsapp.onboarding.consentDeclined
whatsapp.onboarding.complete
whatsapp.confirm.attending
whatsapp.confirm.absent
whatsapp.confirm.waitlist
whatsapp.disambiguate.askChild
whatsapp.help
rsvp.web.searchPlaceholder
rsvp.web.confirmAttend
rsvp.web.confirmAbsent
```

---

## 6. File Changes Summary

### New files
- `server/src/services/whatsapp-session.ts` — session state machine + handlers
- `server/src/services/whatsapp-onboarding.ts` — 4-step onboarding flow
- `server/src/routes/rsvp.ts` — public RSVP API endpoints
- `web/src/app/rsvp/page.tsx` — public RSVP page (name-entry-first)
- `web/src/app/rsvp/RsvpClient.tsx` — client component for RSVP flow

### Modified files
- `server/src/database.ts` — add 3 new tables
- `server/src/routes/whatsapp.ts` — refactor webhook to use session router
- `server/src/services/whatsapp.ts` — add `parseIntent()` (richer than current `parseAttendanceMessage`)
- `server/src/index.ts` — mount `/api/rsvp` route
- `server/src/i18n/` — add new keys for DE and EN
- `server/src/services/reminders.ts` — include deep link in reminder messages
