# WhatsApp Bot Module -- Implementation Blueprint

> Target audience: LLM implementing this feature.
> Last updated: 2026-02-28.

---

## 1. Module Overview

The WhatsApp bot module connects OpenKick to parents via WhatsApp. It receives free-form messages (text and voice notes), extracts intent using an LLM, and performs actions like recording absences or confirming attendance -- without requiring parents to install an app or visit a website.

### PRD Sections Covered

| Section | Title | What This Module Handles |
|---------|-------|--------------------------|
| 4.5.1 | Attendance Management | Parse free-form WhatsApp messages ("Luca is sick"), update attendance status, provide numbered-menu responses |
| 4.5.3 | Communication and Notifications | Send confirmation messages after each action, event reminders before deadlines, coach broadcasts |
| 4.5.4 | Onboarding and User Management | First-message onboarding flow for unknown numbers, name/child collection, QR-code-based system join |

### Existing Code Being Replaced

The current implementation lives in two files that handle a simplified version of this flow:

- `server/src/services/whatsapp.ts` -- basic `sendMessage()` and `parseAttendanceMessage()`. Will be **split** into `waha.service.ts`, `message-parser.service.ts`, and `whatsapp-sender.service.ts`.
- `server/src/routes/whatsapp.ts` -- webhook handler and guardian lookup. Will be **moved** to `routes/webhooks/waha.webhook.ts` and expanded.

**Do not delete the old files until the new ones are tested and working. Migrate incrementally.**

---

## 2. Dependencies

### npm Packages

Already in the project -- no new installs needed:

- `express` -- Web framework
- `sql.js` -- SQLite database
- `vitest` -- Testing

No new npm packages are required for WAHA integration. WAHA is a Docker container exposing a REST API. All HTTP calls use the built-in `fetch()` API (Node 18+).

### External Services

| Service | How It Runs | Notes |
|---------|-------------|-------|
| WAHA | Docker container (`devlikeapro/waha`) | Self-hosted WhatsApp HTTP API. No npm package. Communicate via REST. See section 6 for Docker config. |
| LLM (OpenAI / Claude / Euria) | Remote API | Already configured via `server/src/services/llm.ts`. Reuse the existing `chatCompletion()` function. |

---

## 3. File Structure

All files go under `server/src/`. The existing project uses flat directories for routes and services.

```
server/src/
  services/
    waha.service.ts              # WAHA REST API client (low-level HTTP)
    message-parser.service.ts    # LLM-based intent + entity extraction
    whatsapp-sender.service.ts   # High-level send: text menus, images, PDFs, rate-limited queue
  routes/
    webhooks/
      waha.webhook.ts            # POST /api/webhooks/waha -- incoming message handler
  __tests__/
    waha.service.test.ts
    message-parser.service.test.ts
    whatsapp-sender.service.test.ts
    waha.webhook.test.ts
```

### File Responsibilities

#### `waha.service.ts` -- WAHA REST Client

Thin wrapper around WAHA's HTTP endpoints. Every method maps 1:1 to a WAHA endpoint. No business logic here.

