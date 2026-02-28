# Holiday Sources Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken single-region Zurich holiday sync with a generic multi-region preset picker, hybrid sync logic, and a "suggest a source" feature.

**Architecture:** New preset registry (`holiday-presets.ts`) defines available regions with hardcoded fallback data + optional external .ics URLs. Generic `POST /api/vacations/sync` replaces the old Zurich-only endpoint. Frontend gets a grouped `<select>` dropdown instead of a single button.

**Tech Stack:** TypeScript, Express, sql.js, React/Next.js, Vitest

---

### Task 1: Create Holiday Preset Registry

**Files:**
- Create: `server/src/services/holiday-presets.ts`
- Test: `server/src/services/__tests__/holiday-presets.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/holiday-presets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HOLIDAY_PRESETS, getPresetById, getPresetGroups } from "../holiday-presets.js";

describe("HOLIDAY_PRESETS", () => {
  it("contains ch-zurich with full holiday data", () => {
    const zurich = getPresetById("ch-zurich");
    expect(zurich).toBeDefined();
    expect(zurich!.label).toBe("Zürich (Stadt)");
    expect(zurich!.group).toBe("Switzerland");
    const holidays = zurich!.getHolidays(2026);
    expect(holidays).toHaveLength(5);
    expect(holidays[0].source).toBe("preset:ch-zurich");
  });

  it("contains at least 10 presets across 3 groups", () => {
    expect(HOLIDAY_PRESETS.length).toBeGreaterThanOrEqual(10);
    const groups = new Set(HOLIDAY_PRESETS.map((p) => p.group));
    expect(groups.size).toBeGreaterThanOrEqual(3);
  });

  it("stub presets return empty arrays from getHolidays", () => {
    const bern = getPresetById("ch-bern");
    expect(bern).toBeDefined();
    expect(bern!.getHolidays(2026)).toEqual([]);
  });

  it("getPresetGroups returns grouped structure", () => {
    const groups = getPresetGroups();
    expect(groups).toBeInstanceOf(Array);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const g of groups) {
      expect(g.group).toBeTruthy();
      expect(g.presets.length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for unknown preset id", () => {
    expect(getPresetById("xx-unknown")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/holiday-presets.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `server/src/services/holiday-presets.ts`:

```ts
import type { VacationPeriod } from "./holidays.js";
import { getZurichHolidays } from "./holidays.js";

export interface HolidayPreset {
  id: string;
  label: string;
  group: string;
  getHolidays: (year: number) => VacationPeriod[];
  externalUrl?: string;
}

export interface PresetGroup {
  group: string;
  presets: { id: string; label: string }[];
}

function makeStub(id: string, label: string, group: string, externalUrl?: string): HolidayPreset {
  return { id, label, group, getHolidays: () => [], externalUrl };
}

function wrapSource(id: string, fn: (year: number) => VacationPeriod[]): (year: number) => VacationPeriod[] {
  return (year) => fn(year).map((h) => ({ ...h, source: `preset:${id}` }));
}

export const HOLIDAY_PRESETS: HolidayPreset[] = [
  // Switzerland
  { id: "ch-zurich", label: "Zürich (Stadt)", group: "Switzerland", getHolidays: wrapSource("ch-zurich", getZurichHolidays) },
  makeStub("ch-bern", "Bern", "Switzerland"),
  makeStub("ch-basel", "Basel-Stadt", "Switzerland"),
  makeStub("ch-luzern", "Luzern", "Switzerland"),
  makeStub("ch-aargau", "Aargau", "Switzerland"),
  makeStub("ch-stgallen", "St. Gallen", "Switzerland"),
  // Germany
  makeStub("de-bw", "Baden-Württemberg", "Germany"),
  makeStub("de-bayern", "Bayern", "Germany"),
  // Austria
  makeStub("at-vorarlberg", "Vorarlberg", "Austria"),
  makeStub("at-tirol", "Tirol", "Austria"),
];

export function getPresetById(id: string): HolidayPreset | undefined {
  return HOLIDAY_PRESETS.find((p) => p.id === id);
}

