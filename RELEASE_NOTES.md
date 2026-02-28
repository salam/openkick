# OpenKick Release Notes

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