```typescript
import { getDB } from "../database.js";

export interface WahaConfig {
  baseUrl: string;   // e.g. "http://localhost:3008"
  apiKey?: string;    // X-Api-Key header value
  session: string;    // usually "default"
}

export interface WahaSendTextParams {
  chatId: string;     // "41791234567@c.us"
  text: string;
  session?: string;
}

export interface WahaSendImageParams {
  chatId: string;
  file: { url: string; mimetype: string };
  caption?: string;
  session?: string;
}

export interface WahaSendFileParams {
  chatId: string;
  file: { url: string; mimetype: string; filename: string };
  caption?: string;
  session?: string;
}

export interface WahaSessionStatus {
  name: string;
  status: "SCAN_QR_CODE" | "WORKING" | "FAILED" | "STOPPED";
}

export interface WahaWebhookPayload {
  event: "message" | "message.ack" | "session.status";
  session: string;
  payload: {
    id: string;
    from: string;          // "41791234567@c.us"
    to?: string;
    body: string;
    hasMedia: boolean;
    fromMe: boolean;
    timestamp: number;
    media?: {
      url?: string;
      mimetype: string;
      data?: string;       // base64 (if WAHA returns inline)
      filename?: string;
    };
    // Group chat fields
    isGroupMsg?: boolean;
    author?: string;       // sender in group context
  };
}

export class WahaService {
  private config: WahaConfig;

  constructor(config: WahaConfig) {
    this.config = config;
  }

  /** Load config from the settings table. */
  static fromSettings(): WahaService {
    const db = getDB();
    const result = db.exec(
      "SELECT key, value FROM settings WHERE key IN ('waha_url', 'waha_api_key')"
    );
    const settings: Record<string, string> = {};
    if (result.length > 0) {
      for (const row of result[0].values) {
        settings[row[0] as string] = row[1] as string;
      }
    }
    return new WahaService({
      baseUrl: settings["waha_url"] || "http://localhost:3008",
      apiKey: settings["waha_api_key"],
      session: "default",
    });
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      h["X-Api-Key"] = this.config.apiKey;
    }
    return h;
  }

  async sendText(params: WahaSendTextParams): Promise<void> {
    // POST /api/sendText
  }

  async sendImage(params: WahaSendImageParams): Promise<void> {
    // POST /api/sendImage
  }

  async sendFile(params: WahaSendFileParams): Promise<void> {
    // POST /api/sendFile
  }

  async getSessionStatus(): Promise<WahaSessionStatus> {
    // GET /api/sessions/{session}
  }

  async getQrCode(): Promise<Buffer> {
    // GET /api/sessions/{session}/auth/qr, responseType arraybuffer
  }

  async startSession(): Promise<void> {
    // POST /api/sessions/start
  }
}
```

#### `message-parser.service.ts` -- Intent and Entity Extraction

Uses the existing `chatCompletion()` from `llm.ts`. Returns structured data, never raw LLM output to the caller.

```typescript
import { chatCompletion } from "./llm.js";

/** All recognized intents. */
export type MessageIntent =
  | "report_absence"
  | "confirm_attendance"
  | "register_tournament"
  | "ask_schedule"
  | "unknown";

export interface ParsedMessage {
  intent: MessageIntent;
  playerName: string | null;    // extracted player name, if mentioned
  reason: string | null;        // "sick", "holiday", "injured", etc.
  date: string | null;          // ISO date string if a specific date was mentioned
  confidence: number;           // 0.0-1.0, from the LLM's self-assessment
  rawResponse: string;          // for debugging / logging
}

/**
 * Send a free-form message to the LLM for intent classification
 * and entity extraction (named-entity recognition / NER).
 *
 * The system prompt instructs the LLM to respond with JSON only.
 * The prompt includes the parent's known children names so the LLM
 * can match partial names (e.g. "Luca" -> "Luca Meier").
 */
export async function parseMessage(
  text: string,
  knownPlayerNames: string[],
  language: string,
): Promise<ParsedMessage> {
  const systemPrompt = `You are a message parser for a youth football club attendance system.
Given a WhatsApp message from a parent, extract:
1. intent: one of "report_absence", "confirm_attendance", "register_tournament", "ask_schedule", "unknown"
2. playerName: the child's name if mentioned (match against known names: ${knownPlayerNames.join(", ") || "none"})
3. reason: why they are absent (if applicable)
4. date: specific date mentioned (ISO format YYYY-MM-DD), or null for "next event"
5. confidence: your confidence in the classification (0.0 to 1.0)

The parent's language is ${language}. Messages may be in German, French, or English.

Respond with JSON only. No explanation. Schema:
{"intent":"...","playerName":"...","reason":"...","date":"...","confidence":0.0}`;

  const response = await chatCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ]);

  const parsed = JSON.parse(response.content);
  return { ...parsed, rawResponse: response.content };
}
```

#### `whatsapp-sender.service.ts` -- Outbound Messages with Queue

Wraps `WahaService` with rate limiting (message queue) and high-level sending patterns (numbered menus, confirmations).

