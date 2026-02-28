# OpenKick - Design Document

## Overview

OpenKick is a self-hosted attendance and tournament management system for a Swiss youth football club. Parents communicate via WhatsApp; coaches manage everything through a web dashboard. The system uses WAHA for WhatsApp integration, Express for the API, Next.js for the frontend, and sql.js (SQLite) for the database — all deployable on cyon.ch shared hosting.

## Architecture

```
openkick/
  server/                    # Express API backend
    src/
      index.ts               # Express entry point
      database.ts            # sql.js setup, migrations, persistence
      auth.ts                # JWT auth for coaches/admins, token-link auth for parents
      routes/
        events.ts            # CRUD for trainings, tournaments, matches
        players.ts           # Player & guardian management
        attendance.ts        # Attendance status updates
        teams.ts             # Team assignment for tournaments
        calendar.ts          # Vacation weeks, training days, holidays
        settings.ts          # LLM config, bot language, holiday sources
        whatsapp.ts          # WAHA webhook receiver
        broadcasts.ts        # Pre-made broadcast messages
      services/
        attendance.ts        # Attendance logic, waitlist promotion
        whatsapp.ts          # Message parsing, confirmation sending
        llm.ts               # Multi-provider LLM abstraction (OpenAI, Claude, Euria)
        whisper.ts           # Speech-to-text for voice messages
        tournament-import.ts # PDF/URL crawl + LLM extraction
        weather.ts           # Weather API for training pre-headsups
        holidays.ts          # School holiday sync (Stadt Zurich, custom ICS/URL)
        reminders.ts         # Scheduled reminder broadcasts
        team-assignment.ts   # Auto-assign players to teams
      utils/
        i18n.ts              # Translations (de, fr, en)
    data/
      openkick.db            # SQLite database file (persisted to disk via sql.js)
    uploads/                 # Tournament flyers, attachments
  web/                       # Next.js frontend (static export for cyon.ch)
    src/
      app/
        page.tsx             # Landing / parent event view
        login/page.tsx       # Coach/admin login
        dashboard/           # Coach dashboard (events, attendance, players)
        events/[id]/page.tsx # Event detail + RSVP for parents
        calendar/page.tsx    # Calendar view (yearly/monthly/list)
        settings/page.tsx    # Admin settings (LLM, language, holidays)
      components/
        EventCard.tsx
        AttendanceTable.tsx
        CalendarView.tsx
        PlayerList.tsx
        BroadcastComposer.tsx
      lib/
        api.ts               # API client
        i18n.ts              # Browser language detection + translations
  docker-compose.yml         # WAHA + app stack
```

## Data Model

### players
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Child's name or nickname |
| yearOfBirth | INTEGER | e.g. 2015 |
| category | TEXT | SFV category: A, B, C, D-9, D-7, E, F, G |
| position | TEXT | Optional: goalkeeper, defender, etc. |
| notes | TEXT | Optional coach notes |
| createdAt | TEXT | ISO timestamp |

### guardians
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| phone | TEXT UNIQUE | WhatsApp number (E.164 format) |
| name | TEXT | Optional parent name |
| role | TEXT | parent, coach, admin |
| language | TEXT | de, fr, en — preferred language |
| consentGiven | INTEGER | 0/1 |
| accessToken | TEXT | For passwordless web access |
| createdAt | TEXT | |

### guardian_players
| Column | Type | Notes |
|--------|------|-------|
| guardianId | INTEGER FK | |
| playerId | INTEGER FK | |

### events
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| type | TEXT | training, tournament, match, friendly |
| title | TEXT | |
| description | TEXT | |
| date | TEXT | ISO date |
| startTime | TEXT | HH:MM |
| attendanceTime | TEXT | HH:MM (when to arrive) |
| deadline | TEXT | ISO datetime for RSVP |
| maxParticipants | INTEGER | NULL = unlimited |
| minParticipants | INTEGER | NULL = no minimum |
| location | TEXT | |
| categoryRequirement | TEXT | e.g. "E,F" — which SFV categories are eligible |
| attachmentPath | TEXT | Path to uploaded PDF/flyer |
| sourceUrl | TEXT | Original tournament URL if imported |
| recurring | INTEGER | 0/1 |
| recurrenceRule | TEXT | e.g. "weekly:tue,thu" |
| createdBy | INTEGER FK | guardian.id (coach/admin) |
| createdAt | TEXT | |

### attendance
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| eventId | INTEGER FK | |
| playerId | INTEGER FK | |
| status | TEXT | attending, absent, waitlist, unknown |
| reason | TEXT | Optional (e.g. "sick") |
| respondedAt | TEXT | |
| source | TEXT | web, whatsapp, whisper, coach |

### teams
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| eventId | INTEGER FK | |
| name | TEXT | e.g. "Team A" |

### team_players
| Column | Type | Notes |
|--------|------|-------|
| teamId | INTEGER FK | |
| playerId | INTEGER FK | |

### vacation_periods
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | e.g. "Sportferien" |
| startDate | TEXT | ISO date |
| endDate | TEXT | ISO date |
| source | TEXT | zurich-official, custom-ics, manual |
| createdAt | TEXT | |

### training_schedule
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| dayOfWeek | INTEGER | 0=Sun, 1=Mon, ... 6=Sat |
| startTime | TEXT | HH:MM |
| endTime | TEXT | HH:MM |
| location | TEXT | |
| categoryFilter | TEXT | Which categories this applies to |
| validFrom | TEXT | ISO date |
| validTo | TEXT | ISO date |

### settings
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | |
| value | TEXT | JSON-encoded |

