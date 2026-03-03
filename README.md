<p align="center">
  <img src="./design/logo.svg" alt="OpenKick" width="200" />
</p>

<h1 align="center">OpenKick</h1>

<p align="center">
  <strong>Self-hosted attendance and tournament management for youth football clubs</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#contributing">Contributing</a> &middot;
  <a href="#license">License</a>
</p>

---

OpenKick replaces scattered WhatsApp threads with a lightweight, privacy-first system that coaches and parents actually want to use. Parents keep sending casual WhatsApp messages — OpenKick understands them, updates attendance, and keeps everyone in the loop.

## Why OpenKick?

Existing tools (Spond, Teamy, TeamSnap) require app installs, accounts, and collect far more data than a youth club needs. OpenKick takes a different approach:

- **No app to install.** Parents text on WhatsApp like they already do.
- **Minimal data.** Only a child's name and a phone number. Nothing more.
- **Self-hosted.** Your data stays on your server. Full control, no vendor lock-in.
- **Open source.** Inspect, modify, and extend it to fit your club.

## Features

### Attendance tracking

- Understands free-form WhatsApp messages ("Luca is sick", "late today", "not coming")
- One-click RSVP via personalized deep links or a mobile-friendly web page
- Anonymous name-search RSVP mode for shared links
- Automatic reminders with personalized RSVP links for parents who haven't responded
- Attendance history, statistics, and no-show tracking

### Tournament management

- Create tournaments with deadlines, participant limits, and team names
- Import tournaments from PDF or URL via LLM
- Registration via WhatsApp or web — share a link in the group chat
- Automatic wait-list when slots fill up
- Threshold alerts when registrations are too few or too many
- Public tournament view with privacy-preserving initials (no login required)
- Tournament results with placement, achievements, and trophies
- LLM-based results import from bracket/results URLs
- Trophy cabinet page (public, chronological)

### Live ticker & game history

- Match-day live score polling (cheerio scraper + LLM fallback)
- Turnieragenda.ch dedicated parser
- Manual score entry for tournaments without online presence
- Crawl scheduler with per-URL intervals
- Public shareable live detail pages (no login)
- Permanent game history storage

### Event series

- Weekly recurrence with date range and deadline offset
- Vacation skipping via school holiday system
- Lazy materialization (instances created on demand)
- Per-instance editing, cancellation, and exclusion

### Statistics & reporting

- Semester-based training hours, person-hours, and coach hours
- Attendance rate metrics per player and event
- No-show detection and statistics
- Tournament participation tracking
- Interactive charts dashboard with semester picker
- CSV/PDF export for club board reporting
- Public homepage statistics bar (cached)

### Surveys & questionnaires

- Survey builder with 5 question types (single/multi choice, rating, text, size picker)
- Anonymous vs. identified survey modes
- Built-in templates (trikot order, end-of-semester feedback)
- Shareable survey links with QR code generation
- Deadlines with automatic enforcement
- Results dashboard with aggregation, charts, and CSV export

### Payments

- Stripe and Datatrans PSP integration (tournament fees, merchandise, donations)
- Twint support (CHF only, via PSP)
- Webhook-driven payment confirmation
- Receipt generation (PDF)
- Refund functionality (full and partial)
- Transaction log with filtering

### Administrative checklists

- Semester-based checklists with auto-reset (Feb 1 / Aug 1)
- Per-training and per-tournament checklists (auto-created)
- Templates with classification filtering (Sportamt, SFV, FVRZ)
- Custom checklist items preserved across resets

### Communication

- Confirmation messages after every sign-up or cancellation
- Scheduled reminders before deadlines and match days
- Half-automated broadcast system (training headsup, rain alert, cancellation, holiday)
- Customizable bot text templates with live preview (26 templates, 5 categories)
- Coach/admin WhatsApp commands (attendance overview, cancel event, reminders, match sheet)

### Onboarding

- Parents join by scanning a QR code or clicking a link
- WhatsApp-based onboarding: the bot asks for name, child, birth year, consent — done
- Admin onboarding stepper (5 steps: club profile, SMTP, LLM, WAHA, invite team)
- Dashboard onboarding checklist (holidays, training, players, parents, feeds)

### Weather

- Weather forecasts via OpenMeteo (free, no API key)
- Geocoded event locations (OpenStreetMap Nominatim with 30-day cache)
- Weather display on event cards, navbar pill, and event detail pages

### Calendar & scheduling

