# Holiday Sources Redesign

**Date:** 2026-02-28
**Status:** Approved

## Problem

1. "Sync Zurich Holidays" button fails — frontend doesn't send the required `year` parameter
2. Zurich is hardcoded as the only preset; the UI doesn't support other regions
3. No way for users to suggest missing holiday sources

## Design

### Bug Fix

- **Frontend:** Send `{ year: currentYear }` in the POST body
- **Backend:** Default `year` to current year when omitted (defensive)

### Preset Region Registry

New file `server/src/services/holiday-presets.ts`:

```ts
interface HolidayPreset {
  id: string;           // e.g. "ch-zurich"
  label: string;        // "Zürich (Stadt)"
  group: string;        // "Switzerland" | "Germany" | "Austria"
  getHolidays: (year: number) => VacationPeriod[];
  externalUrl?: string; // optional .ics URL to try first
}
```

Initial presets:
- **Switzerland:** Zürich (full data), Bern, Basel-Stadt, Luzern, Aargau, St. Gallen (stubs)
- **Germany:** Baden-Württemberg, Bayern (stubs)
- **Austria:** Vorarlberg, Tirol (stubs)

Stubs return empty arrays from `getHolidays()` but may have `externalUrl` for hybrid fetch.

### Generic Sync Endpoint

Replace `POST /api/vacations/sync-zurich` with `POST /api/vacations/sync`:

```
{ presetId: "ch-zurich", year?: 2026 }
```

- Returns available presets via `GET /api/vacations/presets`
- Old endpoint removed or redirected

### Hybrid Sync Logic

1. If preset has `externalUrl` → try fetch + parse .ics
2. If fetch fails or no URL → fall back to hardcoded `getHolidays(year)`
3. Delete previous entries with matching source before inserting (replace, not append)

### UI Redesign

The Holiday Sources settings card has three sections:

**1. Region Picker**
- `<select>` with `<optgroup>` by country
- "Sync" button next to it
- Selected preset persisted as `holiday_preset` setting
- Year defaults to current year (no year picker needed)

**2. Manual Import** ("Or import manually")
- Import from URL: text input + Import button (existing)
- Upload ICS: file input (existing)

**3. Suggest a Source** ("Missing your region?")
- Textarea for region description / URL
- "Submit Suggestion" button opens a pre-filled GitHub issue in a new tab
- Client-side only: `window.open()` with query params
- GitHub repo URL configurable via constant (currently `your-org/openkick`)

### Layout

```
┌─ Holiday Sources ──────────────────────────────┐
│                                                 │
│  School holiday region:                         │
│  [ Zürich (Stadt)                         ▾ ]   │
│                                    [ Sync ]     │
│                                                 │
│  ── Or import manually ───────────────────      │
│  Import from URL: [________________] [Import]   │
│  Upload ICS:      [Choose file...]              │
│                                                 │
│  ── Missing your region? ─────────────────      │
│  [  Describe the region / paste a URL...  ]     │
│  [ Submit Suggestion → GitHub ]                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Files Affected

- `server/src/services/holiday-presets.ts` — new, preset registry
- `server/src/services/holidays.ts` — refactor sync to use presets, hybrid logic
- `server/src/routes/calendar.ts` — new generic sync + presets endpoint
- `web/src/app/settings/page.tsx` — redesigned Holiday Sources card
- Tests for all of the above