export function getPresetGroups(): PresetGroup[] {
  const map = new Map<string, { id: string; label: string }[]>();
  for (const p of HOLIDAY_PRESETS) {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push({ id: p.id, label: p.label });
  }
  return Array.from(map.entries()).map(([group, presets]) => ({ group, presets }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/holiday-presets.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/holiday-presets.ts server/src/services/__tests__/holiday-presets.test.ts && git commit -m "feat: add holiday preset registry with 10 regions" -- server/src/services/holiday-presets.ts server/src/services/__tests__/holiday-presets.test.ts
```

---

### Task 2: Add Hybrid Sync Function to holidays.ts

**Files:**
- Modify: `server/src/services/holidays.ts` (add `syncPresetHolidays`)
- Modify: `server/src/services/__tests__/holidays.test.ts` (add tests)

**Step 1: Write the failing tests**

Append to `server/src/services/__tests__/holidays.test.ts`, adding the import and new describe block:

```ts
// Add at top with other imports:
import { getPresetById } from "../holiday-presets.js";

// Add after existing describe blocks:

describe("syncPresetHolidays", () => {
  let syncPresetHolidays: typeof import("../holidays.js").syncPresetHolidays;

  beforeEach(async () => {
    const mod = await import("../holidays.js");
    syncPresetHolidays = mod.syncPresetHolidays;
  });

  it("syncs ch-zurich preset and inserts 5 periods", () => {
    const result = syncPresetHolidays("ch-zurich", 2026);
    expect(result.synced).toBe(5);
    expect(result.source).toBe("fallback");

    const db = getDB();
    const rows = db.exec("SELECT * FROM vacation_periods WHERE source = 'preset:ch-zurich'");
    expect(rows[0].values.length).toBe(5);
  });

  it("replaces previous entries on re-sync", () => {
    syncPresetHolidays("ch-zurich", 2026);
    syncPresetHolidays("ch-zurich", 2026);

    const db = getDB();
    const rows = db.exec("SELECT * FROM vacation_periods WHERE source = 'preset:ch-zurich'");
    expect(rows[0].values.length).toBe(5); // not 10
  });

  it("returns synced 0 for stub preset with no external URL", () => {
    const result = syncPresetHolidays("ch-bern", 2026);
    expect(result.synced).toBe(0);
    expect(result.source).toBe("fallback");
  });

  it("throws for unknown preset id", () => {
    expect(() => syncPresetHolidays("xx-unknown", 2026)).toThrow("Unknown preset");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/holidays.test.ts`
Expected: FAIL — `syncPresetHolidays` is not exported

**Step 3: Add syncPresetHolidays to holidays.ts**

Add import at the top and function at the end of `server/src/services/holidays.ts`:

```ts
// Add to imports at top:
import { getPresetById } from "./holiday-presets.js";

// Add at end of file:
export function syncPresetHolidays(
  presetId: string,
  year: number,
): { synced: number; source: "external" | "fallback" } {
  const preset = getPresetById(presetId);
  if (!preset) throw new Error(`Unknown preset: ${presetId}`);

  const db = getDB();
  const sourceTag = `preset:${presetId}`;

  // Delete previous entries for this preset
  db.run("DELETE FROM vacation_periods WHERE source = ?", [sourceTag]);

  // Fall back to hardcoded data (hybrid external fetch is a future enhancement)
  const holidays = preset.getHolidays(year);

  for (const h of holidays) {
    db.run(
      "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
      [h.name, h.startDate, h.endDate, sourceTag],
    );
  }

  return { synced: holidays.length, source: "fallback" };
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/holidays.test.ts`
Expected: PASS (all old + new tests)

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/holidays.ts server/src/services/__tests__/holidays.test.ts && git commit -m "feat: add syncPresetHolidays with replace-on-sync logic" -- server/src/services/holidays.ts server/src/services/__tests__/holidays.test.ts
```

---

### Task 3: Add Generic Sync + Presets API Endpoints

**Files:**
- Modify: `server/src/routes/calendar.ts` (replace sync-zurich, add presets endpoint)
- Modify: `server/src/routes/__tests__/calendar.test.ts` (update tests)

**Step 1: Write the failing tests**

In `server/src/routes/__tests__/calendar.test.ts`, replace the existing `"POST /api/vacations/sync-zurich"` test (line 281-296) with:

```ts
  it("GET /api/vacations/presets — returns grouped preset list", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/presets`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.length).toBeGreaterThanOrEqual(3);
    expect(body[0].group).toBeTruthy();
    expect(body[0].presets.length).toBeGreaterThan(0);
  });

  it("POST /api/vacations/sync — syncs a preset by id", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetId: "ch-zurich" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBeGreaterThan(0);
    expect(body.source).toBe("fallback");
  });

  it("POST /api/vacations/sync — returns 400 for unknown preset", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetId: "xx-unknown" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/vacations/sync — returns 400 if presetId missing", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/calendar.test.ts`
Expected: FAIL — 404 for new endpoints

**Step 3: Update calendar.ts routes**

In `server/src/routes/calendar.ts`:

1. Update imports — replace `syncZurichHolidays, getZurichHolidays` with `syncPresetHolidays`:

```ts
import {
  parseICS,
  extractHolidaysFromUrl,
  syncPresetHolidays,
} from "../services/holidays.js";
import { getPresetGroups, getPresetById } from "../services/holiday-presets.js";
```

2. Remove the old `POST /api/vacations/sync-zurich` route (lines 207-219).

3. Add two new routes in its place:

```ts
// GET /api/vacations/presets
calendarRouter.get("/vacations/presets", (_req: Request, res: Response) => {
  res.json(getPresetGroups());
});

// POST /api/vacations/sync
calendarRouter.post("/vacations/sync", (req: Request, res: Response) => {
  const { presetId, year } = req.body;

  if (!presetId) {
    res.status(400).json({ error: "presetId is required" });
    return;
  }

  if (!getPresetById(presetId)) {
    res.status(400).json({ error: `Unknown preset: ${presetId}` });
    return;
  }

  const syncYear = year ?? new Date().getFullYear();
  const result = syncPresetHolidays(presetId, syncYear);
  res.json(result);
});
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/calendar.test.ts`
Expected: PASS

**Step 5: Run full server test suite**

Run: `cd server && npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/routes/calendar.ts server/src/routes/__tests__/calendar.test.ts && git commit -m "feat: add generic /api/vacations/sync and /api/vacations/presets endpoints" -- server/src/routes/calendar.ts server/src/routes/__tests__/calendar.test.ts
```

---

### Task 4: Redesign Frontend Holiday Sources Card

**Files:**
- Modify: `web/src/app/settings/page.tsx`

**Step 1: Update state variables**

At the top of `SettingsPage` component (around line 102), replace:
```ts
const [syncingZurich, setSyncingZurich] = useState(false);
```
with:
```ts
const [presets, setPresets] = useState<{ group: string; presets: { id: string; label: string }[] }[]>([]);
const [selectedPreset, setSelectedPreset] = useState('');
const [syncing, setSyncing] = useState(false);
const [suggestion, setSuggestion] = useState('');
```

**Step 2: Add useEffect to fetch presets**

After the existing settings-loading `useEffect`, add:

```ts
useEffect(() => {
  apiFetch<{ group: string; presets: { id: string; label: string }[] }[]>('/api/vacations/presets')
    .then((data) => {
      setPresets(data);
      const saved = settings['holiday_preset'];
      if (saved) setSelectedPreset(saved);
      else if (data[0]?.presets[0]) setSelectedPreset(data[0].presets[0].id);
    })
    .catch(() => {});
}, []);
```

**Step 3: Replace handleSyncZurich with handleSyncPreset**

Replace the `handleSyncZurich` function (lines 208-220) with:

```ts
async function handleSyncPreset() {
  if (!selectedPreset) return;
  setSyncing(true);
  setHolidayMsg('');
  try {
    await apiFetch('/api/vacations/sync', {
      method: 'POST',
      body: JSON.stringify({ presetId: selectedPreset }),
    });
    setHolidayMsg('Holidays synced successfully.');
  } catch {
    setHolidayMsg('Failed to sync holidays.');
  } finally {
    setSyncing(false);
    setTimeout(() => setHolidayMsg(''), 3000);
  }
}
```

**Step 4: Add suggestion handler**

Add after `handleSyncPreset`:

```ts
function handleSuggestSource() {
  if (!suggestion.trim()) return;
  const title = encodeURIComponent('Holiday source request');
  const body = encodeURIComponent(
    `**Requested region / source:**\n${suggestion}\n\n_Submitted from OpenKick settings_`
  );
  window.open(
    `https://github.com/your-org/openkick/issues/new?title=${title}&body=${body}&labels=holiday-source`,
    '_blank',
  );
  setSuggestion('');
}
```

**Step 5: Replace the Holiday Sources card JSX**

Replace lines 712-777 (the entire Holiday Sources card) with:

```tsx
{/* Holiday Sources */}
<div className={cardClass}>
  <h2 className="mb-4 text-lg font-semibold text-gray-900">
    Holiday Sources
  </h2>
  <div className="space-y-4">
    {/* Region Picker */}
    <div>
      <label htmlFor="holiday_preset" className={labelClass}>
        School holiday region
      </label>
      <div className="flex gap-2">
        <select
          id="holiday_preset"
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value)}
          className={inputClass}
        >
          {presets.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.presets.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={handleSyncPreset}
          disabled={syncing || !selectedPreset}
          className={btnSecondary + ' whitespace-nowrap'}
        >
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>
    </div>

    {/* Manual Import */}
    <div className="border-t border-gray-200 pt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        Or import manually
      </p>
      <div className="space-y-3">
        <div>
          <label htmlFor="import_url" className={labelClass}>
            Import from URL
          </label>
          <div className="flex gap-2">
            <input
              id="import_url"
              type="text"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste holidays URL..."
              className={inputClass}
            />
            <button
              onClick={handleImportUrl}
              disabled={importingUrl || !importUrl.trim()}
              className={btnSecondary + ' whitespace-nowrap'}
            >
              {importingUrl ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="upload_ics" className={labelClass}>
            Upload ICS File
          </label>
          <input
            id="upload_ics"
            type="file"
            accept=".ics"
            onChange={handleUploadIcs}
            disabled={uploadingIcs}
            className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 file:shadow-sm hover:file:bg-gray-50"
          />
        </div>
      </div>
    </div>

    {/* Suggest a Source */}
    <div className="border-t border-gray-200 pt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        Missing your region?
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="Describe the region or paste a URL..."
          className={inputClass}
        />
        <button
          onClick={handleSuggestSource}
          disabled={!suggestion.trim()}
          className={btnSecondary + ' whitespace-nowrap'}
        >
          Suggest
        </button>
      </div>
    </div>

    {holidayMsg && (
      <p
        className={`text-sm font-medium ${
          holidayMsg.includes('Failed')
            ? 'text-red-600'
            : 'text-emerald-600'
        }`}
      >
        {holidayMsg}
      </p>
    )}
  </div>
</div>
```

**Step 6: Build the frontend**

Run: `cd web && npx next build`
Expected: Build succeeds with no type errors

**Step 7: Commit**

```bash
git restore --staged :/ && git add web/src/app/settings/page.tsx && git commit -m "feat: redesign Holiday Sources with region picker and suggest feature" -- web/src/app/settings/page.tsx
```

---

### Task 5: Full Verification

**Step 1: Run full server test suite**

Run: `cd server && npx vitest run`
Expected: All PASS

**Step 2: Run frontend build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 3: Search for stale references**

Search for `sync-zurich` across the codebase — if any remain besides the design doc, update them.

**Step 4: Commit any fixes if needed**

---

### Task 6: Update Release Notes and Docs

**Files:**
- Modify: `RELEASE_NOTES.md`
- Modify: `FEATURES.md` (if applicable)

**Step 1: Add release notes entry**

```markdown
## Release X.X (Fri, Feb 28 HH:MM)

* Holiday sync: fixed bug where "Sync Zurich Holidays" always failed (missing year parameter)
* Holiday sources: pick from 10 preset regions (Swiss cantons, German/Austrian states)
* Holiday sources: suggest a missing region directly to the project maintainers
* Holiday sources: import holidays from URL or ICS file (unchanged, repositioned in UI)
```

**Step 2: Update FEATURES.md**

Check off any related items, add new ones if needed.

**Step 3: Commit docs**

```bash
git restore --staged :/ && git add RELEASE_NOTES.md FEATURES.md && git commit -m "docs: update release notes for holiday sources redesign" -- RELEASE_NOTES.md FEATURES.md
```
