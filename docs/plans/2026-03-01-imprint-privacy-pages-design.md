# Imprint & Privacy Pages Design

## Date: 2026-03-01

## Overview

Add public `/imprint/` and `/privacy/` pages with GDPR-compliant content, editable via structured settings fields plus free-text custom paragraphs. Restyle footer to: `Security: security.txt   Imprint · Privacy · [Coach Login]`.

## New Settings Keys

| Key | Example | Page |
|---|---|---|
| `legal_org_name` | "FC Muster" | Both |
| `legal_address` | "Musterstr. 1, 8000 Zürich" | Both |
| `legal_email` | "info@fcmuster.ch" | Both |
| `legal_phone` | "+41 44 123 45 67" | Imprint |
| `legal_responsible` | "Max Mustermann" | Imprint |
| `dpo_name` | "Lisa Muster" | Privacy |
| `dpo_email` | "datenschutz@fcmuster.ch" | Privacy |
| `imprint_extra` | Free text | Imprint |
| `privacy_extra` | Free text | Privacy |

## Imprint Page `/imprint/`

- Responsible entity (org name, address, responsible person)
- Contact (email, phone, contact_info)
- Custom content from `imprint_extra`

## Privacy Page `/privacy/`

- Responsible entity
- Data Protection Officer (dpo_name, dpo_email)
- What data we collect (template)
- Purpose & legal basis (Art. 6(1)(a)+(f) GDPR)
- Data retention
- GDPR rights with links to existing endpoints
- Contact for requests
- Custom content from `privacy_extra`

## Settings UI

New "Legal & Privacy" section in settings page with all structured fields + textareas.

## Footer

```
Feeds: RSS · Atom · Calendar   Data: Sitemap · llms.txt · robots.txt   API: Health · MCP
Security: security.txt   Imprint · Privacy · [Coach Login]
© 2026 Club Name
```
