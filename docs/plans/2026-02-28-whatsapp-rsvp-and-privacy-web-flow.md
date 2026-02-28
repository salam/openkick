# WhatsApp RSVP & Privacy Web Flow — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parents can confirm/decline attendance via WhatsApp chat, unknown numbers get onboarded, and a privacy-first web RSVP page supports both personalized deep links and anonymous name-search links.

**Architecture:** Stateful conversation engine (`whatsapp_sessions` table) routes messages through a deterministic state machine for onboarding and disambiguation, falling back to LLM intent classification for free-form messages. A dedicated `/rsvp` web page supports two modes: personalized (token-based) and anonymous (name-search + CAPTCHA).

**Tech Stack:** Express, sql.js, Vitest, Next.js, Altcha CAPTCHA, i18n via `server/src/utils/i18n.ts`

**Design doc:** `docs/plans/2026-02-28-whatsapp-rsvp-and-privacy-web-flow-design.md`

---

## Task 1: Database — Add 3 New Tables

**Files:**
- Modify: `server/src/database.ts` (the `SCHEMA` string, around line 9–211)

**Step 1: Write the failing test**

Create `server/src/services/__tests__/whatsapp-session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

describe("whatsapp_sessions table", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it("creates whatsapp_sessions table", () => {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name='whatsapp_sessions'");
    expect(tables[0]?.values).toHaveLength(1);
  });

  it("creates message_log table", () => {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name='message_log'");
    expect(tables[0]?.values).toHaveLength(1);
  });

  it("creates rsvp_tokens table", () => {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name='rsvp_tokens'");
    expect(tables[0]?.values).toHaveLength(1);
  });

  it("enforces unique phone on whatsapp_sessions", () => {
    db.run("INSERT INTO whatsapp_sessions (phone, state) VALUES ('123', 'idle')");
    expect(() =>
      db.run("INSERT INTO whatsapp_sessions (phone, state) VALUES ('123', 'idle')")
    ).toThrow();
  });

  it("enforces unique wahaMessageId on message_log", () => {
    db.run("INSERT INTO message_log (wahaMessageId, phone, direction, body) VALUES ('msg1', '123', 'in', 'hi')");
    expect(() =>
      db.run("INSERT INTO message_log (wahaMessageId, phone, direction, body) VALUES ('msg1', '456', 'in', 'hello')")
    ).toThrow();
  });

  it("enforces unique token on rsvp_tokens", () => {
    db.run("INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('tok1', 1, 1, '2099-01-01')");
    expect(() =>
      db.run("INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('tok1', 2, 2, '2099-01-01')")
    ).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-session.test.ts`
Expected: FAIL — tables don't exist yet

**Step 3: Add tables to SCHEMA in `server/src/database.ts`**

Add to the end of the `SCHEMA` template string (before the closing backtick):

```sql
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'idle',
  context TEXT DEFAULT '{}',
  wahaMessageId TEXT,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wahaMessageId TEXT UNIQUE,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'in',
  body TEXT,
  intent TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rsvp_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  playerId INTEGER NOT NULL REFERENCES players(id),
  eventId INTEGER NOT NULL REFERENCES events(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  expiresAt TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-session.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add server/src/database.ts server/src/services/__tests__/whatsapp-session.test.ts
git commit -m "feat(db): add whatsapp_sessions, message_log, rsvp_tokens tables"
```

---

## Task 2: WhatsApp Session Service — State Machine Core

**Files:**
- Create: `server/src/services/whatsapp-session.ts`
- Test: `server/src/services/__tests__/whatsapp-session.test.ts` (extend)

**Step 1: Write failing tests for session CRUD**

Append to `server/src/services/__tests__/whatsapp-session.test.ts`:

```ts
import {
  getOrCreateSession,
  updateSessionState,
  resetSession,
} from "../whatsapp-session.js";

describe("whatsapp-session service", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it("creates a new session for unknown phone", () => {
    const session = getOrCreateSession("491234567");
    expect(session.phone).toBe("491234567");
    expect(session.state).toBe("idle");
    expect(JSON.parse(session.context)).toEqual({});
  });

  it("returns existing session for known phone", () => {
    getOrCreateSession("491234567");
    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");
  });

  it("updates session state and context", () => {
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_name", { guardianName: null });
    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_name");
    expect(JSON.parse(session.context)).toEqual({ guardianName: null });
  });

  it("resets session to idle", () => {
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_name", {});
    resetSession("491234567");
    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-session.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `server/src/services/whatsapp-session.ts`**

```ts
import { getDB } from "../database.js";

