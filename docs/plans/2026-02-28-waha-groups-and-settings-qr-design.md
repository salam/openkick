# WAHA Group Support & Settings QR Code — Design

> Date: 2026-02-28

---

## Overview

Two features:

1. **WhatsApp group support** — allow the bot to process messages from WhatsApp groups (not just 1-on-1 DMs). React with eyes emoji, reply via private DM.
2. **QR code & connection status in settings** — show WAHA connection state, inline QR code for pairing, and a link to the WAHA dashboard directly in the settings page.

---

## Feature 1: WhatsApp Group Support

### Webhook Changes

The current webhook handler (`server/src/routes/whatsapp.ts`) ignores group messages (`@g.us`). The new behaviour:

1. When a message arrives from a `@g.us` chat ID, extract the `payload.author` field (the actual sender's phone number)
2. Look up the guardian by that phone number (same as the existing 1-on-1 flow)
3. **Unknown senders in groups are silently ignored** — no onboarding in groups (too noisy)
4. Parse the attendance message via LLM (same `parseAttendanceMessage` logic)
5. React to the group message with the eyes emoji via `PUT {wahaUrl}/api/reaction`:
   ```json
   { "messageId": "<payload.id>", "reaction": "👀", "session": "default" }
   ```
6. Send the confirmation as a **private DM** to the author's `@c.us` chat ID (not the group)

### Phone Extraction

Group messages have a different structure than 1-on-1:
- `payload.from` = `"120363xxxxx@g.us"` (the group ID)
- `payload.author` = `"41791234567@c.us"` (the actual sender)

New helper: `stripPhoneSuffix` must handle both `@c.us` and `@g.us`. For group messages, use `payload.author` instead of `payload.from`.

### Joining Groups

Two methods:

**Auto-detect (manual add):** The admin adds the bot's WhatsApp number to a group manually. When the bot receives a group message, it processes it. No extra setup needed.

**Invite link (via settings UI):** The admin pastes a `https://chat.whatsapp.com/...` link. The server calls:
```
POST {wahaUrl}/api/{session}/groups/join
Body: { "code": "<invite-link>" }
Response: { "id": "120363xxxxx@g.us" }
```

### New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/setup-waha/waha/groups` | List groups the bot is in (proxy to WAHA) |
| POST | `/api/setup-waha/waha/groups/join` | Join a group via invite link |
| POST | `/api/setup-waha/waha/groups/leave` | Leave a group by group ID |

All require admin auth.

### Database

Add `groupId` column to `message_log` (nullable TEXT) to track which group a message originated from. For 1-on-1 messages this remains NULL.

### Key Rules

- The bot **never sends text messages into the group** — only reacts with emoji
- Confirmations always go via private DM to the sender
- Unknown senders in groups are silently ignored (no onboarding)
- The `message_log` records the `groupId` for analytics

---

## Feature 2: QR Code & Connection Status in Settings

### Current State

`WahaConfigForm` only shows a URL input and a static green dot. The QR code is only available during initial setup (WAHA wizard at `/setup`).

### New WahaConfigForm Behaviour

The component polls `GET /api/setup-waha/waha/session` every 5 seconds and shows one of three states:

**Connected:**
- Green dot + "Connected as {pushName}"
- Link: "Open WAHA Dashboard" → `{waha_url}/dashboard` (new tab)
- WhatsApp Groups section (Feature 1) shown below

**QR Pending (status = `SCAN_QR_CODE`):**
- Amber dot + "Waiting for QR scan..."
- QR code image fetched from `GET /api/setup-waha/waha/qr`, auto-refreshed every 3s
- Instruction text: "Scan with WhatsApp to link this device."

**Disconnected / Not Running:**
- Red dot + error message
- If container exists but stopped: "Start WAHA" button (calls `POST /api/setup-waha/waha/start`)
- If container not found: message to run the setup wizard

### Layout

```
+-- WAHA Configuration --------------------------------+
|  WAHA URL: [http://localhost:3008          ]         |
|                                                      |
|  Status: * Connected as "Matthias"                   |
|  Open WAHA Dashboard ->                              |
|                                                      |
|  --- WhatsApp Groups --------------------------------|
|  FC Jugend Eltern              [Leave]               |
|  Turnier-Gruppe 2026           [Leave]               |
|                                                      |
|  Join group: [paste invite link...]  [Join]          |
+------------------------------------------------------+
```

When QR pending:

```
+-- WAHA Configuration --------------------------------+
|  WAHA URL: [http://localhost:3008          ]         |
|                                                      |
|  Status: * Waiting for QR scan...                    |
|  +----------------+                                  |
|  |   [QR CODE]    |  Scan with WhatsApp              |
|  |                |  to link this device.             |
|  +----------------+                                  |
+------------------------------------------------------+
```

### Reuse

The QR polling and session checking logic already exists in `waha-wizard.tsx` (`StepConnect`). Extract the shared logic or duplicate it in the settings component (it's small enough that duplication is fine).

---

## Files to Change

### Server

| File | Change |
|------|--------|
| `server/src/routes/whatsapp.ts` | Handle group messages: extract author, react with emoji, DM confirmation |
| `server/src/routes/setup-waha.ts` | Add `/waha/groups`, `/waha/groups/join`, `/waha/groups/leave` endpoints |
| `server/src/services/whatsapp.ts` | Add `reactToMessage(messageId, emoji)` function |
| `server/src/database.ts` | Add `groupId` column to `message_log` table |

### Web

| File | Change |
|------|--------|
| `web/src/components/settings/WahaConfigForm.tsx` | Add connection status polling, QR display, dashboard link, groups list + join/leave UI |

### Tests

| File | Change |
|------|--------|
| `server/src/routes/__tests__/whatsapp.webhook.test.ts` | Test group message handling: react + DM, unknown sender ignored |
| `server/src/services/__tests__/whatsapp.test.ts` | Test `reactToMessage` |