```typescript
import { WahaService } from "./waha.service.js";

export interface QueuedMessage {
  chatId: string;
  type: "text" | "image" | "file";
  payload: Record<string, unknown>;
  addedAt: number;
}

export class WhatsAppSender {
  private waha: WahaService;
  private queue: QueuedMessage[] = [];
  private processing: boolean = false;
  private minDelayMs: number = 3000; // 3 seconds between sends

  constructor(waha: WahaService) {
    this.waha = waha;
  }

  /**
   * Send a numbered text menu. Use this instead of buttons --
   * WhatsApp restricts button rendering from unofficial APIs.
   *
   * Example output:
   *   What would you like to do?
   *   1. Report absence
   *   2. Confirm attendance
   *   3. Check schedule
   *
   *   Reply with the number.
   */
  async sendMenu(
    chatId: string,
    title: string,
    options: string[],
  ): Promise<void> {
    const numbered = options
      .map((opt, i) => `${i + 1}. ${opt}`)
      .join("\n");
    const text = `${title}\n${numbered}\n\nReply with the number.`;
    this.enqueue({
      chatId,
      type: "text",
      payload: { text },
      addedAt: Date.now(),
    });
  }

  async sendConfirmation(
    chatId: string,
    message: string,
  ): Promise<void> {
    this.enqueue({
      chatId,
      type: "text",
      payload: { text: message },
      addedAt: Date.now(),
    });
  }

  async sendImage(
    chatId: string,
    url: string,
    mimetype: string,
    caption?: string,
  ): Promise<void> {
    this.enqueue({
      chatId,
      type: "image",
      payload: { url, mimetype, caption },
      addedAt: Date.now(),
    });
  }

  async sendPdf(
    chatId: string,
    url: string,
    filename: string,
    caption?: string,
  ): Promise<void> {
    this.enqueue({
      chatId,
      type: "file",
      payload: {
        url,
        mimetype: "application/pdf",
        filename,
        caption,
      },
      addedAt: Date.now(),
    });
  }

  /** Add to the rate-limited queue and start processing if idle. */
  private enqueue(msg: QueuedMessage): void {
    // push to this.queue, then trigger processQueue()
  }

  /** Drain the queue with a minimum delay between each send. */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      await this.dispatch(msg);
      if (this.queue.length > 0) {
        await this.delay(this.minDelayMs);
      }
    }
    this.processing = false;
  }

  private async dispatch(msg: QueuedMessage): Promise<void> {
    // switch on msg.type, call this.waha.sendText / sendImage / sendFile
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
```

#### `routes/webhooks/waha.webhook.ts` -- Incoming Message Handler

```typescript
import { Router, type Request, type Response } from "express";

export const wahaWebhookRouter = Router();

// POST /api/webhooks/waha
wahaWebhookRouter.post(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    // 1. Validate payload structure
    // 2. Ignore fromMe messages (echo prevention)
    // 3. Ignore group messages (see edge cases)
    // 4. Strip phone suffix: "41791234567@c.us" -> "41791234567"
    // 5. Look up guardian by phone
    // 6. If unknown number -> trigger onboarding flow (section 10)
    // 7. If known guardian:
    //    a. Handle voice notes: transcribe via whisper.ts, then parse
    //    b. Parse text via message-parser.service.ts
    //    c. Route by intent (see intent routing table below)
    // 8. Log message to message_log table
    // 9. Respond 200 immediately (WAHA will retry on non-200)
  },
);
```

### Route Registration

In `server/src/index.ts`, add:

```typescript
import { wahaWebhookRouter } from "./routes/webhooks/waha.webhook.js";

// Register BEFORE express.json() if you need raw body for signature verification.
// For WAHA webhooks, JSON parsing is fine.
app.use("/api/webhooks/waha", wahaWebhookRouter);
```

Also expose QR code proxy and admin send endpoints. These can live in the existing `routes/whatsapp.ts` or a new file -- implementer's choice. Recommended: keep them in `routes/whatsapp.ts` and import the new services.

---

## 4. Database Schema

Add these tables to the `SCHEMA` constant in `server/src/database.ts`.

```sql
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionName TEXT NOT NULL DEFAULT 'default',
  phoneNumber TEXT,               -- the WhatsApp number paired to this session
  status TEXT NOT NULL DEFAULT 'disconnected',  -- 'connected', 'disconnected', 'qr_pending'
  lastConnectedAt TEXT,
  lastDisconnectedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL,        -- 'inbound' or 'outbound'
  chatId TEXT NOT NULL,           -- "41791234567@c.us"
  phone TEXT NOT NULL,            -- "41791234567" (stripped)
  guardianId INTEGER REFERENCES guardians(id),
  messageBody TEXT,               -- original message text (or transcription for voice)
  mediaType TEXT,                 -- 'text', 'audio', 'image', null
  parsedIntent TEXT,              -- 'report_absence', 'confirm_attendance', etc.
  parsedEntities TEXT,            -- JSON: {"playerName":"Luca","reason":"sick","date":null}
  confidence REAL,                -- LLM confidence score
  actionTaken TEXT,               -- short description: "marked_absent", "sent_menu", etc.
  errorMessage TEXT,              -- if processing failed
  wahaMessageId TEXT,             -- WAHA's message ID for deduplication
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_message_log_phone ON message_log(phone);
CREATE INDEX IF NOT EXISTS idx_message_log_created ON message_log(createdAt);
CREATE INDEX IF NOT EXISTS idx_message_log_waha_id ON message_log(wahaMessageId);
```