export interface WhatsAppSession {
  id: number;
  phone: string;
  state: string;
  context: string; // JSON string
  wahaMessageId: string | null;
  updatedAt: string;
}

export type SessionState =
  | "idle"
  | "onboarding_name"
  | "onboarding_child"
  | "onboarding_birthyear"
  | "onboarding_consent"
  | "disambiguating_child";

export function getOrCreateSession(phone: string): WhatsAppSession {
  const db = getDB();
  const rows = db.exec("SELECT * FROM whatsapp_sessions WHERE phone = ?", [phone]);
  if (rows.length > 0 && rows[0].values.length > 0) {
    const cols = rows[0].columns;
    const vals = rows[0].values[0];
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = vals[i]));
    return obj as unknown as WhatsAppSession;
  }
  db.run(
    "INSERT INTO whatsapp_sessions (phone, state, context) VALUES (?, 'idle', '{}')",
    [phone],
  );
  return getOrCreateSession(phone);
}

export function updateSessionState(
  phone: string,
  state: SessionState,
  context: Record<string, unknown>,
): void {
  const db = getDB();
  db.run(
    "UPDATE whatsapp_sessions SET state = ?, context = ?, updatedAt = datetime('now') WHERE phone = ?",
    [state, JSON.stringify(context), phone],
  );
}

export function resetSession(phone: string): void {
  updateSessionState(phone, "idle", {});
}

export function isDuplicate(wahaMessageId: string): boolean {
  const db = getDB();
  const rows = db.exec(
    "SELECT id FROM message_log WHERE wahaMessageId = ?",
    [wahaMessageId],
  );
  return rows.length > 0 && rows[0].values.length > 0;
}

export function logMessage(
  wahaMessageId: string,
  phone: string,
  direction: "in" | "out",
  body: string,
  intent?: string,
): void {
  const db = getDB();
  db.run(
    "INSERT OR IGNORE INTO message_log (wahaMessageId, phone, direction, body, intent) VALUES (?, ?, ?, ?, ?)",
    [wahaMessageId, phone, direction, body, intent ?? null],
  );
}
```

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-session.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add server/src/services/whatsapp-session.ts server/src/services/__tests__/whatsapp-session.test.ts
git commit -m "feat(whatsapp): add session state machine service with dedup and logging"
```

---

## Task 3: i18n — Add WhatsApp Translation Keys

**Files:**
- Modify: `server/src/utils/translations/de.ts`
- Modify: `server/src/utils/translations/en.ts`

**Step 1: Write failing test**

Create `server/src/services/__tests__/whatsapp-i18n.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { t } from "../../utils/i18n.js";

describe("whatsapp i18n keys", () => {
  const keys = [
    "whatsapp_welcome",
    "whatsapp_onboarding_ask_name",
    "whatsapp_onboarding_ask_child",
    "whatsapp_onboarding_ask_birthyear",
    "whatsapp_onboarding_ask_consent",
    "whatsapp_onboarding_no_match",
    "whatsapp_onboarding_birthyear_mismatch",
    "whatsapp_onboarding_consent_declined",
    "whatsapp_onboarding_complete",
    "whatsapp_confirm_attending",
    "whatsapp_confirm_absent",
    "whatsapp_confirm_waitlist",
    "whatsapp_disambiguate",
    "whatsapp_help",
    "whatsapp_reminder_with_link",
  ];

  for (const key of keys) {
    it("has DE translation for " + key, () => {
      const result = t(key, "de");
      expect(result).not.toBe(key);
    });

    it("has EN translation for " + key, () => {
      const result = t(key, "en");
      expect(result).not.toBe(key);
    });
  }
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-i18n.test.ts`
Expected: FAIL — keys not found

**Step 3: Add translations to `de.ts` and `en.ts`**

Add to `server/src/utils/translations/de.ts`:

