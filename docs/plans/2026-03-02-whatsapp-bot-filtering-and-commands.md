# WhatsApp Bot: Sender Filtering, Coach Commands & Configurable Templates — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Filter WhatsApp messages to known guardians/users only, add coach management commands, append "(by OpenKick)" to all replies, and let admins customize all bot text templates via a Settings UI with live preview.

**Architecture:** The webhook handler gets a sender-filter gate at the top. A new `whatsapp-coach.ts` service handles coach/admin intents with an extended LLM prompt. A `getBotTemplate()` helper resolves custom templates from `settings` table before falling back to i18n translations. A new `BotSettingsForm` component in the Settings page provides template editing with live preview.

**Tech Stack:** Express.js backend, SQLite (sql.js), Next.js frontend (React), existing i18n system with `t()` helper.

---

### Task 1: Sender Filtering — Tests

**Files:**
- Create: `server/src/routes/__tests__/whatsapp-filtering.test.ts`

**Step 1: Write the failing tests**

Test cases:
1. Known guardian phone -> processes message (returns status "ok" or "help_sent")
2. Unknown phone with `bot_allow_onboarding=false` -> silently ignored (returns status "ignored")
3. Unknown phone with `bot_allow_onboarding=true` -> starts onboarding
4. `fromMe` message from known guardian -> processes normally

Use the existing test patterns from `server/src/routes/__tests__/` — mock `getDB`, `sendMessage`, `parseIntent`.

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/__tests__/whatsapp-filtering.test.ts`
Expected: FAIL — filtering logic doesn't exist yet

**Step 3: Commit**

Commit test file with message: "test: add WhatsApp sender filtering tests"

---

### Task 2: Sender Filtering — Implementation

**Files:**
- Modify: `server/src/routes/whatsapp.ts` (lines 151-247 — the webhook handler)

**Step 1: Add `fromMe` to the WAHAWebhookPayload interface**

Add `fromMe?: boolean;` to the `payload` interface at line 24.

**Step 2: Add sender filter gate after dedup check (after line 184)**

Look up the phone in guardians. If not found and not `fromMe`:
- Check `bot_allow_onboarding` setting (default false)
- If false and session is idle -> return 200 with status "ignored"
- If true or session active -> fall through to existing logic

**Step 3: Update the existing "no guardian" block (lines 231-247)**

The unconditional onboarding start is now guarded by the filter above.

**Step 4: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/whatsapp-filtering.test.ts`
Expected: PASS

**Step 5: Commit**

Commit with message: "feat: filter WhatsApp messages to known guardians only"

---

### Task 3: "(by OpenKick)" Suffix — Tests & Implementation

**Files:**
- Create: `server/src/services/__tests__/whatsapp-suffix.test.ts`
- Modify: `server/src/services/whatsapp.ts` (line 17-31 — `sendMessage` function)

**Step 1: Write the failing test**

Verify sendMessage appends " (by OpenKick)" to text. Mock `fetch` and assert the body contains the suffixed text.

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-suffix.test.ts`
Expected: FAIL

**Step 3: Modify `sendMessage` in `server/src/services/whatsapp.ts`**

Change the text field in the JSON body from `text` to `` `${text} (by OpenKick)` ``.

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-suffix.test.ts`
Expected: PASS

**Step 5: Commit**

Commit with message: "feat: append '(by OpenKick)' to all WhatsApp bot replies"

---

### Task 4: Bot Template Resolution Helper — Tests & Implementation

**Files:**
- Create: `server/src/services/whatsapp-templates.ts`
- Create: `server/src/services/__tests__/whatsapp-templates.test.ts`

**Step 1: Write the failing test**