### Migration Strategy

Since the project uses sql.js with `CREATE TABLE IF NOT EXISTS`, simply append the new DDL statements to the existing `SCHEMA` string. Existing databases will get the new tables on next startup.

---

## 5. API Endpoints

### 5.1 Webhook -- `POST /api/webhooks/waha`

Receives all WAHA webhook events. WAHA is configured to send events here via `WHATSAPP_HOOK_URL`.

| Field | Value |
|-------|-------|
| Auth | None (WAHA sends from same Docker network). Optionally validate `X-Api-Key` header if WAHA is configured with one. |
| Content-Type | `application/json` |
| Response | Always `200 OK` with `{ "status": "ok" }`. Non-200 causes WAHA retries. |

Request body: See `WahaWebhookPayload` interface in section 3.

### 5.2 QR Code Proxy -- `GET /api/whatsapp/qr`

Proxies the QR code image from WAHA so the admin dashboard can display it without exposing the WAHA port.

```typescript
// GET /api/whatsapp/qr
whatsappRouter.get("/qr", async (req, res) => {
  // 1. Require admin auth
  // 2. Call waha.getQrCode()
  // 3. Return PNG buffer with Content-Type: image/png
  // 4. If session is already WORKING, return 200 with { "status": "connected" }
});
```

### 5.3 Admin Send -- `POST /api/whatsapp/send`

Allows coaches/admins to send a message to a specific phone number from the dashboard.

```typescript
interface AdminSendRequest {
  phone: string;     // "41791234567" -- without @c.us suffix
  message: string;
}
```

| Field | Value |
|-------|-------|
| Auth | Admin or coach role required |
| Response | `201` on success, `400` if phone/message missing, `503` if WhatsApp session not connected |

### 5.4 Session Status -- `GET /api/whatsapp/status`

Returns the current WAHA session status and connection info. Useful for the admin dashboard to show a green/red indicator.

```typescript
interface SessionStatusResponse {
  status: "connected" | "disconnected" | "qr_pending";
  phoneNumber: string | null;
  lastConnectedAt: string | null;
}
```

---

## 6. WAHA Docker Config

WAHA runs as a sibling container in the same Docker Compose network as the Express server.

### docker-compose.yml Addition

```yaml
waha:
  image: devlikeapro/waha
  container_name: openkick-waha
  ports:
    - "${WAHA_PORT:-3008}:3000"         # expose for local dev; in prod, keep internal only
  environment:
    WHATSAPP_API_KEY: "${WAHA_API_KEY}"
    WHATSAPP_HOOK_URL: "http://web:${PORT:-3001}/api/webhooks/waha"
    WHATSAPP_HOOK_EVENTS: "message,message.ack,session.status"
    WHATSAPP_DEFAULT_ENGINE: "WEBJS"    # most stable engine for unofficial API
    WHATSAPP_RESTART_ALL_SESSIONS: "true"
    WHATSAPP_START_SESSION: "default"
    WHATSAPP_FILES_MIMETYPES: "image/jpeg,image/png,application/pdf,audio/ogg"
    WHATSAPP_FILES_LIFETIME: "180"      # auto-delete downloaded media after 180 seconds
  volumes:
    - waha_sessions:/app/.sessions      # persist session data across restarts
  restart: unless-stopped
  networks:
    - openkick

volumes:
  waha_sessions:
```

### Environment Variables for the Express Server

The user must add these to `.env` (do **not** edit `.env` programmatically):

```
WAHA_URL=http://waha:3000         # Docker internal; http://localhost:3008 for local dev
WAHA_API_KEY=<user-chosen-secret>
```

Also add to the `settings` table defaults in `database.ts`:

