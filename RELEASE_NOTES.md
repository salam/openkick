# OpenKick Release Notes

## Version 1.29 (Wed, Mar 4 2026)

* **Docker-free WhatsApp**: WAHA (WhatsApp HTTP API) can now run as a plain Node.js process — no Docker required
* Works on shared hosting (e.g., Cyon) where Docker is not available
* Setup wizard auto-detects native WAHA and skips Docker steps
* Deploy script (`tools/deploy-cyon.sh`) now deploys WAHA alongside the server with one command
* Settings page shows "Native (no Docker)" status when WAHA runs without Docker

## Version 1.28 (Tue, Mar 3 2026)

* **Security fix**: API settings endpoint no longer exposes API keys, SMTP passwords, or other secrets to unauthenticated users
* **Security fix**: All settings write operations (update, upload logo/background, test LLM/SMTP) now require admin authentication
* **Security fix**: All data modification endpoints (create/update/delete players, events, attendance, broadcasts, etc.) now require admin or coach authentication
* **Security fix**: Live ticker crawl configuration endpoints now require authentication (prevents SSRF by unauthenticated users)
* **Security fix**: Broadcast sending (WhatsApp messages to all parents) now requires authentication
* Public read-only endpoints (calendar, trophy cabinet, public events, feeds) remain accessible without login

## Version 1.27 (Tue, Mar 3 2026)

* New setting: optionally require guardian phone number verification during anonymous RSVP attendance reporting
* Fixed: Calendar filter pills (All/Training/Tournament/Match) now work correctly in list view
* Fixed: Events in the monthly calendar grid are now clickable — tap an event to open its detail page
* Fixed: "Scroll to today" button now works even when there's no event scheduled today (shows a "today" marker)
* Fixed: Training events no longer appear duplicated (gray + colored) in the calendar
* Fixed: Sidebar legend no longer shows redundant entries for the same weekly training
* Fixed: Calendar no longer shows both a standalone event and a series instance for the same date
* Events tab is now fully functional within the Calendar (completing the events/calendar merge)
* Events can now be cancelled without deleting them — cancelled status is preserved
* Cancelled events show as `[CANCELLED]` in ICS calendar subscriptions (with proper `STATUS:CANCELLED`)
* RSS and Atom feeds mark cancelled events with a `[CANCELLED]` prefix

## Version 1.26 (Mon, Mar 2 2026)

* Homepage and weather descriptions now fully localized (German, English, French)
* Homepage stats bar labels ("Athletes", "Active", "Trophies", etc.) translated
* Weather conditions ("Clear sky", "Rain", etc.) translated across all display locations
* Fixed trophy count on homepage — now correctly counts tournament results
* Admins can now change a user's role (admin/coach) directly from the user table via dropdown
* Club address lookup in Settings — type an address and geocode to lat/lon via Nominatim
* "My location" button in Settings to use browser geolocation for club coordinates
* Weather forecast now shown on the homepage alongside the club description

## Version 1.25 (Mon, Mar 2 2026)

* Calendar list view now supports infinite scroll — scroll down for future months, scroll up for past months
* Each event in the list view shows compact attendance info (attending count and absent count)
* Type filter pills (All / Training / Tournament / Match) in list mode to quickly find events
* Events page merged into Calendar — one unified place for all your events and schedule
* Visiting /events now redirects to the Calendar list view

## Version 1.24 (Mon, Mar 2 2026)

* Weather forecast now shown on training and tournament cards (temperature, icon, precipitation %)
* Weather for each event is geocoded from the event's location using OpenStreetMap Nominatim
* Compact weather pill in the navbar header showing current conditions at the club location
* Event detail pages show full weather description with temperature and precipitation
* Geocoding results are cached for 30 days to respect API rate limits

## Version 1.23 (Mon, Mar 2 2026)

* Primary color setting now actually applies across the entire UI (buttons, links, badges, spinners, focus rings)
* All 57 themed components now respond to the user-configured tint color

## Version 1.22 (Mon, Mar 2 2026)

* Edit guardian details (name, phone, email) directly from the player edit modal
* Unlink a guardian from a player without deleting the guardian
* Delete a guardian entirely (with confirmation) — removes them from all linked players
* Coaches and admins are protected from accidental deletion

## Version 1.21 (Mon, Mar 2 2026)

