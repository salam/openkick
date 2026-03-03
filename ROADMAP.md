# OpenKick Roadmap

> Feature ideas and directions for future development. Items are grouped by theme, not prioritized.

---

## Communication & Messaging

- **Push notifications (PWA)** — web push via service worker for event reminders, score updates, and alerts; no app store needed
- **Email notifications** — opt-in email digests (weekly summary, upcoming events, new results)
- **Telegram bot** — alternative to WhatsApp for clubs that prefer Telegram
- **SMS fallback** — for parents without WhatsApp (e.g. via Twilio or MessageBird)
- **Group join link / QR code for parents** — display a scannable code on the dashboard so parents can self-register via WhatsApp (backend exists, QR display missing)
- **WhatsApp broadcast lists** — let coaches create named groups and send targeted messages
- **In-app chat** — lightweight messaging between coaches (no external dependency)

## Calendar & Scheduling

- **Drag-and-drop event rescheduling** — move events on the calendar grid
- **Conflict detection** — warn when scheduling overlaps with existing events or holidays
- **Venue/pitch management** — assign locations to events, track availability
- **Recurring exceptions editor** — bulk-edit series exceptions (e.g. skip the next 3 weeks)
- **Google/Apple Calendar deep integration** — two-way sync beyond ICS subscription
- **Multi-team calendar** — view and compare schedules across age groups

## Player & Team Management

- **Player progression tracking** — skill assessments, notes per player over time
- **Attendance streaks & milestones** — gamified badges for consistent attendance
- **Medical / allergy notes** — private fields visible only to coaches (encrypted at rest)
- **Jersey number management** — assign and track jersey numbers per season
- **Team photo gallery** — upload and share team photos per event/season
- **Parent portal** — dedicated view for parents to see their child's schedule, stats, and announcements
- **Player transfer / archive** — move players between age groups or mark as inactive

## Tournaments & Competitions

- **Brave Search API for results URL discovery** — auto-find results pages for tournaments
- **Bracket builder** — create and manage tournament brackets natively
- **Opponent database** — track recurring opponents with head-to-head records
- **Match report templates** — structured post-game reports with formation, substitutions, highlights
- **Referee assignment** — track referee contacts and assignments per match

## Finance & Administration

- **Membership fee tracking** — annual/semester dues with payment status per player
- **Expense tracking** — log team expenses (equipment, travel, pitch rental)
- **Budget planning** — per-season budget with income/expense categories
- **Invoice generation** — create and send invoices for fees, tournaments, merchandise
- **Sponsor management** — track sponsors, agreements, and logo placements

## Statistics & Analytics

- **Player-level stat cards** — individual profiles with attendance history, tournament participation, achievements
- **Season comparison** — compare metrics across semesters/years
- **Trend charts** — attendance trends, growth over time
- **Exportable annual report** — one-click PDF for board meetings with all key metrics
- **Goal / assist tracking** — per-match individual stats (for competitive teams)
- **Heatmaps** — attendance patterns by day-of-week, time-of-year

## Security & Compliance

- **Daily automated security audit** — cron-based production self-check with WhatsApp/email alerts
- **Dedicated data-protection audit** — DB exposure, directory listing, TLS, log rotation checks
- **CI pipeline for security** — GitHub Actions workflow running npm audit, SAST, dependency checks
- **GitHub private vulnerability reporting** — enable security advisory for the repo
- **Two-factor authentication (2FA)** — TOTP-based 2FA for admin accounts
- **Audit log** — track all admin actions (who changed what, when)
- **Session management** — view and revoke active sessions
- **Data retention automation** — auto-anonymize data after configurable retention period

## Integration & Ecosystem

- **SFV/FVRZ API integration** — pull player registrations, league schedules, and results directly
- **Swiss Football Connect** — sync with the official Swiss football platform
- **Club website builder** — generate a simple public website from club settings (beyond the current homepage)
- **n8n / Zapier webhooks** — outbound webhooks for events (new RSVP, score update, etc.)
- **Checklist reminder integration** — push checklist deadlines to n8n or email
- **iFrame embed widgets** — embeddable calendar, live ticker, and trophy cabinet for existing club websites
- **Multi-club federation** — shared platform for regional associations managing multiple clubs

## Mobile & UX

- **Progressive Web App (PWA)** — installable app experience with offline support
- **Offline mode** — cache critical data for use without connectivity (events, roster, checklists)
- **Dark mode** — system-preference-aware dark theme
- **Accessibility audit** — WCAG 2.1 AA compliance review and fixes
- **Onboarding tour** — interactive walkthrough for new coaches on first login
- **Keyboard shortcuts** — power-user navigation (e.g. `n` for new event, `/` for search)

## Content & Social

- **Photo uploads on events** — attach match-day photos to events
- **Newsletter builder** — compose and send HTML newsletters to parents
- **Social media auto-post** — publish results/trophies to Instagram, Facebook
- **Blog / news section** — simple CMS for club announcements
- **Match-day stories** — photo + score templates optimized for social sharing

## Infrastructure & DevOps

- **PostgreSQL / MySQL migration path** — option to upgrade from sql.js for larger clubs
- **Backup & restore** — one-click database backup and restore from admin panel
- **Multi-tenancy** — single deployment serving multiple clubs with isolated data
- **Prometheus / Grafana monitoring** — health metrics, request rates, error tracking
- **Staging environment** — automated preview deployments for testing
- **API versioning** — stable v1 API with deprecation policy

---

*This roadmap is a living document. Items may be added, reprioritized, or removed based on user feedback and community contributions.*
