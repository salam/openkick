# Admin Onboarding Stepper — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Guide new admins through essential configuration (Club Profile, SMTP, LLM, WAHA, Invite Team) via a dedicated stepper page, then show a persistent operational checklist on the dashboard.

**Architecture:** Server-side `onboarding_completed` flag in the `settings` table. A new `/api/onboarding/status` endpoint derives step/checklist completion from existing data. The frontend gets a `/onboarding` stepper page, extracted reusable form components, and a dashboard checklist widget.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 4, Express backend with sql.js (SQLite), TypeScript.

---

## Task 1: Backend — Onboarding API

**Files:**
- Modify: `server/src/database.ts` (add default setting)
- Create: `server/src/routes/onboarding.ts`
- Create: `server/src/routes/__tests__/onboarding.test.ts`
- Modify: main server file where routers are mounted

**Step 1: Add the `onboarding_completed` default setting**

In `server/src/database.ts`, add to `DEFAULT_SETTINGS`:

```ts
onboarding_completed: "false",
```

**Step 2: Write the failing test for `GET /api/onboarding/status`**

Create `server/src/routes/__tests__/onboarding.test.ts`:

```ts
// Use the same test setup pattern as other route tests in this project.
// The test should:
// 1. Init DB in-memory
// 2. Create a test admin user and get a token
// 3. GET /api/onboarding/status → expect 200 with shape:
//    { onboardingCompleted: false, steps: { clubProfile, email, llm, waha }, checklist: { hasHolidays, hasTrainings, hasPlayers, hasGuardians, hasFeedsConfigured } }
// 4. All steps should be false initially (club_name is "My Club" = default)
// 5. After changing club_name to something else → clubProfile becomes true
// 6. POST /api/onboarding/complete → 200
// 7. GET /api/onboarding/status → onboardingCompleted: true
```

Look at `server/src/routes/__tests__/security-audit.test.ts` for the test setup pattern (app initialization, auth token).

