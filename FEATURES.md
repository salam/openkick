# OpenKick Features

## Server (API)

- [x] sql.js database with full schema (11 tables)
- [x] JWT auth for coaches/admins + passwordless token links for parents
- [x] Player & guardian CRUD with SFV category auto-calculation
- [x] Events CRUD with category filtering
- [x] Attendance tracking with automatic waitlist promotion
- [x] Settings management (key-value store)
- [x] Multi-provider LLM abstraction (OpenAI, Claude, Infomaniak Euria)
- [x] Whisper speech-to-text for voice messages
- [x] WhatsApp integration via WAHA (webhook + message sending)
- [x] Weather forecasts via OpenMeteo (free, no key)
- [x] Half-automated broadcast system (training headsup, rain alert, cancellation, holiday)
- [x] Automatic attendance reminders
- [x] School holiday system (Zurich built-in, ICS import, URL extraction via LLM)
- [x] Calendar with training schedule, vacation integration, auto-cancellation
- [x] Tournament import from PDF and URL via LLM
- [x] Team auto-assignment for tournaments
- [x] i18n for de/fr/en

## Frontend (Web)

- [x] Next.js static export for cyon.ch deployment
- [x] Login page with JWT auth
- [x] Coach dashboard with event cards and attendance overview
- [x] Event detail page with one-click RSVP for parents
- [x] Player management with SFV category badges
- [x] Calendar page (yearly/monthly/list views)
- [x] Broadcast composer with template selection
- [x] Admin settings page (LLM, bot language, holidays, WAHA)
- [x] Event creation with tournament import (URL/PDF)
- [x] i18n with browser language detection (de/fr/en)

## Infrastructure

- [x] Docker compose for WAHA
- [x] 191 server tests (Vitest)
