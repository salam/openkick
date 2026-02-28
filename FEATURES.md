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
- [x] WhatsApp integration via WAHA (webhook + message sending + session-based state machine)
- [x] WhatsApp RSVP: parents confirm/decline attendance via chat message (intent classification, multi-child disambiguation)
- [x] WhatsApp onboarding for unknown phone numbers (4-step: name, child, birth year, consent)
- [x] WhatsApp message deduplication and logging
- [x] Weather forecasts via OpenMeteo (free, no key)
- [x] Half-automated broadcast system (training headsup, rain alert, cancellation, holiday)
- [x] Automatic attendance reminders with personalized RSVP deep links
- [x] School holiday system (10 preset regions with grouped picker, ICS import, URL extraction via LLM, suggest-a-source)
- [x] Calendar with training schedule, vacation integration, auto-cancellation
- [x] Tournament import from PDF and URL via LLM
- [x] Team auto-assignment for tournaments
- [x] i18n for de/fr/en
- [x] Rate limiting (general tier via express-rate-limit; auth + mutation limiters defined but not yet wired)
- [x] Altcha proof-of-work captcha on login, attendance, and public RSVP (pluggable provider)
- [x] Public RSVP API (resolve deep link, name search with CAPTCHA, confirm with opaque tokens)
- [x] RSS 2.0 feed for public events
- [x] Atom 1.0 feed for public events
- [x] ActivityPub read-only publisher (Mastodon/Fediverse)
- [x] AT Protocol feed generator (Bluesky)
- [x] ICS calendar subscriptions (combined + per-type)
- [x] Dynamic sitemap with feed URLs
- [x] robots.txt with sitemap reference (dynamic route, not static file)
- [x] Club profile settings (name, description, contact info, logo upload)
- [x] Dynamic llms.txt endpoint (club info, public API docs, live statistics from DB)
- [x] MCP server at /mcp (read-only tools: club info, events, attendance stats, player categories)
- [x] WebFinger + DID well-known discovery endpoints
- [x] Security audit service (8 self-checks: DB permissions, HTTP exposure, .env, CORS, admin passwords, security.txt, HTTPS, .gitignore)
- [x] Admin-only GET /api/security-audit endpoint
- [x] User management API (list, role changes, password reset, invite) with role-based permissions
- [x] WAHA Docker setup wizard API (install Docker, pull/start/stop WAHA, QR proxy, session status)
- [x] Onboarding status API (derives step/checklist completion from existing data, public GET for AuthGuard)
- [x] Tournament results CRUD (placement, summary, achievements/trophies per event)
- [x] LLM-based results import from bracket/results URL with team name matching
- [x] Trophy cabinet API (public, paginated, chronological)
- [x] Team name field on events for tournament registration identity
- [x] Public tournament API with privacy-preserving initials (GET /api/public/tournaments/:id)
- [x] Player initials service with first-name collision disambiguation
- [x] Notification system (in-app + WhatsApp threshold alerts)
- [x] Tournament threshold alert service with deduplication
- [x] Upcoming tournaments filter (?upcoming=true)

## Frontend (Web)

- [x] Next.js static export for cyon.ch deployment
- [x] Login page with JWT auth
- [x] Coach dashboard with event cards and attendance overview
- [x] Event detail page with one-click RSVP for parents
- [x] Public RSVP page (/rsvp) with personalized deep links and anonymous name-search mode
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
- [x] Language toggle (globe icon dropdown) in Navbar with localStorage persistence
- [x] Homepage subscribe card widget (calendar, RSS, social feeds)
- [x] Admin feed toggle switches on settings page
- [x] Security audit widget on settings page (run/re-run, status badges, expandable results)
- [x] User management widget on settings page (list, role changes, password reset, invites)
- [x] WAHA Docker setup wizard in onboarding (4-step: Docker check, configure, install, QR connect)
- [x] Admin onboarding stepper (5-step wizard: Club Profile, SMTP, LLM, WAHA, Invite Team)
- [x] Reusable settings form components (ClubProfile, SMTP, LLM, WAHA extracted from settings page)
- [x] Dashboard onboarding checklist (holidays, training, players, parents, feeds — auto-hides when done)
- [x] Tournament results form on event detail page (view/edit mode, predefined + custom achievements, URL import)
- [x] Trophy cabinet page (/trophies — public, chronological, placement badges, achievement pills)
- [x] Recent trophies dashboard widget (latest 5 results with placement badges)
- [x] Public tournament view page (/tournaments/:id — no auth, initials only)
- [x] Upcoming tournaments widget on dashboard (next 3, status badges)
- [x] Notification bell on dashboard (threshold alerts with dismiss)
- [x] Team name field on event creation form (tournament type)
- [x] Open call toggle on event creation (no participant limit mode)
- [x] Last name initial field on player add/edit (for disambiguation)

## Infrastructure

- [x] Docker compose for WAHA
- [x] ~476 server tests (Vitest)

---

## Completed — Attendance via WhatsApp (PRD 4.5.1)