**Step 3: Run the test — expect FAIL** (route doesn't exist yet)

Run: `cd server && npx vitest run src/routes/__tests__/onboarding.test.ts`

**Step 4: Implement `server/src/routes/onboarding.ts`**

```ts
import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";

export const onboardingRouter = Router();

function getSetting(key: string): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  return (result[0]?.values[0]?.[0] as string) ?? "";
}

function getCount(sql: string): number {
  const db = getDB();
  const result = db.exec(sql);
  return (result[0]?.values[0]?.[0] as number) ?? 0;
}

onboardingRouter.get("/onboarding/status", (_req: Request, res: Response) => {
  const onboardingCompleted = getSetting("onboarding_completed") === "true";

  const steps = {
    clubProfile: getSetting("club_name") !== "My Club" && getSetting("club_name") !== "",
    email: getSetting("smtp_host") !== "",
    llm: getSetting("llm_api_key") !== "",
    waha: getSetting("waha_url") !== "" && getSetting("waha_url") !== "http://localhost:3008",
  };

  const checklist = {
    hasHolidays: getCount("SELECT COUNT(*) FROM vacation_periods") > 0,
    hasTrainings: getCount("SELECT COUNT(*) FROM event_series") > 0,
    hasPlayers: getCount("SELECT COUNT(*) FROM players") > 0,
    hasGuardians: getCount("SELECT COUNT(*) FROM guardians WHERE role = 'parent'") > 0,
    hasFeedsConfigured: true,
  };

  res.json({ onboardingCompleted, steps, checklist });
});

onboardingRouter.post("/onboarding/complete", (_req: Request, res: Response) => {
  const db = getDB();
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    "onboarding_completed",
    "true",
  ]);
  res.json({ success: true });
});
```

**Step 5: Mount the router**

Find where other routers are mounted (look for `settingsRouter`, `usersRouter` imports). Add:

```ts
import { onboardingRouter } from "./routes/onboarding.js";
app.use("/api", authMiddleware, onboardingRouter);
```

Note: `GET /api/onboarding/status` needs to be accessible for the AuthGuard redirect. Check how `/api/setup/status` is handled — it may need to be mounted as a public endpoint too.

**Step 6: Run the test — expect PASS**

Run: `cd server && npx vitest run src/routes/__tests__/onboarding.test.ts`

**Step 7: Commit**

```
feat: add onboarding status and complete API endpoints
```

---

## Task 2: Extract Form Components from Settings Page

The settings page at `web/src/app/settings/page.tsx` is ~800 lines. Extract 4 form card sections into reusable components so both the settings page and onboarding stepper can use them.

**Files:**
- Create: `web/src/components/settings/ClubProfileForm.tsx`
- Create: `web/src/components/settings/SmtpForm.tsx`
- Create: `web/src/components/settings/LlmConfigForm.tsx`
- Create: `web/src/components/settings/WahaConfigForm.tsx`
- Modify: `web/src/app/settings/page.tsx` (import extracted components)

**Step 1: Define the shared component interface**

Each form component receives:
```ts
interface SettingsFormProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}
```

**Step 2: Extract `ClubProfileForm`**

Create `web/src/components/settings/ClubProfileForm.tsx`. Move the Club Profile card JSX (lines ~482–554 of the settings page) into this component. It needs:
- `settings`, `onUpdate` props
- `onLogoUpload(base64: string)`, `onLogoRemove()` callbacks
- Local state for `uploadingLogo`, `logoMsg` (or receive as props)

Use the existing CSS classes: `cardClass`, `labelClass`, `inputClass` — define them locally since they're simple Tailwind strings.

Import `ImageCropUpload` which is already at `@/components/ImageCropUpload`.

**Step 3: Extract `SmtpForm`**

Create `web/src/components/settings/SmtpForm.tsx`. Move the Email (SMTP) card. It needs:
- `settings`, `onUpdate` props
- SMTP test functionality (the `handleTestSmtp` logic can live inside the component)

**Step 4: Extract `LlmConfigForm`**

Create `web/src/components/settings/LlmConfigForm.tsx`. Move the LLM Configuration card. This is the most complex one — it includes:
- Provider selection
- Model radio buttons with tiers
- API key input
- Product ID for Euria
- Test connection button
- The constants `LLM_PROVIDERS`, `MODEL_SUGGESTIONS`, `PROVIDER_DASHBOARD_LINKS` move into this file

**Step 5: Extract `WahaConfigForm`**

Create `web/src/components/settings/WahaConfigForm.tsx`. Move the WAHA Configuration card. Simplest extraction — just URL input with inline help.

**Step 6: Update `web/src/app/settings/page.tsx`**

Replace the inline JSX for each card with the new component imports. The settings page should still work identically. The `handleSave` function stays in the parent settings page since it saves all changed keys at once.

**Step 7: Verify the settings page still works**

Run: `cd web && npx next build`

**Step 8: Commit**

```
refactor: extract settings form cards into reusable components
```

---

## Task 3: Onboarding Stepper Page

**Files:**
- Create: `web/src/app/onboarding/page.tsx`
- Create: `web/src/app/onboarding/layout.tsx`
- Create: `web/src/components/settings/InviteTeamForm.tsx`

**Step 1: Create the layout**

`web/src/app/onboarding/layout.tsx` — wrap in `AuthGuard` (same pattern as `web/src/app/settings/layout.tsx`), but without the Navbar (full-screen stepper experience).

**Step 2: Build the stepper page**

`web/src/app/onboarding/page.tsx`:

State:
- `currentStep` (0–4)
- `settings` (Record<string, string>) — loaded from `GET /api/settings`
- `saving` (boolean)

Steps array:
```ts
const STEPS = [
  { key: 'clubProfile', title: 'Club Profile', description: 'This is how your club appears to parents and players.', required: true, Component: ClubProfileForm },
  { key: 'email', title: 'Email (SMTP)', description: 'Needed for password resets and notifications to parents.', required: false, Component: SmtpForm },
  { key: 'llm', title: 'AI Assistant', description: 'Powers automatic lineup suggestions and message drafts.', required: false, Component: LlmConfigForm },
  { key: 'waha', title: 'WhatsApp Bot', description: 'Send attendance reminders directly via WhatsApp.', required: false, Component: WahaConfigForm },
  { key: 'invite', title: 'Invite Team', description: 'Add coaches or other admins to help manage the club.', required: false, Component: InviteTeamForm },
];
```

UI layout:
- Top: OpenKick branding + progress indicator ("Step 2 of 5" with a segmented bar)
- Center (`max-w-2xl`): Step title, explanation paragraph, then the form component
- Bottom: "Back" link (left), "Skip for now" (center, only on optional steps), "Save & Continue" button (right)

On the last step's "Finish" click:
1. Save any pending settings
2. `POST /api/onboarding/complete`
3. `router.push('/dashboard/')`

For step 1 (Club Profile), disable "Save & Continue" if `club_name` is still `"My Club"` or empty.

**Step 3: Create `InviteTeamForm` component**

Create `web/src/components/settings/InviteTeamForm.tsx`. Simplified version of the invite section from settings — just the invite form (name, email, role select, invite button). Reuses `/api/users/invite` endpoint.

**Step 4: Handle settings save per step**

Each step's "Save & Continue" saves only the relevant settings keys for that step via `PUT /api/settings/:key`. Don't wait for a global "Save All".

**Step 5: On mount, check if onboarding is already complete**

Fetch `GET /api/onboarding/status`. If `onboardingCompleted` is true, redirect to `/dashboard/`.

**Step 6: Build and verify**

Run: `cd web && npx next build`

**Step 7: Commit**

```
feat: add onboarding stepper page with 5-step wizard
```

---

## Task 4: AuthGuard — Redirect to Onboarding

**Files:**
- Modify: `web/src/components/AuthGuard.tsx`
- Modify: `web/src/app/setup/page.tsx`

**Step 1: Add onboarding check to AuthGuard**

After confirming the user is authenticated (line 21–32 of AuthGuard), add a check:

```ts
// After confirming auth, check onboarding status
const statusRes = await fetch(`${API_URL}/api/onboarding/status`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { onboardingCompleted } = await statusRes.json();
if (!onboardingCompleted && !window.location.pathname.startsWith('/onboarding')) {
  router.replace('/onboarding');
  return;
}
setChecked(true);
```

Important: The `/onboarding` page itself is wrapped in AuthGuard, so avoid redirect loops — skip the onboarding check when already on `/onboarding`.

**Step 2: Update setup page redirect**

In `web/src/app/setup/page.tsx`, change `router.push('/dashboard/')` (line 58) to `router.push('/onboarding/')`. After creating the admin account, go straight to onboarding.

**Step 3: Build and verify**

Run: `cd web && npx next build`

**Step 4: Commit**

```
feat: redirect new admins to onboarding stepper after setup
```

---

## Task 5: Dashboard Onboarding Checklist

**Files:**
- Create: `web/src/components/OnboardingChecklist.tsx`
- Modify: `web/src/app/dashboard/page.tsx`
- Modify: `web/src/app/settings/page.tsx` (add anchor IDs)

**Step 1: Build the checklist component**

`web/src/components/OnboardingChecklist.tsx`:

Props: none (fetches its own data from `/api/onboarding/status`)

State:
- checklist data (from API)
- collapsed (boolean, default false)
- dismissed (boolean, stored in localStorage key `onboarding_checklist_dismissed`)

Checklist items (hardcoded, matched against API response keys):
```ts
const CHECKLIST_ITEMS = [
  { key: 'hasHolidays', label: 'Add holidays & vacations', href: '/settings#holidays' },
  { key: 'hasTrainings', label: 'Create your first training', href: '/events/new' },
  { key: 'hasPlayers', label: 'Add players to the roster', href: '/players' },
  { key: 'hasGuardians', label: 'Invite parents & guardians', href: '/players' },
  { key: 'hasFeedsConfigured', label: 'Set up public feeds (optional)', href: '/settings#feeds' },
];
```

Render:
- Card with "Getting Started" header and progress (e.g., "2 of 5 done")
- Each item: checkbox icon (checked if API says true) + label as a link
- "Dismiss" button to hide permanently (localStorage)
- If all items complete OR dismissed, render nothing

**Step 2: Add anchor IDs to settings page**

In `web/src/app/settings/page.tsx`, add `id="holidays"` and `id="feeds"` to the corresponding card `<div>` elements so the checklist links scroll to the right section.

**Step 3: Add to dashboard page**

In `web/src/app/dashboard/page.tsx`, import and render `OnboardingChecklist` above the stats grid. The component handles its own visibility logic (hides itself if dismissed or all done).

**Step 4: Responsive layout**

- Render as a full-width collapsible card above the stats grid
- Desktop and mobile both use the same layout (card with toggle)

**Step 5: Build and verify**

Run: `cd web && npx next build`

**Step 6: Commit**

```
feat: add operational checklist to dashboard after onboarding
```

---

## Task 6: End-to-End Verification & Cleanup

**Step 1: Run all tests**

```bash
cd server && npx vitest run
```

**Step 2: Full frontend build**

```bash
cd web && npx next build
```

**Step 3: Manual flow test**

1. Delete the database (or use a fresh one)
2. Visit the app → should redirect to `/setup`
3. Create admin account → should redirect to `/onboarding`
4. Complete step 1 (change club name) → "Save & Continue"
5. Skip steps 2–5
6. Should land on dashboard with operational checklist visible
7. Visit `/settings` → all settings still work, forms are identical
8. Complete a checklist item (e.g., add a player) → checklist updates

**Step 4: Update FEATURES.md**

Add the onboarding stepper feature.

**Step 5: Update RELEASE_NOTES.md**

Add release note entry.

**Step 6: Update user docs if needed**

Check if `docs/QUICK_START_COACHES.md` needs updating to mention the onboarding flow.

**Step 7: Final commit**

```
docs: add onboarding stepper to features and release notes
```