Test cases:
1. No custom template in settings -> returns default from `t(key, lang, params)`
2. Custom template exists in settings -> uses it with variable interpolation
3. Variables like `{{playerName}}` are correctly replaced in custom templates

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-templates.test.ts`
Expected: FAIL

**Step 3: Implement `getBotTemplate`**

Create `server/src/services/whatsapp-templates.ts`:
- Query `settings` table for key `bot_template_<key>`
- If found, interpolate `{{var}}` placeholders with params
- If not found, fall back to `t(key, lang, params)`

**Step 4: Run tests**

Expected: PASS

**Step 5: Commit**

Commit with message: "feat: add getBotTemplate helper for customizable WhatsApp messages"

---

### Task 5: Replace `t()` calls with `getBotTemplate()` in webhook & onboarding

**Files:**
- Modify: `server/src/routes/whatsapp.ts`
- Modify: `server/src/services/whatsapp-onboarding.ts`

**Step 1: Import and replace in `whatsapp.ts`**

Replace all `t("whatsapp_*", ...)` calls with `getBotTemplate("whatsapp_*", ...)`. Key locations:
- Line 104: help message
- Line 145: confirmation after disambiguation
- Lines 241-243: welcome + onboarding messages
- Line 256: help message
- Lines 300-303: disambiguation
- Lines 326-331: confirmation messages

**Step 2: Replace in `whatsapp-onboarding.ts`**

Replace all `t("whatsapp_*", ...)` calls with `getBotTemplate(...)` for all onboarding messages.

**Step 3: Run all existing tests**

Run: `cd server && npx vitest run`
Expected: PASS (behavior unchanged, just resolution path updated)

**Step 4: Commit**

Commit with message: "refactor: use getBotTemplate for all WhatsApp messages"

---

### Task 6: Coach/Admin Intent Parsing — Tests & Implementation

**Files:**
- Create: `server/src/services/whatsapp-coach.ts`
- Create: `server/src/services/__tests__/whatsapp-coach.test.ts`

**Step 1: Write failing tests**

Test `parseCoachIntent` with various inputs and test `handleCoachIntent` for each intent type:
- `attendance_overview`: returns formatted attendance list
- `cancel_event`: cancels event, notifies guardians
- `send_reminder`: triggers reminder
- `mark_attendance`: manually sets attendance
- `match_sheet`: returns lineup
- `admin_link`: returns deep link

**Step 2: Implement `parseCoachIntent`**

Uses `chatCompletion` with an extended system prompt that classifies coach/admin intents.

**Step 3: Implement `handleCoachIntent`**

Dispatcher function that routes to specific handlers:
- `handleAttendanceOverview`: Query next event attendance, format as list with emoji indicators
- `handleCancelEvent`: Mark event cancelled, notify all guardians
- `handleSendReminder`: Trigger reminder for next event
- `handleMarkAttendance`: Find player, set attendance, confirm
- `handleMatchSheet`: Query lineup data, format and send
- `handleAdminLink`: Return deep link to web portal

**Step 4: Add translation keys**

Add to `de.ts` and `en.ts`:
- `whatsapp_coach_attendance_overview` (with `{{list}}` variable)
- `whatsapp_coach_event_cancelled` (with `{{eventTitle}}`, `{{eventDate}}`)
- `whatsapp_coach_reminder_sent`
- `whatsapp_coach_mark_confirmed`
- `whatsapp_coach_no_event`
- `whatsapp_coach_admin_link` (with `{{url}}`)
- `whatsapp_coach_help`

**Step 5: Run tests**

Expected: PASS

**Step 6: Commit**

Commit with message: "feat: add coach/admin WhatsApp command parsing and handlers"

---

### Task 7: Integrate Coach Routing into Webhook

**Files:**
- Modify: `server/src/routes/whatsapp.ts`

**Step 1: Update `findGuardianByPhone` to return `role`**

Add `role` to the SELECT and return object.

**Step 2: Add role-based routing after guardian lookup**

After finding the guardian and before `parseIntent`, check if role is `coach` or `admin`. If so, use `parseCoachIntent` first. If the coach intent is not `unknown`, handle it and return. If `unknown`, fall through to parent attendance logic.

**Step 3: Run tests**

Run: `cd server && npx vitest run`
Expected: PASS

**Step 4: Commit**

Commit with message: "feat: route coach/admin WhatsApp messages to extended command handler"

---

### Task 8: Bot Settings UI — Component

**Files:**
- Create: `web/src/components/settings/BotSettingsForm.tsx`

**Step 1: Build the component**

Follow existing patterns from `SmtpForm.tsx`, `LlmConfigForm.tsx`:
- Toggle for `bot_allow_onboarding`
- For each `whatsapp_*` template key:
  - Label with description
  - Textarea (shows custom value or default as placeholder)
  - Variable hints (e.g., "Available: {{playerName}}, {{eventTitle}}, {{eventDate}}")
  - Live preview panel with sample data filled in
  - "Reset to default" button per template
- Save button that PUTs each modified template as `bot_template_<key>` to `/api/settings/<key>`

Template groups:
1. **General**: help, welcome
2. **Confirmations**: confirm_attending, confirm_absent, confirm_waitlist, disambiguate
3. **Onboarding**: ask_name, ask_child, ask_birthyear, ask_consent, no_match, birthyear_mismatch, consent_declined, complete
4. **Reminders**: reminder_with_link
5. **Coach**: coach-specific templates

**Step 2: Commit**

Commit with message: "feat: add BotSettingsForm component for WhatsApp template customization"

---

### Task 9: Integrate BotSettingsForm into Settings Page

**Files:**
- Modify: `web/src/app/settings/page.tsx`

**Step 1: Import and render BotSettingsForm**

Add the import and render `<BotSettingsForm />` in the settings page, in a new "Bot" section. Add `bot_allow_onboarding` and `bot_template_*` keys to the `SETTING_KEYS` array.

**Step 2: Add i18n keys**

Add `settings_bot_section`, `settings_bot_allow_onboarding`, `settings_bot_templates` to web i18n.

**Step 3: Run the build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Commit**

Commit with message: "feat: add Bot section to Settings page"

---

### Task 10: Final Integration Test & Cleanup

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All PASS

**Step 2: Run web build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 3: Update FEATURES.md**

Add new feature items under a "WhatsApp Bot Enhancements" section.

**Step 4: Update RELEASE_NOTES.md**

Add release notes for:
- WhatsApp sender filtering (only known contacts processed)
- Coach/admin management commands via WhatsApp
- "(by OpenKick)" suffix on bot messages
- Customizable bot text templates in Settings

**Step 5: Commit**

Commit with message: "docs: update FEATURES and RELEASE_NOTES for WhatsApp bot enhancements"