```ts
whatsapp_welcome: "Willkommen bei {{teamName}}!",
whatsapp_onboarding_ask_name: "Wie heisst du?",
whatsapp_onboarding_ask_child: "Wie heisst dein Kind, das im Team spielt?",
whatsapp_onboarding_ask_birthyear: "In welchem Jahr ist {{childName}} geboren?",
whatsapp_onboarding_ask_consent: "Duerfen wir deine Kontaktdaten speichern, um dich ueber Trainings und Spiele zu informieren? (Ja/Nein)",
whatsapp_onboarding_no_match: "Wir konnten kein Kind mit diesem Namen finden. Bitte kontaktiere den Trainer direkt.",
whatsapp_onboarding_birthyear_mismatch: "Das Geburtsjahr stimmt nicht ueberein. Bitte versuche es nochmal.",
whatsapp_onboarding_consent_declined: "Okay, wir speichern keine Daten. Du kannst dich jederzeit melden, wenn du es dir anders ueberlegst.",
whatsapp_onboarding_complete: "Alles klar! Du bist jetzt registriert als Elternteil von {{childName}}. Du kannst nun per Nachricht Ab- oder Zusagen senden.",
whatsapp_confirm_attending: "{{playerName}} ist fuer {{eventTitle}} am {{eventDate}} angemeldet.",
whatsapp_confirm_absent: "{{playerName}} ist fuer {{eventTitle}} am {{eventDate}} abgemeldet.",
whatsapp_confirm_waitlist: "{{playerName}} steht auf der Warteliste fuer {{eventTitle}} am {{eventDate}}.",
whatsapp_disambiguate: "Fuer welches Kind?\n{{options}}",
whatsapp_help: "Sende den Namen deines Kindes mit 'kommt' oder 'kommt nicht', z.B. 'Luca kommt' oder 'Luca ist krank'.",
whatsapp_reminder_with_link: "Erinnerung: {{eventTitle}} am {{eventDate}}. Bitte gib Bescheid!\n\nOnline antworten: {{url}}",
```

Add equivalent EN translations to `server/src/utils/translations/en.ts`:

```ts
whatsapp_welcome: "Welcome to {{teamName}}!",
whatsapp_onboarding_ask_name: "What's your name?",
whatsapp_onboarding_ask_child: "What's the name of your child who plays on the team?",
whatsapp_onboarding_ask_birthyear: "What year was {{childName}} born?",
whatsapp_onboarding_ask_consent: "May we store your contact details to inform you about trainings and matches? (Yes/No)",
whatsapp_onboarding_no_match: "We couldn't find a child with that name. Please contact the coach directly.",
whatsapp_onboarding_birthyear_mismatch: "The birth year doesn't match. Please try again.",
whatsapp_onboarding_consent_declined: "Okay, we won't store any data. Feel free to reach out if you change your mind.",
whatsapp_onboarding_complete: "All set! You're now registered as a parent of {{childName}}. You can send attendance messages anytime.",
whatsapp_confirm_attending: "{{playerName}} is confirmed for {{eventTitle}} on {{eventDate}}.",
whatsapp_confirm_absent: "{{playerName}} is absent for {{eventTitle}} on {{eventDate}}.",
whatsapp_confirm_waitlist: "{{playerName}} is on the waitlist for {{eventTitle}} on {{eventDate}}.",
whatsapp_disambiguate: "Which child?\n{{options}}",
whatsapp_help: "Send your child's name with 'attending' or 'absent', e.g. 'Luca is coming' or 'Luca is sick'.",
whatsapp_reminder_with_link: "Reminder: {{eventTitle}} on {{eventDate}}. Please respond!\n\nRespond online: {{url}}",
```

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-i18n.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add server/src/utils/translations/de.ts server/src/utils/translations/en.ts server/src/services/__tests__/whatsapp-i18n.test.ts
git commit -m "feat(i18n): add WhatsApp onboarding, confirmation and RSVP translation keys"
```

---

## Task 4: WhatsApp Onboarding Flow

**Files:**
- Create: `server/src/services/whatsapp-onboarding.ts`
- Test: `server/src/services/__tests__/whatsapp-onboarding.test.ts`

**Step 1: Write failing tests**

Create `server/src/services/__tests__/whatsapp-onboarding.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