* Coaches and admins can now have a real phone number stored (for WhatsApp bot features)
* Add phone number when inviting a new team member (optional field)
* Edit phone number inline in the team members list (both Settings page and InviteTeamForm)
* Phone numbers are automatically normalized (stripping spaces, + and 00 prefix)
* Duplicate phone numbers are rejected during invite and update

## Version 1.20 (Mon, Mar 2 2026)

* WhatsApp bot now only responds to known contacts (guardians, coaches, admins)
* Unknown numbers are silently ignored by default — toggle "Allow onboarding" in settings to let new parents self-register
* All bot replies now end with "(by OpenKick)" for transparency
* Coach/admin WhatsApp commands: ask "Wer kommt?", cancel trainings, send reminders, mark attendance — all from WhatsApp
* Customizable bot message templates in Settings — edit all 26 templates with live preview
* Templates organized in 5 categories: General, Confirmations, Onboarding, Reminders, Coach
* Per-template variable hints and "Reset to default" button

## Version 1.19 (Mon, Mar 2 2026)

* Coach/Admin WhatsApp commands — coaches and admins can now manage events via WhatsApp
* "Wer kommt?" shows attendance overview with attending/absent/pending player counts
* "Training absagen" cancels the next event and notifies all parents automatically
* "Erinnerung senden" sends reminders only to parents who haven't responded
* "[Name] anwesend/abwesend" marks a player's attendance directly from WhatsApp
* "Aufstellung?" shows lineup/match sheet for the next event
* "Dashboard" sends a link to the web admin portal
* Coach commands fall through to parent attendance flow when unrecognised
* Translation keys added for all coach messages (DE + EN)

## Version 1.18 (Mon, Mar 2 2026)

* Imprint fallback — shows a legally sound minimal imprint even when legal settings are not yet configured
* Legal reference header (DDG/ECG/OR) always displayed on imprint page
* Smart data cascade: club name, contact info, DPO email, and admin user data are used as fallback values
* Incomplete-notice box informs visitors that legal details are being finalised
* Admin Security & PII Gating — zero-trust data exposure model
* Strong password enforcement on admin login (12+ chars, mixed case, digit, special char, zxcvbn score 3+)
* HIBP breach checking via k-anonymity — passwords found in data breaches trigger PII restriction
* PII masking middleware — phone numbers, names, and emails are automatically masked in API responses
* Only admins with verified strong passwords see unmasked personal data
* Login response now includes password warnings to help admins choose stronger passwords
* Password checks on setup, login, and password reset endpoints
* Weak password warning banner on dashboard — shows specific issues and links to settings
* Team members widget now shows password status (set/not set) per user
* Self-service password check: verify your own password strength + HIBP status from the team widget
* Security audit now includes password policy and PII gating checks

## Version 1.17 (Sun, Mar 2 2026)

* Settings page reorganised into 5 navigable groups: General, Integrations, Security, Content, Team
* Sidebar navigation with scroll-spy highlights the active section as you scroll
* Mobile-friendly: sidebar collapses to a horizontal scrollable pill bar on small screens
* Sticky header keeps the page title visible while scrolling
* Floating save bar appears at the bottom when there are unsaved changes — always reachable

## Version 1.16 (Sat, Mar 1 2026)

* Statistics & Reporting: semester-based stats dashboard for coaches and admins
* Training hours and person-hours charts — see total training volume per player at a glance
* Coach hours tracking — overview of sessions and hours coached per semester
* No-show detection — identify players with unexplained absences, sorted by rate
* Attendance rate chart — color-coded breakdown per player (green/yellow/red)
* Tournament participation stats — how many tournaments each player attended
* CSV and PDF export — download any stat for board meetings or club reports
* Public homepage stats bar — show club-wide totals (players, events, trophies) to visitors
* Admin-configurable homepage stats visibility — toggle which stats appear publicly
* Semester picker — switch between Spring, Autumn, and School Year periods

## Version 1.15 (Sat, Mar 1 2026)

* Public event pages — share event links with anyone; visitors can view event details and RSVP without logging in
* Inline RSVP on public event page: captcha-protected player search and attendance confirmation
* Login prompt banner on public view to access full event details

## Version 1.14 (Sat, Mar 1 2026)

* Homepage customization: logged-in coaches see a settings button to customize the homepage
* Background image upload for homepage hero area (with semi-transparent overlay for readability)
* Primary tint color picker — changes the main brand color
* Footer smart button: shows "Dashboard" when logged in, "Coach Login" when not
* Homepage fetches club name, description, and logo from API settings (no more hardcoded defaults)
* Trophy widget redesigned: prominent placement badge with trophy icon on the left, event title as subtitle

