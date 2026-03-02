# WhatsApp Bot: Sender Filtering, Coach Commands & Configurable Templates

**Date:** 2026-03-02

## Problem

WAHA currently processes messages from ALL incoming numbers. Unknown numbers trigger onboarding. There is no role-based command differentiation, and bot reply texts are hardcoded in translation files.

## Goals

1. Filter incoming messages — only process numbers present in `guardians` table
2. Support `fromMe` messages so the admin can test/use the bot
3. Add coach/admin management commands via WhatsApp
4. Append "(by OpenKick)" to every bot reply
5. Let admins customize all bot text templates via Settings UI with live preview
6. Make unknown-number onboarding a toggleable setting (default: off)

---

## Design

### 1. Sender Filtering

**Location:** `server/src/routes/whatsapp.ts` — top of webhook handler

**Logic:**
```
phone = strip @c.us from payload.from
guardian = SELECT * FROM guardians WHERE phone = ?
fromMe = payload.fromMe === true

if (!guardian && !fromMe) {
  if (getSetting('bot_allow_onboarding') === 'true') {
    → run existing onboarding flow
  } else {
    → silently ignore, return 200
  }
}
```

- All guardians (parent, coach, admin) with a phone in the DB can interact
- `fromMe` messages always processed (admin testing)
- New setting `bot_allow_onboarding` (default: `'false'`) controls onboarding of unknown numbers

### 2. "(by OpenKick)" Suffix

**Location:** `server/src/services/whatsapp.ts` — `sendMessage()` function

Append ` (by OpenKick)` to every outgoing message text before sending to WAHA API. Single point of change, applies to all bot replies universally.

### 3. Coach/Admin WhatsApp Commands

**Who:** Senders with `role = 'coach'` or `role = 'admin'` in the `guardians` table.

**Extended intent classification:**

| Natural language | Intent | Action |
|---|---|---|
| "Wer kommt?" / "Anwesenheit?" | `attendance_overview` | List confirmed/absent/pending for next event |
| "Aufstellung?" / "Matchsheet?" | `match_sheet` | Return lineup or training groups |
| "Training absagen" / "Spiel absagen" | `cancel_event` | Cancel next event, notify all guardians |
| "Erinnerung senden" | `send_reminder` | Trigger reminder for next event |
| "Max anwesend" / "Max abwesend" | `mark_attendance` | Manually set a player's attendance |
| Other management topics | `admin_link` | Reply with deep link to web portal |

**Implementation:**
- Extend `parseIntent()` system prompt with coach intents (only when sender role is coach/admin)
- Add handler functions for each coach intent in a new `server/src/services/whatsapp-coach.ts`
- For actions not feasible via WhatsApp, respond with the deep link URL

### 4. Configurable Bot Templates

**Storage:** `settings` table with keys prefixed `bot_template_`:
- `bot_template_whatsapp_help`
- `bot_template_whatsapp_confirm_attending`
- `bot_template_whatsapp_confirm_absent`
- `bot_template_whatsapp_confirm_waitlist`
- `bot_template_whatsapp_welcome`
- `bot_template_whatsapp_onboarding_ask_name`
- `bot_template_whatsapp_onboarding_ask_child`
- `bot_template_whatsapp_onboarding_ask_birthyear`
- `bot_template_whatsapp_onboarding_ask_consent`
- `bot_template_whatsapp_onboarding_no_match`
- `bot_template_whatsapp_onboarding_birthyear_mismatch`
- `bot_template_whatsapp_onboarding_consent_declined`
- `bot_template_whatsapp_onboarding_complete`
- `bot_template_whatsapp_disambiguate`
- `bot_template_whatsapp_reminder_with_link`
- Coach-specific templates (attendance overview, cancel confirmation, etc.)

**Resolution helper:**
```typescript
function getBotTemplate(key: string, vars: Record<string, string>): string {
  const custom = getSetting(`bot_template_${key}`);
  const template = custom || t(key);  // fall back to translation
  return interpolate(template, vars);
}
```

### 5. Settings UI — "Bot" Section

**Location:** New component `web/src/components/settings/BotSettingsForm.tsx`

**Layout:**
- Toggle: "Allow onboarding of unknown numbers" (`bot_allow_onboarding`)
- For each template:
  - Label with description
  - Textarea with the current/custom text
  - Placeholder hints: available variables (e.g., `{{playerName}}`, `{{eventTitle}}`, `{{eventDate}}`)
  - Live preview panel with sample data filled in
- "Reset to default" button per template

**API:** Uses existing `PUT /api/settings` endpoint for saving key-value pairs.

---

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `server/src/routes/whatsapp.ts` | Modify | Add sender filtering, role-based routing |
| `server/src/services/whatsapp.ts` | Modify | Add "(by OpenKick)" suffix to sendMessage |
| `server/src/services/whatsapp-coach.ts` | Create | Coach/admin command handlers |
| `server/src/services/whatsapp-templates.ts` | Create | `getBotTemplate()` helper |
| `server/src/routes/whatsapp.ts` | Modify | Use `getBotTemplate()` instead of hardcoded translations |
| `server/src/services/whatsapp-onboarding.ts` | Modify | Use `getBotTemplate()` for onboarding messages |
| `web/src/components/settings/BotSettingsForm.tsx` | Create | Settings UI for bot templates |
| `web/src/app/settings/page.tsx` | Modify | Add Bot section to settings page |
| `server/src/utils/translations/de.ts` | Modify | Add coach command response templates |
| `server/src/utils/translations/en.ts` | Modify | Add coach command response templates |

---

## Testing

- Webhook ignores unknown numbers when `bot_allow_onboarding` is `false`
- Webhook processes known guardian numbers
- Webhook processes `fromMe` messages
- Coach intents are parsed and routed correctly
- All outgoing messages end with ` (by OpenKick)`
- Custom templates override defaults
- Template variable interpolation works correctly
- Settings UI saves and loads templates
- Live preview renders with sample data
