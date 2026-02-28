# OpenKick Release Notes

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
