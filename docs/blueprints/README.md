# Implementation Blueprints

> **For LLMs and developers implementing OpenKick features.**
>
> Each blueprint contains everything needed to implement a module:
> database schema, API endpoints, file structure, code patterns,
> dependencies, and edge cases. Read the relevant blueprint before
> writing any code for that module.

## Blueprints

| Blueprint | Module | Key Dependencies |
|-----------|--------|------------------|
| [WHATSAPP.md](WHATSAPP.md) | WhatsApp bot (WAHA + message parsing) | WAHA, BuilderBot or custom, LLM |
| [PAYMENTS.md](PAYMENTS.md) | Stripe & Datatrans payments | stripe, axios |
| [SURVEYS.md](SURVEYS.md) | Surveys & questionnaires | — |
| [LIVE_TICKER.md](LIVE_TICKER.md) | Live ticker & game history | cheerio, puppeteer, LLM, Brave API |
| [ADMIN_SECURITY.md](ADMIN_SECURITY.md) | Admin password security & PII gating | @zxcvbn-ts/core, HIBP API |
| [CHECKLISTS.md](CHECKLISTS.md) | Administrative checklists | — |
| [STATISTICS.md](STATISTICS.md) | Statistics & reporting | — |
| [BRANDING.md](BRANDING.md) | Club branding & customisation | — |

## How to Use These Blueprints

1. **Read the blueprint first** — before writing any code for a module
2. **Follow the file structure** — blueprints specify where each file goes
3. **Use the DB schema** — copy the SQL from the blueprint into a migration
4. **Match the API contracts** — other modules depend on these endpoints
5. **Check the edge cases** — each blueprint lists gotchas at the bottom

## Cross-References

- **PRD**: `requirements/FOOTBALL_TOOL_Attendance_and_Tournament_Management.md`
- **Feature checklist**: `FEATURES.md`
- **Integration research** (API details, code samples): `docs/INTEGRATION_RESEARCH.md`
- **User guides**: `docs/guides/`