```typescript
const DEFAULT_SETTINGS: Record<string, string> = {
  // ... existing ...
  waha_url: "http://localhost:3008",
  // waha_api_key is NOT set as a default -- it is optional and user-configured
};
```

### WAHA Swagger Docs

Available at `http://localhost:3008/api/docs` during development. Use this as the authoritative endpoint reference. See also `docs/INTEGRATION_RESEARCH.md` section 3 for full API details.

---

## 7. Message Parsing Strategy

### Flow Overview

```
Incoming message (WAHA webhook)
       |
       v
  Is sender known? --no--> Onboarding flow (section 10)
       |
      yes
       |
       v
  Is it a voice note? --yes--> Transcribe via whisper.ts
       |                              |
      no                              v
       |                        (text from transcription)
       v                              |
  Is it a number (1-9)? --yes--> Handle menu selection (match against last sent menu)
       |
      no
       |
       v
  Send to LLM (message-parser.service.ts)
       |
       v
  Route by intent
```

### LLM Prompt Design

The system prompt for `parseMessage()` must:

1. List the five valid intents with descriptions
2. Include the parent's known children names (from `guardian_players` + `players` tables) so the LLM can match partial names
3. Instruct the LLM to respond with JSON only -- no explanation text
4. Specify the parent's preferred language (from `guardians.language`)
5. Handle multilingual input (German, French, English)

### Intent Routing Table

| Intent | Action | Confirmation Message |
|--------|--------|---------------------|
| `report_absence` | Look up next event, call `setAttendance(eventId, playerId, "absent", "whatsapp", reason)` | `"{playerName}" ist fuer "{eventTitle}" abgemeldet.` |
| `confirm_attendance` | Look up next event, call `setAttendance(eventId, playerId, "attending", "whatsapp")` | `"{playerName}" ist fuer "{eventTitle}" angemeldet.` |
| `register_tournament` | Look up next tournament-type event, register player | `"{playerName}" ist fuer das Turnier "{eventTitle}" registriert.` |
| `ask_schedule` | Query upcoming events, format as text list | `Naechste Termine:\n1. Training Mo 18:00\n2. Turnier Sa 09:00` |
| `unknown` | Send a help menu with numbered options | (see numbered menu below) |

### Help Menu (sent on `unknown` intent)

```
Hallo! Ich bin der OpenKick-Bot. Was moechtest du tun?
1. Abmelden (z.B. "Luca ist krank")
2. Anmelden
3. Naechste Termine anzeigen
4. Turnier-Anmeldung

Schreib einfach eine Nachricht oder antworte mit der Nummer.
```

### Disambiguation

When parsing finds a player name but the guardian has multiple children:
- If name matches one child: proceed with that child
- If name matches no child: ask "Which child do you mean?" and send a numbered menu with the children's names
- If no name mentioned and guardian has one child: assume that child
- If no name mentioned and guardian has multiple children: ask with numbered menu

---

## 8. Sending Patterns

### Numbered Text Menus (preferred over buttons)

WhatsApp restricts interactive button rendering from unofficial APIs. **Always use numbered text menus.** Format:

```
<Title line>
1. Option A
2. Option B
3. Option C

Reply with the number.
```

When a user replies with a single digit (1-9), match it to the last menu sent to that chat. Store the "last menu context" in memory or the `message_log` table.

### Confirmation Messages

Every action must send a confirmation. Keep it short, one line. Include the player name and event title so the parent knows exactly what was recorded.

### Reminder Messages

Sent by the reminders service (already exists in `server/src/services/reminders.ts`). The new `WhatsAppSender` should be injected into the reminders service to replace the current direct `sendMessage()` calls. Reminder format:

```
Erinnerung: Bitte melde {playerName} fuer "{eventTitle}" am {date} an oder ab.

1. Anwesend
2. Abwesend

Antworte mit der Nummer.
```

### Broadcast Messages

Coaches send broadcasts via `POST /api/broadcasts`. The broadcasts service (`server/src/services/broadcasts.ts`) should use `WhatsAppSender` for delivery. Rate limiting in the sender ensures broadcasts to 50+ parents do not trigger WhatsApp bans.

---

## 9. Rate Limiting

### Why

WhatsApp bans accounts that send too many messages too quickly, especially to different contacts. WAHA has no built-in rate limiter.

### Implementation

The `WhatsAppSender` class (section 3) implements an in-memory FIFO queue with a configurable delay between sends.

