# Admin Onboarding Stepper — Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

After creating the admin account on `/setup`, the admin is redirected to `/onboarding` instead of `/dashboard`. A full-page stepper walks them through 4 technical configuration steps + 1 invite step. Once complete (or fully skipped), they land on the dashboard which shows a persistent operational checklist until all items are done.

## Approach

Server-side onboarding state stored in the `settings` table (`onboarding_completed`). This survives browser changes and lets any session detect whether onboarding is done.

## Backend Changes

### New setting

`onboarding_completed` in the `settings` table, seeded as `"false"` in `DEFAULT_SETTINGS`.

### New API endpoints

**`GET /api/onboarding/status`** — returns completion state for each step and checklist item:

```json
{
  "onboardingCompleted": false,
  "steps": {
    "clubProfile": true,
    "email": false,
    "llm": false,
    "waha": false
  },
  "checklist": {
    "hasHolidays": false,
    "hasTrainings": false,
    "hasPlayers": false,
    "hasGuardians": false,
    "hasFeedsConfigured": true
  }
}
```

Detection logic:
- `clubProfile`: `club_name` !== `"My Club"`
- `email`: `smtp_host` setting exists and is non-empty
- `llm`: `llm_api_key` setting exists and is non-empty
- `waha`: `waha_url` !== `"http://localhost:3008"` (the default)
- `hasHolidays`: `vacation_periods` count > 0
- `hasTrainings`: `event_series` count > 0
- `hasPlayers`: `players` count > 0
- `hasGuardians`: `guardians` with `role='parent'` count > 0
- `hasFeedsConfigured`: always true (has defaults)

**`POST /api/onboarding/complete`** — sets `onboarding_completed = "true"`.

### New route file

`server/src/routes/onboarding.ts` — contains both endpoints above.

## Frontend Changes

### 1. New route: `/onboarding`

File: `web/src/app/onboarding/page.tsx`

Full-page stepper with 5 steps:

| Step | Title | Explanation | Required? |
|------|-------|-------------|-----------|
| 1 | Club Profile | "This is how your club appears to parents and players." | Yes (must change name) |
| 2 | Email (SMTP) | "Needed for password resets and notifications." | Skippable |
| 3 | AI Assistant | "Powers automatic lineup suggestions and message drafts." | Skippable |
| 4 | WhatsApp Bot | "Send attendance reminders directly via WhatsApp." | Skippable |
| 5 | Invite Team | "Add coaches or other admins to help manage the club." | Skippable |

UI elements:
- Progress bar at top showing current step
- "Skip for now" link on optional steps (2–5)
- "Save & Continue" primary button
- "Back" link to return to previous step

### 2. Extracted form components

The settings page (~800 lines) will have its form sections extracted into reusable components shared by both `/settings` and `/onboarding`:

| Component | File |
|-----------|------|
| ClubProfileForm | `web/src/components/settings/ClubProfileForm.tsx` |
| SmtpForm | `web/src/components/settings/SmtpForm.tsx` |
| LlmConfigForm | `web/src/components/settings/LlmConfigForm.tsx` |
| WahaConfigForm | `web/src/components/settings/WahaConfigForm.tsx` |

The settings page imports these same components — no duplication.

### 3. AuthGuard modification

After confirming the user is authenticated, fetch `/api/onboarding/status`. If `onboardingCompleted` is `false`, redirect to `/onboarding`.

### 4. Dashboard checklist component

File: `web/src/components/OnboardingChecklist.tsx`

After completing the stepper, the dashboard shows an operational checklist:

- **Desktop:** Collapsible sidebar card on the right
- **Mobile:** Collapsible banner at the top

Checklist items:
1. Add holidays/vacations → links to Settings (holiday section)
2. Create first training → links to Events > New
3. Add players to roster → links to Players
4. Invite parents/guardians → links to Players (invite flow)
5. Set up public feeds (optional) → links to Settings (feeds section)

Each item shows a checkmark when the API reports it as done. The whole checklist auto-hides once all items are complete, or can be manually dismissed.

## Flow

```
/setup (create admin account)
  → token saved
  → redirect to /onboarding
    → Step 1: Club Profile (required — must change default name)
    → Step 2: Email SMTP (skip or configure)
    → Step 3: LLM (skip or configure)
    → Step 4: WAHA (skip or configure)
    → Step 5: Invite team (skip or invite)
    → POST /api/onboarding/complete
    → redirect to /dashboard
      → Operational checklist visible until all items done
```

## Non-goals

- No changes to the existing `/setup` page (admin account creation)
- No changes to parent/guardian onboarding
- No email verification during onboarding (can be added later)