Settings include: `llm_provider` (openai/claude/euria), `llm_model`, `llm_api_key`, `bot_language` (de/fr/en), `weather_api_key`, `waha_url`, `holiday_sources` (JSON array of URLs/ICS).

### broadcasts
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| type | TEXT | training_headsup, rain_alert, cancellation, holiday, custom |
| templateKey | TEXT | References a built-in template |
| message | TEXT | Final composed message |
| status | TEXT | draft, sent |
| scheduledFor | TEXT | ISO datetime |
| sentAt | TEXT | |
| createdBy | INTEGER FK | |

## Swiss Football Junior Categories (SFV)

The system stores and enforces the SFV junior classification. Categories are recalculated each season (July 1 boundary). For the 2025/2026 season:

| Category | Birth Years | Team Size | Format |
|----------|------------|-----------|--------|
| A-Junioren (U18) | 2008, 2009 | 11 | 11v11 |
| B-Junioren (U16) | 2010, 2011 | 11 | 11v11 |
| C-Junioren (U14) | 2012, 2013 | 11 | 11v11 |
| D-Junioren D9 (U12) | 2014 | 9 | 9v9 |
| D-Junioren D7 (U11) | 2015 | 7 | 7v7 |
| E-Junioren (U10) | 2016, 2017 | 7 | 5v5/6v6 |
| F-Junioren (U8) | 2018, 2019 | - | 3v3/5v5 |
| G-Junioren (U6) | 2020+ | - | 3v3 |

The system recalculates categories automatically based on the current season. Coaches can override a player's category manually. Tournaments can specify which categories are eligible.

## LLM Integration

Multi-provider abstraction layer with a unified interface. Admin configures via settings page.

### Providers

1. **OpenAI** — `https://api.openai.com/v1/chat/completions`, Bearer token auth
2. **Anthropic (Claude)** — `https://api.anthropic.com/v1/messages`, x-api-key header
3. **Infomaniak Euria** — `https://api.infomaniak.com/2/ai/{product_id}/openai/v1/chat/completions`, Bearer token auth, OpenAI-compatible

### Use Cases
- **Tournament import**: Parse PDF/URL content, extract event details (date, location, categories, deadlines)
- **WhatsApp message parsing**: Understand free-form messages ("Luca krank", "kommen morgen nicht")
- **Broadcast composition**: Generate weather-aware training headsups
- **Holiday calendar extraction**: Convert webpage/ICS content into structured holiday dates

### Whisper Integration
- Voice messages received via WAHA are transcribed using OpenAI Whisper API
- Transcribed text is then parsed like any other WhatsApp message to update attendance

## Broadcast System

### Pre-made Templates

1. **Training Headsup** (weekly, day before training)
   - Auto-fetches weather forecast for training time
   - Includes: location, time, weather, equipment suggestions
   - Coach reviews and sends with one click

2. **Rain/Cancellation Alert**
   - Triggered manually or when weather API detects rain >80%
   - Pre-filled message, coach confirms before sending

3. **Holiday Announcement**
   - Synced from official Zurich school calendar (weeks 7-8 Sportferien, 17-18 Fruhlingsferien, 29-33 Sommerferien, 41-42 Herbstferien)
   - Announces upcoming break and next training date
   - Coach reviews and sends

4. **Custom Broadcast**
   - Free-text message to all parents or filtered by category

All broadcasts are "half-automated": the system composes the message (using LLM + data), the coach reviews/edits, then confirms sending.

## School Holiday System

### Built-in: Stadt Zurich
- Hardcoded schedule based on DIN week numbers (Sportferien W7-8, Fruhlingsferien W17-18, Sommerferien W29-33, Herbstferien W41-42)
- Updated annually; auto-generates training cancellation events during vacation weeks

### Custom Sources
- Upload ICS file — parsed and converted to vacation periods
- Paste URL of a webpage — LLM extracts dates and creates vacation periods
- Manual entry via calendar UI

### Calendar View
- Yearly overview showing training days, vacation periods, events
- Monthly detail view with event cards
- List view for quick scanning
- Vacation weeks highlighted; training auto-skipped during vacations

## Internationalization (i18n)

### Languages: de (default), fr, en

- **Web frontend**: Browser language detection via `navigator.language`, user can override
- **WhatsApp bot**: Language set per-club in admin settings (single language for all bot messages)
- **Admin setting**: Bot communication language configurable in settings page
- All UI strings, bot messages, and broadcast templates are translated

## Auth Model

- **Coaches/Admins**: Email + password -> JWT
- **Parents**: Passwordless via unique token link (sent via WhatsApp). Clicking the link authenticates them for 30 days. No password needed.
- **WhatsApp identity**: Phone number maps to guardian record

## Deployment

### cyon.ch (shared hosting)
- Server: Express compiled to JS, served as `.server/index.mjs`
- Database: sql.js (pure JS SQLite, no native bindings)
- Frontend: Next.js static export served as static files
- Uploads: stored in server filesystem

### WAHA (separate)
- Self-hosted Docker container on a VPS (e.g., Infomaniak cloud, Hetzner)
- Connects to club's WhatsApp number
- Sends webhooks to the cyon.ch-hosted API
- API calls WAHA's REST API to send messages

## Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| Backend | Node.js, Express, TypeScript |
| Frontend | Next.js (React), TypeScript, Tailwind CSS |
| Database | sql.js (SQLite, pure JS) |
| WhatsApp | WAHA (self-hosted) |
| LLM | OpenAI / Claude / Infomaniak Euria (configurable) |
| Speech-to-text | OpenAI Whisper API |
| Weather | OpenMeteo API (free, no key needed) |
| Testing | Vitest |
| Deployment | cyon.ch (server + static), Docker (WAHA) |