vi.mock("../whatsapp.js", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

let db: Database;

function seedPlayer(name: string, birthYear: number) {
  db.run(
    "INSERT INTO players (name, birthYear, categoryId) VALUES (?, ?, 1)",
    [name, birthYear],
  );
}

describe("whatsapp onboarding", () => {
  beforeEach(async () => {
    db = await initDB();
    vi.mocked((await import("../whatsapp.js")).sendMessage).mockReset();
  });

  it("step 1: stores guardian name and advances to onboarding_child", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_name", {});

    await handleOnboarding("491234567", "Maria Mueller", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_child");
    expect(JSON.parse(session.context).guardianName).toBe("Maria Mueller");
  });

  it("step 2: matches child name and advances to onboarding_birthyear", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_child", { guardianName: "Maria" });

    await handleOnboarding("491234567", "Luca", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_birthyear");
    const ctx = JSON.parse(session.context);
    expect(ctx.childName).toBe("Luca Mueller");
  });

  it("step 2: no match resets to idle", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_child", { guardianName: "Maria" });

    await handleOnboarding("491234567", "Nonexistent", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");
  });

  it("step 3: correct birth year advances to onboarding_consent", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_birthyear", {
      guardianName: "Maria", childName: "Luca Mueller", playerId: 1,
    });

    await handleOnboarding("491234567", "2016", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_consent");
  });

  it("step 3: wrong birth year stays in onboarding_birthyear", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_birthyear", {
      guardianName: "Maria", childName: "Luca Mueller", playerId: 1, birthYearAttempts: 0,
    });

    await handleOnboarding("491234567", "2015", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_birthyear");
  });

  it("step 4: consent yes creates guardian and links to player", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_consent", {
      guardianName: "Maria Mueller", childName: "Luca Mueller", playerId: 1,
    });

    await handleOnboarding("491234567", "Ja", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");

    const guardians = db.exec("SELECT * FROM guardians WHERE phone = '491234567'");
    expect(guardians[0]?.values).toHaveLength(1);

    const links = db.exec("SELECT * FROM guardian_players WHERE playerId = 1");
    expect(links[0]?.values).toHaveLength(1);
  });

  it("step 4: consent no resets without creating guardian", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_consent", {
      guardianName: "Maria", childName: "Luca Mueller", playerId: 1,
    });

    await handleOnboarding("491234567", "Nein", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");

    const guardians = db.exec("SELECT * FROM guardians WHERE phone = '491234567'");
    expect(guardians).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-onboarding.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `server/src/services/whatsapp-onboarding.ts`**

This service handles each onboarding state. It reads the session, processes input, updates state, and sends the next prompt via `sendMessage()`. Use case-insensitive SQL `LIKE '%name%'` for child name matching.

Key logic:
- `onboarding_name`: store name in context, advance to `onboarding_child`
- `onboarding_child`: SQL `LIKE` match on `players.name`. If found, advance to `onboarding_birthyear` with `playerId` in context. If not found, send "no match" message and reset to `idle`
- `onboarding_birthyear`: compare input year to `players.birthYear`. If match, advance to `onboarding_consent`. If mismatch, increment `birthYearAttempts` in context (max 2, then reset to `idle`)
- `onboarding_consent`: if "ja"/"yes", create guardian row, link via `guardian_players`, set `consentGiven=1`, generate `accessToken`, reset to `idle`. If "nein"/"no", send decline message, reset to `idle`

Use `sendMessage()` for all outgoing messages. Use `t()` for all message text with `lang` parameter.

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-onboarding.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add server/src/services/whatsapp-onboarding.ts server/src/services/__tests__/whatsapp-onboarding.test.ts
git commit -m "feat(whatsapp): add 4-step onboarding flow for unknown phone numbers"
```

---

## Task 5: Enhanced Intent Classification

**Files:**
- Modify: `server/src/services/whatsapp.ts` — add `parseIntent()` alongside existing `parseAttendanceMessage()`
- Test: `server/src/services/__tests__/whatsapp.test.ts` (extend)

**Step 1: Write failing tests**

Append to `server/src/services/__tests__/whatsapp.test.ts`:

```ts
describe("parseIntent", () => {
  it("classifies 'Luca kommt' as attending with playerName", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify({ intent: "attending", playerName: "Luca", reason: null }),
      model: "test",
    });
    const { parseIntent } = await import("../whatsapp.js");
    const result = await parseIntent("Luca kommt");
    expect(result.intent).toBe("attending");
    expect(result.playerName).toBe("Luca");
  });

  it("classifies 'nicht dabei' as absent without playerName", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify({ intent: "absent", playerName: null, reason: null }),
      model: "test",
    });
    const { parseIntent } = await import("../whatsapp.js");
    const result = await parseIntent("nicht dabei");
    expect(result.intent).toBe("absent");
    expect(result.playerName).toBeNull();
  });

  it("classifies unrelated message as unknown", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify({ intent: "unknown", playerName: null, reason: null }),
      model: "test",
    });
    const { parseIntent } = await import("../whatsapp.js");
    const result = await parseIntent("Was gibt es zum Mittagessen?");
    expect(result.intent).toBe("unknown");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp.test.ts`
Expected: FAIL — `parseIntent` not exported

**Step 3: Add `parseIntent()` to `server/src/services/whatsapp.ts`**

```ts
export interface ParsedIntent {
  intent: "attending" | "absent" | "unknown";
  playerName: string | null;
  reason: string | null;
}

