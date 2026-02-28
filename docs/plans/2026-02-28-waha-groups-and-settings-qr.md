# WAHA Group Support & Settings QR Code — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the WhatsApp bot to process group messages (react with eyes emoji + DM confirmation) and show live connection status, QR code, and group management in the settings page.

**Architecture:** The webhook handler gains a group-message branch that extracts the author phone from `payload.author`, reacts via `PUT /api/reaction`, and DMs the sender. The `WahaConfigForm` component polls session status and renders QR / connected / disconnected states with a groups list and join-by-invite-link UI. Three new server endpoints proxy WAHA group APIs.

**Tech Stack:** Express, sql.js, vitest, React (Next.js), WAHA REST API, Tailwind CSS

---

## Task 1: Add `reactToMessage` to WhatsApp service

**Files:**
- Modify: `server/src/services/whatsapp.ts`
- Test: `server/src/services/__tests__/whatsapp.test.ts`

**Step 1: Write the failing test**

Add to `server/src/services/__tests__/whatsapp.test.ts` inside the existing `describe("whatsapp service", ...)`:

```typescript
describe("reactToMessage", () => {
  it("calls WAHA PUT /api/reaction with correct payload", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { reactToMessage } = await import("../whatsapp.js");
    await reactToMessage("false_41791234567@c.us_AAAAAA", "👀");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3008/api/reaction");
    expect(options.method).toBe("PUT");

    const body = JSON.parse(options.body);
    expect(body.messageId).toBe("false_41791234567@c.us_AAAAAA");
    expect(body.reaction).toBe("👀");
    expect(body.session).toBe("default");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp.test.ts --reporter=verbose`
Expected: FAIL — `reactToMessage` is not exported

**Step 3: Write minimal implementation**

Add to `server/src/services/whatsapp.ts`:

```typescript
export async function reactToMessage(
  messageId: string,
  reaction: string,
): Promise<void> {
  const db = getDB();
  const result = db.exec(
    "SELECT value FROM settings WHERE key = 'waha_url'",
  );
  const wahaUrl =
    (result[0]?.values[0]?.[0] as string) || "http://localhost:3008";

  await fetch(`${wahaUrl}/api/reaction`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageId,
      reaction,
      session: "default",
    }),
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/whatsapp.ts server/src/services/__tests__/whatsapp.test.ts && git commit -m "feat(whatsapp): add reactToMessage for emoji reactions via WAHA" -- server/src/services/whatsapp.ts server/src/services/__tests__/whatsapp.test.ts
```

---

## Task 2: Handle group messages in webhook

**Files:**
- Modify: `server/src/routes/whatsapp.ts`
- Test: `server/src/routes/__tests__/whatsapp.test.ts`

**Step 1: Write the failing tests**

Update the mock at the top of `server/src/routes/__tests__/whatsapp.test.ts` to include `reactToMessage`:

```typescript
vi.mock("../../services/whatsapp.js", () => ({
  parseAttendanceMessage: vi.fn(),
  sendMessage: vi.fn(),
  reactToMessage: vi.fn(),
}));
```

Add these test cases inside the existing `describe("WhatsApp webhook route", ...)`:

```typescript
it("processes group message: reacts with eyes emoji and DMs sender", async () => {
  const phone = "41791234570";
  seedGuardianAndPlayer(phone, "Mia");
  seedFutureEvent("Training Donnerstag");

  const { parseAttendanceMessage, sendMessage, reactToMessage } = await import(
    "../../services/whatsapp.js"
  );
  vi.mocked(parseAttendanceMessage).mockResolvedValueOnce({
    playerName: "Mia",
    status: "absent",
    reason: "Ferien",
  });
  vi.mocked(reactToMessage).mockResolvedValueOnce(undefined);

  const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "message",
      payload: {
        id: "false_120363xxxxx@g.us_AAAAAA",
        from: "120363xxxxx@g.us",
        author: `${phone}@c.us`,
        body: "Mia hat Ferien",
        hasMedia: false,
        isGroupMsg: true,
      },
    }),
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");

  // Reacted with eyes emoji on the group message
  expect(vi.mocked(reactToMessage)).toHaveBeenCalledWith(
    "false_120363xxxxx@g.us_AAAAAA",
    "👀",
  );

  // DM sent to sender's personal chat, NOT the group
  expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
    phone,
    expect.stringContaining("Mia"),
  );
});

it("ignores group message from unknown sender without error", async () => {
  const { parseAttendanceMessage, sendMessage, reactToMessage } = await import(
    "../../services/whatsapp.js"
  );

  const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "message",
      payload: {
        id: "false_120363xxxxx@g.us_BBBBBB",
        from: "120363xxxxx@g.us",
        author: "99999999999@c.us",
        body: "random message",
        hasMedia: false,
        isGroupMsg: true,
      },
    }),
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("unknown_sender");

  expect(vi.mocked(parseAttendanceMessage)).not.toHaveBeenCalled();
  expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  expect(vi.mocked(reactToMessage)).not.toHaveBeenCalled();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/__tests__/whatsapp.test.ts --reporter=verbose`
Expected: FAIL — group messages currently return `unknown_sender` and no `reactToMessage`

**Step 3: Update the webhook handler**

Modify `server/src/routes/whatsapp.ts`:

1. Import `reactToMessage`:
```typescript
import {
  parseAttendanceMessage,
  sendMessage,
  reactToMessage,
} from "../services/whatsapp.js";
```

2. Update the `WAHAWebhookPayload` interface to include group fields:
```typescript
interface WAHAWebhookPayload {
  event: string;
  payload: {
    id: string;
    from: string;
    author?: string;       // sender in group context
    body: string;
    hasMedia: boolean;
    isGroupMsg?: boolean;
    media?: {
      data: string;
      mimetype: string;
      filename?: string;
    };
  };
}
```