- Yearly, monthly, and list views
- Bidirectional infinite scroll in list mode
- Compact attendance chips and type filter pills
- School holiday system (10 preset regions, ICS import, URL extraction via LLM)
- ICS calendar subscriptions (combined + per-type)

### Feeds & discovery

- RSS 2.0 and Atom 1.0 feeds for public events
- ActivityPub read-only publisher (Mastodon/Fediverse)
- AT Protocol feed generator (Bluesky)
- Dedicated trophy feed endpoints
- Dynamic sitemap with feed URLs and events
- robots.txt with sitemap reference
- llms.txt endpoint (club info, public API docs, live statistics)
- MCP server at /mcp (read-only tools: club info, events, stats, trophies)
- WebFinger + DID well-known discovery endpoints

### Club branding & SEO

- Club profile settings (name, description, contact info, logo upload)
- Automatic favicon generation from club logo (ICO, PNG, apple-touch-icon, webmanifest)
- Server-side HTML injection of branding, OG/Twitter meta tags
- Homepage customization (background image, primary tint color)
- Primary color theming across 57 UI components
- SEO & Social Media settings (OG title/description/image, Twitter card, meta keywords)

### Security & privacy

- JWT auth for coaches/admins + passwordless token links for parents
- Strong password enforcement (12+ chars, zxcvbn score 3+) with HIBP breach checking
- PII masking middleware — zero-trust: only strong-password admins see unmasked data
- Altcha proof-of-work captcha on login, attendance, and public RSVP
- Dynamic security.txt endpoint (RFC 9116)
- Security audit service (8 self-checks) with admin endpoint and settings widget
- Rate limiting (general tier via express-rate-limit)
- GDPR compliance: data export, data deletion, explicit consent tracking
- Public /privacy and /imprint pages with dynamic legal information
- Forgot password / reset password flow with email token

### Internationalization

- Full i18n for German, French, and English
- Browser language detection with manual toggle

## Architecture

OpenKick is built from proven open-source components:

| Layer | Component | Role |
|---|---|---|
| WhatsApp API | [WAHA](https://waha.devlike.pro/) | Send and receive WhatsApp messages via REST |
| Chatbot | [BuilderBot](https://www.builderbot.app/) | Parse messages, manage conversation flows |
| Workflows | [n8n](https://n8n.io/) | Orchestrate reminders, deadlines, notifications |
| Web app | Next.js (static export) + Node.js | Dashboard for coaches, event pages for parents |
| Database | sql.js (SQLite) | Events, players, attendance records |
| Deployment | Docker Compose | Single command to run the full stack |

## Getting Started

> OpenKick is in early development. Instructions will be updated as the project matures.

### Prerequisites

- Docker and Docker Compose
- A WhatsApp number for the bot

### Quick start

```bash
git clone https://github.com/your-org/openkick.git
cd openkick
cp .env.example .env   # configure your WhatsApp number and settings
docker compose up
```

Open `http://localhost:3000` to access the coach dashboard. Scan the QR code to connect your WhatsApp number.

## Contributing

Contributions are welcome. Whether it's a bug report, feature idea, or pull request — every bit helps.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Open a pull request

Please keep PRs focused and atomic. See [CONTRIBUTING.md](CONTRIBUTING.md) for details (coming soon).

## Privacy

OpenKick is designed for minimal data collection:

- Only stores child name/nickname and parent phone number
- No email, no payment data, no tracking
- All data stays on your server
- Parents can request deletion at any time
- Built with Swiss/EU data protection regulations in mind

## Security

Security is a first-class concern. OpenKick follows a **zero-trust data exposure** model — personal data (phone numbers, emails) is write-only and never displayed in chats, the web UI, or API responses unless you are an admin with a verified strong password.

### For developers

Run the security audit during development:

```bash
./tools/security-audit.sh          # full audit
./tools/security-audit.sh --quick  # fast subset for CI
```

This checks for hardcoded secrets, dependency vulnerabilities, SQL injection patterns, insecure CORS, file permissions, and more.

### Reporting vulnerabilities

**Found a security issue? Please report it responsibly.**

- **Preferred:** Open a [private security advisory](https://github.com/your-org/openkick/security/advisories/new)
- **Email:** `security@openkick.example.com`
- **Do NOT** open a public GitHub issue for security vulnerabilities

We acknowledge reports within 48 hours and credit reporters in our release notes. See [SECURITY.md](SECURITY.md) for full details and our [security.txt](public/.well-known/security.txt) for machine-readable disclosure info.

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built for the love of the game.
</p>