export async function parseIntent(text: string): Promise<ParsedIntent> {
  const response = await chatCompletion([
    {
      role: "system",
      content: `You are a football team attendance bot. Classify the parent's message.
Return JSON only: { "intent": "attending"|"absent"|"unknown", "playerName": string|null, "reason": string|null }
- "attending": the parent confirms their child will attend
- "absent": the parent reports their child cannot attend
- "unknown": the message is unrelated to attendance
Extract the child's name if mentioned. Extract the reason if given.`,
    },
    { role: "user", content: text },
  ]);
  try {
    return JSON.parse(response.content);
  } catch {
    return { intent: "unknown", playerName: null, reason: null };
  }
}
```

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add server/src/services/whatsapp.ts server/src/services/__tests__/whatsapp.test.ts
git commit -m "feat(whatsapp): add parseIntent() with attending/absent/unknown classification"
```

---

## Task 6: Refactor Webhook — Session-Based Router

**Files:**
- Modify: `server/src/routes/whatsapp.ts` — replace monolithic handler with session router
- Modify: `server/src/routes/__tests__/whatsapp.test.ts` — update tests

**Step 1: Write failing tests for new webhook behavior**

Replace/extend the tests in `server/src/routes/__tests__/whatsapp.test.ts` to cover:

1. **Deduplication**: sending the same `wahaMessageId` twice — second returns 200 but doesn't process
2. **Unknown sender starts onboarding**: message from unknown phone — session created with `onboarding_name` state, welcome message sent
3. **Known sender, single child, attendance**: message "kommt" from known guardian — `setAttendance()` called, confirmation sent
4. **Known sender, multi-child, no name, disambiguation**: guardian with 2 children sends "kommt" — disambiguation menu sent, session state = `disambiguating_child`
5. **Disambiguation reply**: guardian replies "1" when in `disambiguating_child` state — `setAttendance()` called for first child

Write these as separate `it()` blocks using the existing test patterns (seed helpers, mock `sendMessage`, mock `parseIntent`).

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/__tests__/whatsapp.test.ts`
Expected: FAIL

**Step 3: Refactor `server/src/routes/whatsapp.ts`**

Replace the handler body with the session-based router:

```ts
whatsappRouter.post("/webhook", async (req, res) => {
  // 1. Validate event type
  // 2. Extract phone, messageId, body text
  // 3. Dedup check via isDuplicate(messageId)
  // 4. Log message via logMessage()
  // 5. Handle audio transcription (existing logic)
  // 6. Get or create session
  // 7. If session.state !== 'idle' -> route to handler:
  //    - onboarding_* -> handleOnboarding(phone, text, lang)
  //    - disambiguating_child -> handleDisambiguation(phone, text)
  // 8. If no guardian found -> start onboarding
  // 9. If guardian found -> parseIntent(text)
  //    - attending/absent: if multi-child + no playerName -> disambiguate
  //    - else: setAttendance() + send confirmation
  //    - unknown: send help message
  // 10. React with eyes on group messages (existing)
  res.json({ success: true });
});
```

Import and use: `getOrCreateSession`, `updateSessionState`, `resetSession`, `isDuplicate`, `logMessage` from `whatsapp-session.js`; `handleOnboarding` from `whatsapp-onboarding.js`; `parseIntent` from `whatsapp.js`; `t` from `utils/i18n.js`.

**Step 4: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/whatsapp.test.ts`
Expected: ALL PASS

**Step 5: Run ALL tests to check for regressions**