- [x] WhatsApp RSVP: parents confirm/decline attendance via chat message
- [x] Name-entry-first web flow (privacy mode for anonymous RSVP links)

## Completed — Tournament Management (PRD 4.5.2)

- [x] Open call mode (no participant limit)
- [x] Registration threshold alerts (notify coach when spots filling up)
- [x] Public tournament view with privacy-preserving initials
- [x] First-name initial disambiguation with last-name initial
- [x] Tournament team name management
- [x] Upcoming tournaments widget on homepage

## Completed — WhatsApp Confirmations (PRD 4.5.3)

- [x] WhatsApp confirmation message after RSVP (attendance)

## Remaining — Parent Onboarding (PRD 4.5.4)

- [ ] Group join link / QR code for parents (backend join-by-link exists, QR display missing)
- [x] WhatsApp-based parent onboarding (name → child → birth year → consent)
- [x] Consent collection during onboarding

## Completed — Data Privacy & GDPR (PRD 4.5.5)

- [x] Data export for guardians (GDPR right of access)
- [x] Data deletion for guardians (GDPR right to erasure)
- [x] Explicit consent tracking per guardian

## Remaining — Data Protection Audit (PRD 4.5.6)

- [x] Security audit shell script (tools/security-audit.sh — HTTP exposure, .env, CORS, helmet, npm audit)
- [ ] Daily automated production audit scheduling (cron wrapper)
- [ ] Audit alerting via WhatsApp/email
- [ ] Dedicated data-protection audit script at tools/data-protection-audit.sh (DB exposure, directory listing, TLS, log checks)

## Remaining — Security Audit Extensions (PRD 4.5.7)

- [x] Dependency vulnerability scanning (npm audit in tools/security-audit.sh)
- [ ] CI pipeline integration for security checks (.github/workflows/ not yet created)

## Remaining — Security Disclosure (PRD 4.5.8)

- [ ] GitHub private vulnerability reporting configuration

## Remaining — Statistics & Reporting (PRD 4.5.9, blueprint: STATISTICS.md)

- [ ] Semester-based period grouping (Spring: Feb–Jul, Autumn: Aug–Jan)
- [ ] Training hours and person-hours statistics
- [ ] Coach hours tracking
- [ ] No-show detection and statistics
- [ ] Attendance rate metrics per player/event
- [ ] Tournament participation stats
- [ ] Dashboard widgets (charts and cards)
- [ ] Public homepage club statistics (cached)
- [ ] CSV/PDF export for club board reporting

## Remaining — Administrative Checklists (PRD 4.5.10, blueprint: CHECKLISTS.md)

- [ ] Admin checklists (semester-based, auto-reset Feb 1 / Aug 1)
- [ ] Per-training checklists (auto-created per training event)
- [ ] Per-tournament checklists (auto-created per tournament)
- [ ] Checklist templates with classification filtering (Sportamt, SFV, FVRZ)
- [ ] Custom checklist items preserved across resets
- [ ] Per-item completion tracking with user/timestamp

## Remaining — Surveys & Questionnaires (PRD 4.5.11, blueprint: SURVEYS.md)

- [ ] Survey builder (5 types: single choice, multi choice, rating, text, size picker)
- [ ] Anonymous vs. identified survey modes
- [ ] Survey templates: Trikot order, end-of-semester feedback
- [ ] Shareable survey links with QR code generation
- [ ] Survey deadlines and reminders
- [ ] Results dashboard with aggregation
- [ ] Close and archive surveys

## Remaining — Payments (PRD 4.5.12, blueprint: PAYMENTS.md)

- [ ] Stripe PSP integration (tournament fees, merchandise, donations)
- [ ] Datatrans PSP integration (alternative provider)
- [ ] Twint support (CHF only, via PSP)
- [ ] Webhook-driven payment confirmation
- [ ] Payment settings admin panel
- [ ] Receipt generation
- [ ] Refund functionality

## Completed — Live Ticker & Game History (blueprint: LIVE_TICKER.md)

- [x] Match-day live score polling (cheerio scraper)
- [x] LLM-based score extraction from web pages (generic fallback)
- [x] Turnieragenda.ch dedicated parser (no LLM needed)
- [x] Manual score entry for tournaments without online presence
- [x] Crawl scheduler (node-cron, per-URL interval)
- [x] Live ticker REST API (public + coach endpoints)
- [x] Privacy-preserving player initials in match results
- [x] Permanent game history storage
- [x] Trophy cabinet (set/unset trophies, archive tournaments)
- [x] Homepage live ticker widget (compact bar + detail page)
- [x] Public live detail page (/live/:id, shareable, no login)
- [ ] Brave Search API for results URL discovery

## Remaining — Admin Security & PII Gating (blueprint: ADMIN_SECURITY.md)

- [ ] Strong password enforcement (12+ chars, zxcvbn score 3+)
- [ ] HIBP breach checking on admin login (k-anonymity)
- [ ] PII masking middleware (phone, name, email)
- [ ] Zero-trust: only strong-password admins see unmasked PII
