# OpenKick Release Notes

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