Run: `cd server && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```
git add server/src/routes/whatsapp.ts server/src/routes/__tests__/whatsapp.test.ts
git commit -m "refactor(whatsapp): session-based webhook router with dedup, onboarding, disambiguation"
```

---

## Task 7: RSVP API — Backend Endpoints

**Files:**
- Create: `server/src/routes/rsvp.ts`
- Create: `server/src/routes/__tests__/rsvp.test.ts`
- Modify: `server/src/index.ts` — mount the route

**Step 1: Write failing tests**

Create `server/src/routes/__tests__/rsvp.test.ts`:

Test cases:
1. `GET /api/rsvp/resolve?token=X&event=Y` — valid token returns players + event info
2. `GET /api/rsvp/resolve` with invalid token — 404
3. `POST /api/rsvp/search` — valid name + captcha returns rsvpToken + initials
4. `POST /api/rsvp/search` — no match returns 404
5. `POST /api/rsvp/search` — missing captcha returns 400
6. `POST /api/rsvp/confirm` with accessToken — valid, calls setAttendance, returns finalStatus
7. `POST /api/rsvp/confirm` with rsvpToken — valid, calls setAttendance, returns finalStatus
8. `POST /api/rsvp/confirm` with expired rsvpToken — 403
9. `POST /api/rsvp/confirm` with used rsvpToken — 403

Use the existing test pattern: in-memory DB via `initDB()`, real Express server on random port, seed fixture data. For CAPTCHA, create the router with a mock `CaptchaProvider` that always returns `true`.

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/__tests__/rsvp.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `server/src/routes/rsvp.ts`**

```ts
import { Router } from "express";
import { getDB, getLastInsertId } from "../database.js";
import { setAttendance } from "../services/attendance.js";
import { randomBytes } from "crypto";
import type { CaptchaProvider } from "../middleware/captcha.js";

export function createRsvpRouter(captchaProvider: CaptchaProvider) {
  const router = Router();

  // GET /resolve?token=X&event=Y
  router.get("/resolve", (req, res) => {
    // Look up guardian by accessToken
    // Find linked players via guardian_players JOIN players
    // Find event by id
    // Return { players: [{ id, firstName }], event: { id, title, date } }
  });

  // POST /search — public + captcha
  router.post("/search", async (req, res) => {
    // Verify captcha via captchaProvider.verifySolution(req.body.captcha)
    // Fuzzy match name against players via SQL LIKE
    // Generate opaque rsvp_token via randomBytes(32).toString('hex')
    // Store in rsvp_tokens table (expires = now + 1 hour)
    // Return { rsvpToken, playerInitials, eventTitle, eventDate }
    // Initials: "Luca Mueller" -> "L. M."
  });

  // POST /confirm — accessToken or rsvpToken
  router.post("/confirm", (req, res) => {
    // If accessToken: resolve guardian, verify playerId belongs to them
    // If rsvpToken: look up in rsvp_tokens, check not expired/used, mark used=1
    // Call setAttendance(eventId, playerId, status, "web")
    // Return { finalStatus }
  });

  return router;
}
```

**Step 4: Mount in `server/src/index.ts`**

Add alongside existing route mounts:

```ts
import { createRsvpRouter } from "./routes/rsvp.js";
// ...
app.use("/api/rsvp", createRsvpRouter(captchaProvider));
```

**Step 5: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/rsvp.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```
git add server/src/routes/rsvp.ts server/src/routes/__tests__/rsvp.test.ts server/src/index.ts
git commit -m "feat(rsvp): add public RSVP API with resolve, search, and confirm endpoints"
```

---

## Task 8: RSVP Frontend — `/rsvp` Page

**Files:**
- Create: `web/src/app/rsvp/page.tsx` — server component shell
- Create: `web/src/app/rsvp/RsvpClient.tsx` — client component

**Step 1: Implement `/rsvp` page**

`web/src/app/rsvp/page.tsx`:
```tsx
import RsvpClient from "./RsvpClient";