3. Replace the phone extraction logic (lines ~80) with group-aware logic:
```typescript
const isGroup = body.payload.from.endsWith("@g.us") || body.payload.isGroupMsg === true;
const senderChatId = isGroup ? body.payload.author : body.payload.from;

if (!senderChatId) {
  res.status(200).json({ status: "ignored" });
  return;
}

const phone = senderChatId.replace(/@c\.us$/, "");
```

4. After the confirmation `sendMessage` call (around line 151), add the group reaction:
```typescript
// If group message, react with eyes emoji
if (isGroup && body.payload.id) {
  reactToMessage(body.payload.id, "👀").catch(() => {
    // Best-effort reaction, don't fail the webhook
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/routes/__tests__/whatsapp.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/routes/whatsapp.ts server/src/routes/__tests__/whatsapp.test.ts && git commit -m "feat(whatsapp): handle group messages with emoji reaction and DM reply" -- server/src/routes/whatsapp.ts server/src/routes/__tests__/whatsapp.test.ts
```

---

## Task 3: Add group management endpoints to setup-waha

**Files:**
- Modify: `server/src/routes/setup-waha.ts`

**Step 1: Add three new endpoints**

Append to `server/src/routes/setup-waha.ts`:

```typescript
// ── GET /waha/groups ──────────────────────────────────────────────

setupWahaRouter.get("/waha/groups", async (_req: Request, res: Response) => {
  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(`${wahaUrl}/api/default/groups`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: text || `WAHA responded with ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── POST /waha/groups/join ────────────────────────────────────────

setupWahaRouter.post("/waha/groups/join", async (req: Request, res: Response) => {
  const { inviteLink } = req.body;

  if (!inviteLink || typeof inviteLink !== "string") {
    res.status(400).json({ error: "inviteLink is required" });
    return;
  }

  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(`${wahaUrl}/api/default/groups/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: inviteLink }),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: text || `WAHA responded with ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── POST /waha/groups/leave ───────────────────────────────────────

setupWahaRouter.post("/waha/groups/leave", async (req: Request, res: Response) => {
  const { groupId } = req.body;

  if (!groupId || typeof groupId !== "string") {
    res.status(400).json({ error: "groupId is required" });
    return;
  }

  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(
      `${wahaUrl}/api/default/groups/${encodeURIComponent(groupId)}/leave`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: text || `WAHA responded with ${upstream.status}` });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});
```

**Step 2: Verify compilation**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add server/src/routes/setup-waha.ts && git commit -m "feat(waha): add group list, join, and leave proxy endpoints" -- server/src/routes/setup-waha.ts
```

---

## Task 4: Rewrite WahaConfigForm with connection status, QR code, and groups

**Files:**
- Modify: `web/src/components/settings/WahaConfigForm.tsx`

**Step 1: Rewrite the component**

Replace the entire content of `web/src/components/settings/WahaConfigForm.tsx`. The new component:

- Polls `GET /api/setup-waha/waha/session` every 5 seconds
- Shows one of 4 states: checking, connected, qr_pending, disconnected
- When connected: shows push name, dashboard link, and groups list with join/leave
- When QR pending: shows QR code image fetched from `/api/setup-waha/waha/qr`
- Groups section: lists groups, has invite link input + Join button, Leave per group

Key imports:
```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import type { SettingsFormProps } from './ClubProfileForm';
```

Types:
```tsx
type ConnectionStatus = 'connected' | 'qr_pending' | 'disconnected' | 'checking';

interface WahaGroup {
  id: string;
  name?: string;
  subject?: string;
}
```

The component uses `apiFetch` for JSON endpoints and raw `fetch` for the QR image (binary PNG). QR blob URLs are revoked on cleanup.

Status indicator uses colored dots:
- `connected` = emerald-500
- `qr_pending` = amber-500
- `checking` = gray-400 animate-pulse
- `disconnected` = red-500

**Step 2: Verify the web app compiles**

Run: `cd web && npx next build --no-lint`
Expected: Build succeeds

**Step 3: Commit**

```bash
git restore --staged :/ && git add web/src/components/settings/WahaConfigForm.tsx && git commit -m "feat(settings): add live connection status, QR code, and group management to WAHA config" -- web/src/components/settings/WahaConfigForm.tsx
```

---

## Task 5: Full test run and lint check

**Step 1: Run all server tests**

Run: `cd server && npx vitest run --reporter=verbose`
Expected: ALL PASS

**Step 2: Run linter**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Check web build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Manual smoke test (if WAHA is running)**

1. Open settings page — verify the WAHA card shows connection status
2. If connected: verify "Open WAHA Dashboard" link works
3. If QR pending: verify QR image renders and refreshes
4. Send a message from a known guardian phone in a WhatsApp group the bot is in — verify eyes emoji reaction appears and DM is received

---

## Summary of all changes

| Area | File | Change |
|------|------|--------|
| Server | `server/src/services/whatsapp.ts` | Add `reactToMessage()` |
| Server | `server/src/services/__tests__/whatsapp.test.ts` | Test for `reactToMessage` |
| Server | `server/src/routes/whatsapp.ts` | Group message handling: extract author, react, DM |
| Server | `server/src/routes/__tests__/whatsapp.test.ts` | Tests for group message handling |
| Server | `server/src/routes/setup-waha.ts` | Add `/waha/groups`, `/waha/groups/join`, `/waha/groups/leave` |
| Web | `web/src/components/settings/WahaConfigForm.tsx` | Full rewrite: status polling, QR, groups UI |