```typescript
// Configuration (can be adjusted via settings table)
const RATE_LIMIT_DELAY_MS = 3000;      // 3 seconds between sends to different contacts
const RATE_LIMIT_SAME_CHAT_MS = 1000;  // 1 second between sends to the same chat
const MAX_MESSAGES_PER_MINUTE = 15;    // hard cap
```

### Rules

1. **Per-contact delay:** Wait at least 3 seconds between messages to different phone numbers.
2. **Same-contact delay:** Wait at least 1 second between messages to the same phone number (to avoid appearing spammy).
3. **Hard cap:** Never exceed 15 messages per minute across all contacts.
4. **New number warm-up:** For the first 2 weeks after pairing a new WhatsApp number, limit to 10 outbound messages per day. Track this via the `whatsapp_sessions.createdAt` timestamp.
5. **Broadcast throttle:** When sending the same message to many contacts (e.g., reminders), vary the message slightly per recipient (include the player's name) to avoid being flagged for identical content.

### Queue Persistence

The queue lives in memory. If the server restarts, queued messages are lost. This is acceptable because:
- Webhook responses (confirmations) are sent immediately, not queued
- Broadcasts and reminders can be re-triggered

If persistence is needed later, store the queue in the `message_log` table with `direction = 'outbound'` and `actionTaken = 'queued'`.

---

## 10. Onboarding Flow

Triggered when a message arrives from a phone number not found in the `guardians` table.

### Flow

```
Unknown number sends any message
       |
       v
  Bot: "Willkommen bei OpenKick! Wie heisst du?"
       |
       v
  Parent replies with their name (free text)
       |
       v
  Bot: "Danke, {name}! Wie heisst dein Kind?"
       |
       v
  Parent replies with child's name
       |
       v
  Bot: "In welchem Jahr ist {childName} geboren? (z.B. 2015)"
       |
       v
  Parent replies with year
       |
       v
  Create guardian record (phone, name)
  Create player record (childName, yearOfBirth)
  Link via guardian_players
       |
       v
  Bot: "Fertig! {childName} ist registriert.
        Du kannst jetzt Nachrichten wie 'Luca ist krank' schicken."
```

### Conversation State

Track onboarding state per phone number. Use an in-memory map:

```typescript
interface OnboardingState {
  step:
    | "awaiting_parent_name"
    | "awaiting_child_name"
    | "awaiting_birth_year"
    | "awaiting_consent";
  parentName?: string;
  childName?: string;
  phone: string;
  startedAt: number;
}

// Map<phoneNumber, OnboardingState>
const onboardingStates = new Map<string, OnboardingState>();
```

### Timeout

If a parent does not complete onboarding within 30 minutes, clear their state. On their next message, start over.

### Privacy Consent

Before creating the guardian record, send a short privacy notice:

```
Datenschutzhinweis: Wir speichern deinen Namen, Telefonnummer
und den Namen deines Kindes.
Diese Daten werden nur fuer die Trainings-Verwaltung verwendet.

1. Einverstanden
2. Abbrechen

Antworte mit der Nummer.
```

Only proceed if the parent replies "1". Set `guardians.consentGiven = 1`.

---

## 11. Edge Cases and Gotchas

### WhatsApp Bans

- **Risk:** WhatsApp can ban the paired phone number if it detects bot-like behavior.
- **Mitigation:**
  - Use rate limiting (section 9)
  - Never send unsolicited messages to numbers that have not messaged the bot first
  - Vary message content (include player names, avoid identical broadcasts)
  - Warm up new numbers gradually (10 msg/day for 2 weeks)
  - Use a dedicated SIM card, not a personal number
- **Recovery:** If banned, the session becomes `FAILED`. Detect this via `session.status` webhook event. Log it, alert the admin via the dashboard. A new SIM card and WAHA session are needed.

### Button Unreliability

- **Problem:** `POST /api/sendButtons` works in WAHA, but WhatsApp often does not render buttons from unofficial APIs. They appear as plain text or not at all.
- **Solution:** Never use buttons. Always use numbered text menus (section 8). Parse single-digit replies as menu selections.

### Group Chat Caveats

- **Problem:** If the bot number is added to a WhatsApp group, every message in the group triggers the webhook. This causes noise and potential privacy issues (parsing messages from non-registered parents).
- **Solution:** Ignore group messages entirely. Check for `@g.us` suffix in `payload.from` or check `payload.isGroupMsg === true`. Log and discard.

```typescript
if (payload.from.endsWith("@g.us") || payload.isGroupMsg) {
  // Log for debugging, but do not process
  return res.status(200).json({ status: "ignored_group" });
}
```

### Session Reconnection

- **Problem:** WhatsApp Web sessions disconnect periodically (phone goes offline, WhatsApp updates, etc.). WAHA reports this via `session.status` webhook event.
- **Solution:**
  1. Listen for `session.status` events in the webhook handler
  2. When status changes to `FAILED` or `STOPPED`, update `whatsapp_sessions` table
  3. Attempt automatic restart: call `POST /api/sessions/start` with `{ "name": "default" }`
  4. If restart fails (needs new QR scan), set status to `qr_pending` and notify admin
  5. Queue outbound messages while disconnected; drain when reconnected

```typescript
if (body.event === "session.status") {
  const status = body.payload as unknown as {
    name: string;
    status: string;
  };
  await updateSessionStatus(status.name, status.status);
  if (status.status === "FAILED") {
    await attemptSessionRestart(status.name);
  }
}
```

### Media Handling

- **Voice notes:** Already handled by existing `whisper.ts` transcription service. The webhook handler checks `hasMedia` and `media.mimetype`. If it starts with `audio/`, transcribe before parsing.
- **Images:** Parents may send medical certificates or other images. For now, log them in `message_log` with `mediaType = 'image'` but do not process. Send a reply: "Bild erhalten. Fuer Abmeldungen schreib bitte eine Nachricht."
- **PDFs:** Same as images -- log but do not process automatically. Future: extract text for tournament registration forms.
- **Stickers / GIFs / Contacts / Locations:** Ignore. Reply with the help menu.

### Message Deduplication

- WAHA may deliver the same message twice (network issues, retries).
- Store `wahaMessageId` in `message_log`. Before processing, check if the ID already exists.

```typescript
const existing = db.exec(
  "SELECT id FROM message_log WHERE wahaMessageId = ?",
  [payload.id],
);
if (existing.length > 0 && existing[0].values.length > 0) {
  return res.status(200).json({ status: "duplicate" });
}
```

### Echo Prevention

- When the bot sends a message, WAHA may fire a webhook with `fromMe: true`.
- Always check `payload.fromMe` and skip processing if true.

### Timezone

- All date/time operations must use `Europe/Zurich` timezone (per PRD 4.6).
- When the LLM extracts a date like "morgen" (tomorrow), resolve it relative to Zurich time, not UTC.

### Phone Number Normalization

- Store phone numbers without leading `+` or `00`, without spaces or dashes.
- WAHA sends numbers in format `41791234567@c.us`. Strip the `@c.us` suffix.
- The `guardians.phone` column must use the same format: `41791234567`.
- When a parent types their own phone number during onboarding, normalize it.

```typescript
function normalizePhone(raw: string): string {
  let phone = raw
    .replace(/@c\.us$/, "")
    .replace(/[\s\-\(\)]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("00")) phone = phone.slice(2);
  return phone;
}
```

### LLM Failures

- If the LLM call fails (timeout, rate limit, invalid JSON response), catch the error.
- Send the help menu as a fallback: "Ich habe deine Nachricht nicht verstanden."
- Log the error in `message_log.errorMessage`.
- Do not retry the LLM call in the webhook handler (it blocks the response to WAHA). If needed, implement async retry via the message queue.

### Concurrent Webhook Processing

- WAHA sends webhooks sequentially per session, but the Express server may receive them concurrently if WAHA retries or if there are multiple sessions.
- Use the `wahaMessageId` deduplication check (above) to prevent double-processing.
- For attendance updates, the `setAttendance()` function should use `INSERT OR REPLACE` to handle concurrent writes to the same event+player combination.

---

## References

- WAHA API details: `docs/INTEGRATION_RESEARCH.md`, section 3
- Existing WhatsApp service: `server/src/services/whatsapp.ts`
- Existing webhook handler: `server/src/routes/whatsapp.ts`
- LLM service: `server/src/services/llm.ts`
- Whisper transcription: `server/src/services/whisper.ts`
- Attendance service: `server/src/services/attendance.ts`
- Database schema: `server/src/database.ts`
- PRD: `requirements/FOOTBALL_TOOL_Attendance_and_Tournament_Management.md`