export default function RsvpPage() {
  return <RsvpClient />;
}
```

`web/src/app/rsvp/RsvpClient.tsx` — Two modes based on URL params:

**Mode A** (`token` + `event` present):
1. Call `GET /api/rsvp/resolve?token=X&event=Y` using fetch (no auth header needed)
2. Show player name(s) and event info
3. Show Attend / Absent buttons
4. On click: `POST /api/rsvp/confirm` with `{ accessToken, playerId, eventId, status }`

**Mode B** (only `event` present):
1. Show name input field + `<AltchaWidget onVerify={...} />`
2. On submit: `POST /api/rsvp/search` with `{ name, eventId, captcha }`
3. If match: show initials + Attend / Absent buttons
4. On click: `POST /api/rsvp/confirm` with `{ rsvpToken, status }`

**States:** `loading` | `name_search` | `confirm` | `done` | `error`

**Design notes:**
- Reference `web/src/app/events/[id]/EventDetailClient.tsx` for styling patterns
- Mobile-first layout since parents open these from WhatsApp on phones
- Use the project's existing `AltchaWidget` component from `web/src/components/AltchaWidget.tsx`
- Use plain `fetch()` instead of `apiFetch()` since this is a public page (no auth token)

**Step 2: Test manually**

Start the dev servers and test both modes:
1. Create a guardian with `accessToken`, get the token from DB
2. Open `/rsvp?token=<token>&event=<eventId>` — verify personalized mode
3. Open `/rsvp?event=<eventId>` — verify name search mode

**Step 3: Commit**

```
git add web/src/app/rsvp/page.tsx web/src/app/rsvp/RsvpClient.tsx
git commit -m "feat(web): add public RSVP page with personalized and anonymous modes"
```

---

## Task 9: Deep Links in Reminders

**Files:**
- Modify: `server/src/services/reminders.ts` — include deep link URL
- Modify: `server/src/services/__tests__/reminders.test.ts` — update test

**Step 1: Write failing test**

Add to `server/src/services/__tests__/reminders.test.ts`:

```ts
it("includes deep link URL in reminder message", async () => {
  // Seed guardian with accessToken, player, future event within 24h
  // Call sendReminders()
  // Assert sendMessage was called with a message containing the accessToken URL
  const call = vi.mocked(sendMessage).mock.calls[0];
  expect(call[1]).toContain("/rsvp?token=");
  expect(call[1]).toContain("&event=");
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/reminders.test.ts`
Expected: FAIL

**Step 3: Modify `reminders.ts`**

In the `sendReminders()` function, when composing the message, use the new `whatsapp_reminder_with_link` i18n key. Read `base_url` from settings table. Pass `url` param with the guardian's `accessToken`:

```ts
const baseUrl = /* read from settings or fallback */;
const url = `${baseUrl}/rsvp?token=${guardian.accessToken}&event=${event.id}`;
const message = t("whatsapp_reminder_with_link", guardian.language, {
  eventTitle: event.title,
  eventDate: event.date,
  url,
});
```

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/reminders.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add server/src/services/reminders.ts server/src/services/__tests__/reminders.test.ts
git commit -m "feat(reminders): include personalized RSVP deep link in WhatsApp reminders"
```

---

## Task 10: Integration Testing & Final Verification

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `cd server && npx vitest run`
Expected: ALL PASS

**Step 2: Run linter/typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run web build**

Run: `cd web && npm run build`
Expected: Build succeeds

**Step 4: Update FEATURES.md**

Add checkmarks for completed items under PRD 4.5.1:
- [x] WhatsApp RSVP: parents confirm/decline attendance via chat message
- [x] Name-entry-first web flow (privacy mode for anonymous RSVP links)
- [x] WhatsApp onboarding for unknown numbers (4-step conversation)
- [x] Message deduplication
- [x] Multi-child disambiguation
- [x] Personalized deep links in reminders

**Step 5: Update RELEASE_NOTES.md**

Add a new section with user-facing bullet points.

**Step 6: Commit**

```
git add FEATURES.md RELEASE_NOTES.md
git commit -m "docs: update features and release notes for WhatsApp RSVP & privacy web flow"
```

---

## Task Summary

| # | Task | New/Modified Files | Focus |
|---|------|--------------------|-------|
| 1 | Database tables | database.ts + test | 3 new tables |
| 2 | Session service | whatsapp-session.ts + test | State machine core |
| 3 | i18n keys | de.ts, en.ts + test | 15 translation keys |
| 4 | Onboarding flow | whatsapp-onboarding.ts + test | 4-step conversation |
| 5 | Intent classification | whatsapp.ts + test | parseIntent() |
| 6 | Webhook refactor | whatsapp route + test | Session-based router |
| 7 | RSVP API | rsvp.ts + test + index.ts | 3 endpoints |
| 8 | RSVP frontend | page.tsx + RsvpClient.tsx | Public /rsvp page |
| 9 | Deep links | reminders.ts + test | Personalized URLs |
| 10 | Integration & docs | full suite + FEATURES + RELEASE_NOTES | Verification |