## Version 1.13 (Sat, Mar 1 2026)

* Survey builder UI: create custom surveys with 5 question types (single choice, multi choice, star rating, free text, size picker)
* Survey list with status filtering (open/closed/archived) and template shortcuts
* Results dashboard with star rating averages, distribution charts, and text response lists
* Public survey response form with mobile-friendly question rendering
* One-click template creation for Trikot orders and semester feedback
* QR code display and shareable link with copy-to-clipboard
* Surveys accessible from top-level navigation

## Version 1.12 (Sat, Mar 1 2026)

* Checklists dashboard page with Admin/Training/Tournament tabs
* Collapsible checklist widget on training and tournament event detail pages
* Add custom checklist items, toggle completion, delete custom items
* Progress bar and completion timestamps on dashboard cards

## Version 1.11 (Sat, Mar 1 2026)

* Stripe PSP integration (card, Apple Pay, Google Pay, Twint)
* Datatrans PSP integration (cards, PostFinance, Twint)
* Twint support (CHF only, routed through PSP)
* Webhook-driven payment confirmation for both providers
* Admin payment settings panel (provider config, use case management)
* Transaction log with status filtering and pagination
* PDF receipt generation and download
* Full and partial refund support
* Privacy-first: no card data or PII stored

## Version 1.10 (Sat, Mar 1 2026)

* Homepage widgets: Recent Trophies and Upcoming Tournaments shown on the public homepage
* Login renamed to "Coach Login" / "Trainer-Login" / "Connexion Entraineur" across all languages
* Smart login/dashboard button: shows "Dashboard" if logged in, "Coach Login" otherwise
* Public Imprint page (/imprint) with structured legal information from settings
* Public Privacy Policy page (/privacy) with GDPR-compliant template (data collected, legal basis, retention, your rights)
* Legal & Privacy settings section: organisation name, address, responsible person, DPO, free-text extras
* Dynamic browser title and favicon from club settings on all pages
* Footer restyled: Security: security.txt | Imprint · Privacy · [Coach Login] button
* Widget labels (Recent Trophies, Upcoming Tournaments, View All) fully localised (DE/EN/FR)
* Footer reacts to language toggle

## Version 1.9 (Sat, Mar 1 2026)

* Surveys & Questionnaires: coaches can create surveys with 5 question types (single choice, multi choice, star rating, free text, size picker)
* Anonymous and identified survey modes — anonymous hides all identifiers, identified uses player nicknames only (no PII)
* Built-in templates: Trikot & Cap order (with size picker), end-of-semester feedback (anonymous star ratings)
* Shareable survey links with on-the-fly QR code generation
* Survey deadline enforcement and duplicate submission prevention
* Results dashboard with aggregation — star rating averages, size/choice distributions, free text lists
* Close and archive survey lifecycle
* Payment stub ready for future integration (price_per_item field)

## Version 1.8 (Sat, Mar 1 2026)

* Administrative checklists with semester-based auto-reset (Feb 1 / Aug 1)
* Per-training checklists auto-created when a training event is created
* Per-tournament checklists auto-created when a tournament event is created
* Classification-based filtering for relevant items (Sportamt Zurich, SFV, FVRZ)
* Custom checklist items preserved across semester resets
* Per-item completion tracking (who completed it and when)
* Classification management API for admins

## Version 1.7.1 (Mar 1, 2026, 00:35)

* Trophy data now appears in all feed outputs (RSS, Atom, ICS, ActivityPub) — placement, team count, and achievements are shown alongside tournament events
* New trophy-only calendar feed at /api/feeds/calendar/trophies.ics — subscribe to see only events where the team placed
* RSS and Atom feeds support ?trophies=only filter for trophy-only views
* Sitemap now includes the trophy cabinet page and individual events with results
* New MCP tool: get_trophy_cabinet — AI assistants can query the club's trophy history

## Version 1.7.0 (Mar 1, 2026, 00:15)

* Dynamic branding: your club name, description, and logo now appear on the homepage instead of "OpenKick"
* Favicon auto-generation: uploading a club logo automatically creates favicon, apple-touch-icon, and Android app icons
* SEO & Social Media settings: individually configure Open Graph, Twitter/X card, and meta keyword tags
* Dynamic security.txt: configure security contacts through the settings page (RFC 9116 compliant)
* Server-side rendering: all meta tags, OG tags, and branding are injected into the HTML before it reaches the browser — works for crawlers and social previews
* Footer now displays your club name in the copyright line

