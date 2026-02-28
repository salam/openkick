# OpenKick Features

## Server (API)

- [x] sql.js database with full schema (11 tables)
- [x] JWT auth for coaches/admins + passwordless token links for parents
- [x] Player & guardian CRUD with SFV category auto-calculation
- [x] Events CRUD with category filtering
- [x] Event series with weekly recurrence, vacation skipping, and lazy materialization
- [x] Event series CRUD API (create, list, detail with expansion, update, delete with cascade)
- [x] Auto-materialize series instances on RSVP
- [x] Per-instance editing, cancellation, and exclusion for series
- [x] Attendance tracking with automatic waitlist promotion
- [x] Settings management (key-value store)
- [x] Multi-provider LLM abstraction (OpenAI, Claude, Infomaniak Euria)
- [x] Whisper speech-to-text for voice messages
- [x] WhatsApp integration via WAHA (webhook + message sending)
- [x] Weather forecasts via OpenMeteo (free, no key)
- [x] Half-automated broadcast system (training headsup, rain alert, cancellation, holiday)
- [x] Automatic attendance reminders
- [x] School holiday system (10 preset regions with grouped picker, ICS import, URL extraction via LLM, suggest-a-source)
- [x] Calendar with training schedule, vacation integration, auto-cancellation
- [x] Tournament import from PDF and URL via LLM
- [x] Team auto-assignment for tournaments
- [x] i18n for de/fr/en
- [x] Rate limiting (general, auth, mutation tiers via express-rate-limit)
- [x] Altcha proof-of-work captcha on login and attendance (pluggable provider)
- [x] RSS 2.0 feed for public events
- [x] Atom 1.0 feed for public events
- [x] ActivityPub read-only publisher (Mastodon/Fediverse)
- [x] AT Protocol feed generator (Bluesky)
- [x] ICS calendar subscriptions (combined + per-type)
- [x] Dynamic sitemap with feed URLs
- [x] robots.txt with sitemap reference
- [x] Club profile settings (name, description, contact info, logo upload)
- [x] Dynamic llms.txt endpoint (club info, public API docs, live statistics from DB)
- [x] MCP server at /mcp (read-only tools: club info, events, attendance stats, player categories)
- [x] WebFinger + DID well-known discovery endpoints
- [x] Security audit service (8 self-checks: DB permissions, HTTP exposure, .env, CORS, admin passwords, security.txt, HTTPS, .gitignore)
- [x] Admin-only GET /api/security-audit endpoint
- [x] User management API (list, role changes, password reset, invite) with role-based permissions
- [x] WAHA Docker setup wizard API (install Docker, pull/start/stop WAHA, QR proxy, session status)

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
- [x] Event series creation mode (weekly recurrence, date range, deadline offset)
- [x] Empty state buttons on dashboard and events pages (Create Event / Create Series)
- [x] Series badge on event cards and calendar sidebar section
- [x] Event detail page series awareness (banner, cancel instance, RSVP auto-materialize)
- [x] i18n with browser language detection (de/fr/en)
- [x] Homepage subscribe card widget (calendar, RSS, social feeds)
- [x] Admin feed toggle switches on settings page
- [x] Security audit widget on settings page (run/re-run, status badges, expandable results)
- [x] User management widget on settings page (list, role changes, password reset, invites)
- [x] WAHA Docker setup wizard in onboarding (4-step: Docker check, configure, install, QR connect)

## Infrastructure

- [x] Docker compose for WAHA
- [x] 416 server tests (Vitest)