## Version 1.6.1 (Feb 28, 2026, 23:30)

* Language toggle: globe icon dropdown in the top-right navbar lets you switch between Deutsch, English, and Français
* Language choice is saved in the browser and remembered across sessions

## Version 1.6.0 (Feb 28, 2026, 23:00)

* Open call mode: create tournaments with no participant limit — all registrations accepted, teams formed automatically after deadline
* Registration alerts: coaches get notified via WhatsApp and the dashboard when tournament spots are filling up (80%) or full
* Public tournament view: shareable link (/tournaments/:id) shows team assignments with privacy-preserving initials — no full names visible
* Name disambiguation: when two players share the same first initial, last-name initials are used automatically (e.g. "J. M." and "J. S.")
* Team name: coaches can set the official tournament team name (e.g. "FC Example E1") displayed on public views
* Upcoming tournaments widget: dashboard shows the next 3 tournaments with date, location, and registration status at a glance
* Notification bell: in-app alerts for tournament threshold events, dismissible from the dashboard header

## Version 1.5.0 (Feb 28, 2026, 23:15)

* WhatsApp RSVP: parents can now confirm or decline attendance by simply texting the bot (e.g. "Luca kommt" or "Mia ist krank")
* Multi-child support: if a parent has multiple children, the bot asks which child they mean
* WhatsApp onboarding: new parents can register by messaging the bot — it asks for name, child's name, birth year, and consent
* Message deduplication: duplicate webhook deliveries are automatically ignored
* Public RSVP page: shareable /rsvp link for quick attendance responses without logging in
* Personalized deep links: WhatsApp reminders now include a one-tap link to confirm or decline attendance online
* Anonymous RSVP: public event links with name search and CAPTCHA protection (privacy-first, no player list shown)
* i18n: all WhatsApp messages support German and English based on the parent's language preference

## Version 1.4.0 (Feb 28, 2026, 23:00)

* Live Ticker: follow tournament scores in real time from the public homepage
* Turnieragenda.ch integration: automatic score import from turnieragenda.ch tournament pages (no copy-paste needed)
* Generic tournament scraping: paste any tournament results URL and the AI extracts scores automatically
* Manual score entry: for tournaments without an online presence, coaches can enter scores directly
* Crawl scheduler: once a results URL is set, scores update automatically every few minutes on match day
* Homepage widget: shows a live score ticker during match day, or upcoming/last tournament info when idle
* Public live page: shareable /live/:id URL for parents to follow along without logging in
* Game history: archive tournament results permanently with player initials and trophy marking

## Version 1.3.0 (Feb 28, 2026, 22:50)

* GDPR: Guardians can request a full data export (JSON + CSV) of their personal data and their children's attendance records
* GDPR: Guardians can request account and data deletion — player data is anonymized, attendance statistics preserved
* GDPR: Explicit consent tracking with timestamps — guardians can give or withdraw consent at any time
* GDPR: All data requests go through an admin approval workflow for transparency and control

## Version 1.2.0 (Feb 28, 2026, 22:35)

* Tournament results tracking — manually record placement, summary, and trophies after tournaments
* Import results from URL — paste a bracket/results URL and AI pre-fills placement and summary for review
* Trophy cabinet — public page at /trophies showing all tournament achievements chronologically
* Dashboard widget — latest trophies at a glance with links to full details
* Team name field — set the official registered team name per tournament for better import accuracy

## Version 1.1.0 (Feb 28, 2026, 21:55)

* Admin onboarding wizard: after creating your account, a 5-step guide walks you through the essential setup — club profile, email, AI assistant, WhatsApp, and inviting your team
* Only the club profile step is required; all others can be skipped and configured later from Settings
* Dashboard checklist: once the wizard is done, a "Getting Started" card shows what to do next — add holidays, create a training, add players, and invite parents
* The checklist auto-hides once everything is set up (or you can dismiss it)
* Settings page: form sections are now reusable components shared between the wizard and settings

## Version 1.0.9 (Feb 28, 2026, 21:45)

* Event series: create recurring weekly events (e.g. "every Monday") with a start and end date
* Series automatically skip vacation weeks — no manual cleanup needed
* Per-instance control: edit or cancel individual dates without affecting the rest of the series
* RSVP on series events works seamlessly — instances are created on demand when parents respond
* Empty state: dashboard and events pages now show helpful "Create Event" and "Create Series" buttons when no events exist
* Series badge: event cards show a subtle "Series" label so you can tell recurring events apart
* Calendar sidebar: new "Event Series" section lists all active series with their schedule

## Version 1.0.8 (Mar 1, 2026, 05:30)

* WhatsApp setup wizard: guided 4-step assistant during onboarding to install Docker, configure and start WAHA, and connect WhatsApp — no terminal needed
* Docker auto-detection: wizard checks if Docker is installed and offers one-click installation if missing
* WAHA configuration: choose port and engine (WEBJS or NOWEB) from a simple dropdown
* QR code connection: scan to link your WhatsApp number directly from the setup screen

## Version 1.0.7 (Mar 1, 2026, 05:00)

* Holiday auto-sync: selected holiday preset is now automatically re-synced daily in the background
* Holiday preset selection is remembered across server restarts and page reloads

## Version 1.0.6 (Mar 1, 2026, 03:30)

* Holiday sync: fixed bug where "Sync Zurich Holidays" always failed (missing year parameter)
* Holiday sources: pick from 10 preset regions (Swiss cantons, German/Austrian states) via grouped dropdown
* Holiday sources: suggest a missing region directly to the project maintainers via GitHub
* Holiday sources: import holidays from URL or ICS file (unchanged, repositioned in UI)

## Version 1.0.5 (Mar 1, 2026, 02:10)

* User management: Admins can view, invite, and manage coaches and other admins directly from Settings
* Coaches can view the user list and invite new coaches
* Admins can change user roles (admin/coach) and trigger password reset emails
* Last-admin protection prevents accidental lockout

## Version 1.0.4 (Mar 1, 2026, 01:50)

* Security Audit widget: Run security self-checks from the Settings page — checks file permissions, database exposure, CORS, admin passwords, security.txt, HTTPS, and .gitignore coverage
* Results displayed with pass/warn/fail status badges, expandable details, and manual re-run button

## Version 1.0.3 (Feb 28, 2026, 23:00)

* llms.txt: Dynamic endpoint at /llms.txt with club name, public API docs, and live statistics — customizable via settings
* MCP server: Read-only Model Context Protocol interface at /mcp for agent interoperability (club info, upcoming events, attendance stats, player categories)
* robots.txt updated: Blocks data-modifying API paths while allowing read-only public endpoints
* Club Profile: New settings section for club name, description, contact info, and logo upload — reflected in llms.txt and MCP server

## Version 1.0.2 (Feb 28, 2026, 22:00)

* Public feeds: Subscribe to club events via RSS 2.0, Atom 1.0, or calendar (ICS)
* Social feeds: Follow the club on Mastodon (ActivityPub) or Bluesky (AT Protocol)
* Calendar subscriptions: Combined feed or per-type (tournaments, matches, trainings)
* Homepage widget: Collapsible "Subscribe to updates" card with copy-to-clipboard URLs
* Admin controls: Toggle each feed type on/off from the settings page
* SEO: Dynamic sitemap listing all enabled feeds, robots.txt with sitemap reference
* Discovery: WebFinger and DID well-known endpoints for federated social

## Version 1.0.1 (Feb 28, 2026, 18:00)

* Bot protection: Altcha proof-of-work captcha on login and attendance — invisible, GDPR-friendly, no tracking cookies
* Rate limiting: 100 req/15min general, 10/15min login, 30/15min data mutations
* Captcha provider architecture is pluggable for future hCaptcha or Friendly Captcha support

## Version 1.0.0 (Feb 28, 2026, 17:00)

* Initial release of OpenKick attendance and tournament management system
* WhatsApp integration via WAHA for free-form message parsing
* Multi-LLM support: OpenAI, Claude, Infomaniak Euria
* SFV junior category auto-classification (A through G)
* Automatic waitlist with promotion when slots open
* Half-automated broadcasts with weather-aware training headsups
* School holiday sync with Stadt Zurich calendar
* Calendar with yearly, monthly, and list views
* Tournament import from PDF and URL via LLM extraction
* Team auto-assignment for tournaments
* Whisper voice message transcription for attendance
* i18n support for German, French, English
* 191 server tests, static frontend export
