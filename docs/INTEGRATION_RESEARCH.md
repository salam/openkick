# Integration Research

> Compiled Feb 28, 2026. Actionable implementation details for all external integrations referenced in the PRD.

---

## Table of Contents

1. [Stripe (Payments)](#1-stripe-payments)
2. [Datatrans (Payments)](#2-datatrans-payments)
3. [WAHA (WhatsApp API)](#3-waha-whatsapp-api)
4. [BuilderBot (Chatbot Framework)](#4-builderbot-chatbot-framework)
5. [n8n (Workflow Automation)](#5-n8n-workflow-automation)
6. [Brave Search API (Live Ticker)](#6-brave-search-api-live-ticker)
7. [HIBP & Password Strength (Admin Security)](#7-hibp--password-strength-admin-security)
8. [Recommended npm Packages](#8-recommended-npm-packages)

---

## 1. Stripe (Payments)

### Package

```bash
npm install stripe
```

### Setup

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});
```

### API Keys

| Key | Prefix | Where | Purpose |
|-----|--------|-------|---------|
| Publishable | `pk_test_` / `pk_live_` | Frontend | Identifies account to Stripe.js |
| Secret | `sk_test_` / `sk_live_` | Backend only | Full API access |
| Webhook signing | `whsec_` | Backend only | Verify webhook payloads |

### Checkout Session (Hosted)

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  payment_method_types: ['card', 'twint'],  // Twint for Swiss CHF accounts
  line_items: [{
    price_data: {
      currency: 'chf',
      product_data: { name: 'Tournament Entry Fee' },
      unit_amount: 2500,  // CHF 25.00 in centimes
    },
    quantity: 1,
  }],
  success_url: `${FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${FRONTEND_URL}/payment/cancel`,
  metadata: { tournamentId: '...', playerId: '...' },
});

// Redirect: window.location.href = session.url;
```

### Twint via Stripe

- Payment method type string: `'twint'`
- **CHF only**, Swiss Stripe account required
- Must be enabled in Stripe Dashboard > Settings > Payment methods
- Add `'twint'` to `payment_method_types` array

### Webhooks

```typescript
// IMPORTANT: register BEFORE express.json() middleware
app.post('/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await fulfillOrder(event.data.object as Stripe.Checkout.Session);
        break;
      case 'charge.refunded':
        // handle refund confirmation
        break;
    }
    res.json({ received: true });
  }
);
```

Events to subscribe: `checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`, `payment_intent.payment_failed`.

**Local dev:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### Refunds

```typescript
// Full refund
await stripe.refunds.create({ payment_intent: 'pi_xxx' });

// Partial refund (CHF 10.00 = 1000 centimes)
await stripe.refunds.create({ payment_intent: 'pi_xxx', amount: 1000 });
```

### Environment Variables

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 2. Datatrans (Payments)

### No Official Node.js SDK

Use raw HTTP with `fetch` or `axios`. Basic Auth on every call.

### Credentials

| Credential | Purpose |
|------------|---------|
| Merchant ID | Numeric ID, used as Basic Auth username |
| Server-to-Server API password | Basic Auth password |
| HMAC-SHA-256 sign key | Verify webhook signatures |

### Authentication Helper

```typescript
const DATATRANS_BASE = process.env.DATATRANS_BASE_URL; // https://api.sandbox.datatrans.com
const AUTH = Buffer.from(
  `${process.env.DATATRANS_MERCHANT_ID}:${process.env.DATATRANS_API_PASSWORD}`
).toString('base64');

async function datatransRequest(method: string, path: string, body?: object) {
  const res = await fetch(`${DATATRANS_BASE}${path}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Datatrans ${res.status}: ${await res.text()}`);
  return res.json();
}
```

### Lightbox Flow

**Step 1 — Initialize transaction (backend):**

```typescript
const result = await datatransRequest('POST', '/v1/transactions', {
  currency: 'CHF',
  refno: 'order-abc-123',
  amount: 1500,  // CHF 15.00
  paymentMethods: ['VIS', 'ECA', 'TWI'],  // Visa, Mastercard, Twint
  redirect: {
    successUrl: 'https://yoursite.ch/payment/success',
    cancelUrl: 'https://yoursite.ch/payment/cancel',
    errorUrl: 'https://yoursite.ch/payment/error',
  },
  webhook: { url: 'https://yoursite.ch/api/webhooks/datatrans' },
});
// result.transactionId => "240501abc123def456"
```

**Step 2 — Open Lightbox (frontend):**

```html
<script src="https://pay.sandbox.datatrans.com/upp/payment/js/datatrans-2.0.0.js"></script>
<script>
  Datatrans.startPayment({ transactionId: '240501abc123def456' });
</script>
```

**Step 3 — Verify (backend):**

```typescript
const status = await datatransRequest('GET', `/v1/transactions/${transactionId}`);
// status.status => "authorized" | "settled" | "canceled" | "failed"
```

### Twint via Datatrans

- Payment method code: `TWI`
- Add to `paymentMethods` array
- CHF only
- Must be activated on your Datatrans merchant account
- Sandbox has a Twint simulator

### Payment Method Codes

| Code | Method |
|------|--------|
| `TWI` | Twint |
| `VIS` | Visa |
| `ECA` | Mastercard |
| `PFC` | PostFinance Card |
| `PEF` | PostFinance E-Finance |
| `PAP` | PayPal |

### Webhook Signature Verification

```typescript
import crypto from 'crypto';

function verifyDatatransSignature(headerValue: string, rawBody: string): boolean {
  const parts = Object.fromEntries(
    headerValue.split(',').map(p => { const [k, v] = p.split('=', 2); return [k, v]; })
  );
  const signedPayload = parts['t'] + rawBody;
  const hmacKey = Buffer.from(process.env.DATATRANS_HMAC_KEY!, 'hex');
  const expected = crypto.createHmac('sha256', hmacKey).update(signedPayload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(parts['s0'], 'hex'), Buffer.from(expected, 'hex'));
}
```

### Refunds

```typescript
// Full or partial refund (credit)
await datatransRequest('POST', `/v1/transactions/${transactionId}/credit`, {
  amount: 1500, currency: 'CHF', refno: `refund-${Date.now()}`,
});

// Cancel (void) authorized-but-not-settled
await datatransRequest('POST', `/v1/transactions/${transactionId}/cancel`, {});
```

### Key Endpoints

| Action | Method | Path |
|--------|--------|------|
| Initialize | `POST` | `/v1/transactions` |
| Status | `GET` | `/v1/transactions/{id}` |
| Settle | `POST` | `/v1/transactions/{id}/settle` |
| Cancel | `POST` | `/v1/transactions/{id}/cancel` |
| Refund | `POST` | `/v1/transactions/{id}/credit` |

### Environment Variables

```
DATATRANS_MERCHANT_ID=1100012345
DATATRANS_API_PASSWORD=s2s-password
DATATRANS_HMAC_KEY=hex-key
DATATRANS_BASE_URL=https://api.sandbox.datatrans.com
```

### References

- API Reference: https://api-reference.datatrans.ch/
- Integration Docs: https://docs.datatrans.ch/docs
- Sandbox Admin: https://admin.sandbox.datatrans.com

---

## 3. WAHA (WhatsApp API)

### Docker Image

```
devlikeapro/waha          # Core (free, one session per container)
devlikeapro/waha-plus     # Plus (paid, multi-session, dashboard)
```

### docker-compose.yml

```yaml
waha:
  image: devlikeapro/waha
  ports:
    - "3001:3000"
  environment:
    WHATSAPP_API_KEY: "${WAHA_API_KEY}"
    WHATSAPP_HOOK_URL: "http://web:3000/api/webhooks/waha"
    WHATSAPP_HOOK_EVENTS: "message,message.ack,session.status"
    WHATSAPP_DEFAULT_ENGINE: "WEBJS"
    WHATSAPP_RESTART_ALL_SESSIONS: "true"
    WHATSAPP_START_SESSION: "default"
    WHATSAPP_FILES_MIMETYPES: "image/jpeg,image/png,application/pdf"
    WHATSAPP_FILES_LIFETIME: "180"
  volumes:
    - waha_data:/app/.sessions
  restart: unless-stopped
```

### Authentication

Header on every request: `X-Api-Key: your-secret-api-key`

### QR Code Pairing

```typescript
// 1. Start session
await axios.post(`${WAHA_URL}/api/sessions/start`, { name: 'default' }, { headers });

// 2. Get QR code image
const qr = await axios.get(`${WAHA_URL}/api/sessions/default/auth/qr`,
  { headers, responseType: 'arraybuffer' }
);
// qr.data is a PNG buffer

// 3. Check status
const session = await axios.get(`${WAHA_URL}/api/sessions/default`, { headers });
// session.data.status: "SCAN_QR_CODE" | "WORKING" | "FAILED"
```

### Receiving Messages (Webhook)

Payload:

```json
{
  "event": "message",
  "session": "default",
  "payload": {
    "id": "true_5511999999999@c.us_3EB0A608...",
    "from": "5511999999999@c.us",
    "body": "Luca is sick",
    "hasMedia": false,
    "fromMe": false,
    "timestamp": 1700000000
  }
}
```

Chat ID format: `<phone>@c.us` (individual), `<id>@g.us` (group).

### Sending Messages

| Type | Endpoint | Key Fields |
|------|----------|------------|
| Text | `POST /api/sendText` | `chatId`, `text` |
| Image | `POST /api/sendImage` | `chatId`, `file: { url, mimetype }`, `caption` |
| Document | `POST /api/sendFile` | `chatId`, `file: { url, mimetype, filename }` |
| Location | `POST /api/sendLocation` | `chatId`, `latitude`, `longitude`, `title` |
| Buttons | `POST /api/sendButtons` | `chatId`, `title`, `body`, `buttons[]` |

All require `"session": "default"` in the body.

**Buttons caveat:** WhatsApp has been restricting button rendering from unofficial APIs. Use numbered text menus as a reliable fallback:

```
What would you like to do?
1. Attend
2. Absent
3. Check schedule

Reply with the number.
```

### Profile Picture

```typescript
await axios.put(`${WAHA_URL}/api/sessions/default/me/profile/picture`, {
  file: { mimetype: 'image/jpeg', url: 'https://...' }
}, { headers });
```

### Rate Limits (WhatsApp-imposed)

| Risk | Guideline |
|------|-----------|
| New number warm-up | Start with 5-10 msg/day, increase over 2+ weeks |
| Messages per minute | Stay under 15-20/min to different contacts |
| Same content to many | Vary messages; identical broadcasts get flagged |
| Unsolicited messages | Only message users who contacted you first |

**Implement rate limiting in your app** — WAHA has no built-in rate limiter.

### Session Management

- Core: one session per container. Multiple numbers = multiple containers.
- Mount `/app/.sessions` volume for persistence across restarts.
- Listen for `session.status` webhook events to detect disconnects.

### Swagger Docs

Available at `http://localhost:3001/api/docs` — the authoritative endpoint reference.

---

## 4. BuilderBot (Chatbot Framework)

### Installation

```bash
npm install @builderbot/bot @builderbot/provider-baileys @builderbot/database-memory
```

Or scaffold: `npm create builderbot@latest`

### Key Packages

| Package | Purpose |
|---------|---------|
| `@builderbot/bot` | Core: flow builder, keyword matching, state |
| `@builderbot/provider-baileys` | WhatsApp via Baileys (free, QR scan) |
| `@builderbot/provider-meta` | WhatsApp via Meta Cloud API |
| `@builderbot/database-json` | File-based state persistence |

### Basic Setup

```typescript
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { MemoryDB } from '@builderbot/database-memory';

const attendanceFlow = addKeyword(['sick', 'not coming', 'absent'])
  .addAnswer('Got it. Which player?', { capture: true },
    async (ctx, { state, flowDynamic }) => {
      await state.update({ playerName: ctx.body });
      await flowDynamic(`Marking ${ctx.body} as absent. Thanks!`);
      // call your API here
    }
  );

const fallbackFlow = addKeyword(EVENTS.WELCOME)
  .addAnswer(null, null, async (ctx, { flowDynamic }) => {
    // Use LLM for free-form parsing
    const parsed = await parseFreeFormMessage(ctx.body);
    // ...
  });

await createBot({
  flow: createFlow([attendanceFlow, fallbackFlow]),
  provider: createProvider(BaileysProvider),
  database: new MemoryDB(),
});
```

### Context Object (`ctx`)

- `ctx.from` — sender's phone number
- `ctx.body` — message text
- `ctx.name` — sender's WhatsApp display name

### Flow API

- `addKeyword(keywords)` — trigger on substring match (case-insensitive)
- `addKeyword(EVENTS.WELCOME)` — catch-all fallback
- `addKeyword(EVENTS.MEDIA)` — trigger on images/audio/video
- `addAnswer(text, { capture: true }, callback)` — send reply, wait for next message
- `flowDynamic(text)` — send dynamic message mid-flow
- `gotoFlow(otherFlow)` — redirect to another flow
- `endFlow(message?)` — terminate flow
- `fallBack(message?)` — repeat current step (validation retry)
- `state.update({key: val})` / `state.get('key')` — per-conversation state

### Limitations

| Limitation | Impact |
|------------|--------|
| No built-in NLP | Must add LLM or regex layer for free-form parsing |
| No first-class button support | Use numbered text menus instead |
| Keyword matching is substring-based | Can cause false positives |
| No scheduling/cron | Add node-cron separately |
| Group chat support immature | Test thoroughly for group scenarios |
| Baileys is unofficial | Risk of WhatsApp bans |

### Recommendation

For free-form message parsing ("Luca is sick"), use BuilderBot's `EVENTS.WELCOME` catch-all and route to an LLM:

```typescript
const catchAll = addKeyword(EVENTS.WELCOME)
  .addAnswer(null, null, async (ctx, { flowDynamic }) => {
    const result = await llm.parse(ctx.body);
    // result: { intent: 'report_absence', player: 'Luca', reason: 'sick' }
    if (result.intent === 'report_absence') {
      await markAbsent(result.player, ctx.from);
      await flowDynamic(`Got it, ${result.player} is marked absent.`);
    }
  });
```

### Alternative: Skip BuilderBot, use WAHA directly

If the bot is primarily doing one-shot NLP parsing (not multi-step conversations), WAHA webhooks + Express handlers may be simpler than BuilderBot. BuilderBot's value is the conversation flow DSL, which matters less for simple command parsing.

---

## 5. n8n (Workflow Automation)

### Docker Setup

```yaml
n8n:
  image: docker.n8n.io/n8nio/n8n:latest
  ports:
    - "5678:5678"
  environment:
    WEBHOOK_URL: "https://n8n.yourdomain.com/"
    GENERIC_TIMEZONE: "Europe/Zurich"
    TZ: "Europe/Zurich"
    DB_TYPE: postgresdb
    DB_POSTGRESDB_HOST: db
    DB_POSTGRESDB_DATABASE: n8n
    DB_POSTGRESDB_USER: n8n
    DB_POSTGRESDB_PASSWORD: "${N8N_DB_PASSWORD}"
    N8N_ENCRYPTION_KEY: "${N8N_ENCRYPTION_KEY}"
  volumes:
    - n8n_data:/home/node/.n8n
  restart: unless-stopped
```

Generate encryption key: `openssl rand -hex 32`

### Webhook Triggers

n8n generates two URLs per webhook node:
- Test: `https://<host>/webhook-test/<path>` (active in editor)
- Production: `https://<host>/webhook/<path>` (active when workflow is activated)

**Trigger from Express:**

```typescript
const N8N_WEBHOOK_BASE = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook';

await axios.post(`${N8N_WEBHOOK_BASE}/absence-reported`, {
  playerId, eventId, parentPhone, reason
});
```

### WhatsApp Integration in n8n

- **WAHA community node:** `@devlikeapro/n8n-nodes-waha` — install via n8n Settings > Community Nodes
- **Official WhatsApp Business node:** built-in, requires Meta Business account
- **HTTP Request node:** call WAHA REST API directly (most flexible)

### Scheduled Workflows

| Workflow | Cron | Description |
|----------|------|-------------|
| Daily reminder (8am) | `0 8 * * *` | Remind non-responding parents |
| Deadline check (hourly) | `0 * * * *` | Check passed deadlines |
| Weekly summary (Sun 6pm) | `0 18 * * 0` | Attendance summary to coaches |
| 48h pre-event check | `0 9 * * *` | Query events in next 48h |

### Database Access

- Built-in PostgreSQL node (full CRUD + raw SQL)
- **Recommendation:** call your Express API from n8n rather than querying the DB directly — keeps business logic centralized

### Docker Networking

If n8n and Express are in the same docker-compose network, use service names: `http://web:3000/api/...`

### Recommended Workflows for OpenKick

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| Absence Reported | Webhook | Notify coach, update summary |
| Deadline Reminder | Schedule (daily) | Message unanswered parents |
| Event Summary | Schedule (2h before event) | Send attendance summary to coach |
| Deadline Passed | Schedule (hourly) | Auto-mark non-responders |
| Tournament Roster Check | Webhook | Alert if below min / above max |
| Weekly Report | Schedule (weekly) | Aggregate stats to admins |

---

## 6. Brave Search API (Live Ticker)

### Key Finding

**Brave Search API is a search engine, not a web scraper.** It cannot fetch the full content of a specific URL. Use it only for URL discovery.

### For the Live Ticker, Use This Architecture

```
[Cron / n8n schedule]
       |
       v
[Direct HTTP fetch] -- axios/fetch to the tournament URL
       |
       v
[HTML-to-text] -- cheerio / @mozilla/readability
       |
       v
[LLM] -- extract structured scores from page text
       |
       v
[Store in DB]
```

### Brave Search (URL Discovery Only)

```typescript
const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;

async function braveSearch(query: string, count = 5) {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    { headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_API_KEY } }
  );
  const data = await res.json();
  return data.web?.results ?? [];
}

// Example: find tournament results page
// const results = await braveSearch('"Juniorenturnier Zürich" Ergebnisse site:fussball.de');
```

### Page Content Fetching (Direct HTTP)

```typescript
import * as cheerio from 'cheerio';

async function fetchPageText(url: string): Promise<string> {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'OpenKickBot/1.0' },
    timeout: 15_000,
  });
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}
```

For JavaScript-heavy pages, use **Puppeteer** or **Playwright** instead of axios.

### Pricing

| Plan | Price | Queries/month | Rate limit |
|------|-------|---------------|------------|
| Free | $0 | 2,000 | 1 req/s |
| Base | ~$5/mo | 20,000 | 10 req/s |

### Environment Variables

```
BRAVE_API_KEY=BSA...
```

---

## 7. HIBP & Password Strength (Admin Security)

### HIBP Pwned Passwords (k-Anonymity)

No API key required. No rate limit for typical usage.

```typescript
import crypto from 'node:crypto';

export async function checkPwnedPassword(password: string): Promise<{ isPwned: boolean; count: number }> {
  const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'openkick-server/0.1.0' },
  });
  const body = await res.text();

  for (const line of body.split('\n')) {
    const [hashSuffix, countStr] = line.split(':');
    if (hashSuffix.trim() === suffix) {
      return { isPwned: true, count: parseInt(countStr.trim(), 10) };
    }
  }
  return { isPwned: false, count: 0 };
}
```

### Password Strength with zxcvbn-ts

```bash
npm install @zxcvbn-ts/core @zxcvbn-ts/language-common @zxcvbn-ts/language-en
```

```typescript
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';

// Initialize once at startup
zxcvbnOptions.setOptions({
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEn.dictionary },
});

export async function checkAdminPassword(password: string) {
  const reasons: string[] = [];

  // Complexity rules
  if (password.length < 12) reasons.push('Must be at least 12 characters');
  if (!/[a-z]/.test(password)) reasons.push('Must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) reasons.push('Must contain an uppercase letter');
  if (!/[0-9]/.test(password)) reasons.push('Must contain a digit');
  if (!/[^a-zA-Z0-9]/.test(password)) reasons.push('Must contain a special character');

  // Entropy check
  const zResult = zxcvbn(password);
  if (zResult.score < 3) {
    reasons.push(`Too weak (strength ${zResult.score}/4). ${zResult.feedback.warning || ''}`);
  }

  // HIBP breach check
  const pwned = await checkPwnedPassword(password);
  if (pwned.isPwned) {
    reasons.push(`Appeared in ${pwned.count.toLocaleString()} data breaches`);
  }

  return { acceptable: reasons.length === 0, reasons, zxcvbnScore: zResult.score, pwnedCount: pwned.count };
}
```

### Integration with Login

```typescript
const check = await checkAdminPassword(plaintextPassword);
if (!check.acceptable) {
  req.session.piiAccessLevel = 'restricted';  // downgrade PII visibility
  req.session.passwordWarnings = check.reasons;
}
```

### Offline HIBP (not recommended)

Full dataset is ~35 GB uncompressed. Use the online API instead — one call per login is trivial.

---

## 8. Recommended npm Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `stripe` | latest | Stripe payments SDK |
| `axios` | latest | HTTP client (Datatrans, WAHA, Brave) |
| `cheerio` | latest | HTML parsing for live ticker page scraping |
| `@zxcvbn-ts/core` | latest | Password strength estimation |
| `@zxcvbn-ts/language-common` | latest | Common password dictionaries |
| `@zxcvbn-ts/language-en` | latest | English password dictionaries |
| `@builderbot/bot` | latest | Chatbot core |
| `@builderbot/provider-baileys` | latest | WhatsApp via Baileys |
| `@builderbot/database-json` | latest | Chatbot state persistence |
| `puppeteer` | latest | Headless browser (JS-heavy tournament pages) |

### Already in project

| Package | Purpose |
|---------|---------|
| `express` | Web framework |
| `sql.js` | SQLite (dev database) |
| `bcryptjs` | Password hashing |
| `vitest` | Testing |
| `typescript` | Type system |

### No npm package needed

| Integration | Approach |
|-------------|----------|
| Datatrans | Raw HTTP (no official SDK) |
| HIBP Pwned Passwords | Built-in `crypto` + `fetch` |
| Brave Search | Raw HTTP with `X-Subscription-Token` header |
| WAHA | Raw HTTP with `X-Api-Key` header |

---

## Architecture Overview

```
┌────────────┐   webhook    ┌──────────────┐   HTTP    ┌──────────┐
│   WAHA     │ ──────────> │  Express API  │ <──────> │   n8n    │
│ (WhatsApp) │ <────────── │  (Node.js)    │          │ (cron +  │
└────────────┘   REST API   │              │          │ webhooks)│
                            │  sql.js / PG  │          └──────────┘
┌────────────┐              │              │
│ BuilderBot │ ──────────> │              │   ┌──────────────────┐
│ (chatbot)  │              │              │──>│ Stripe/Datatrans │
└────────────┘              └──────────────┘   │ (hosted checkout)│
                                   │           └──────────────────┘
                                   v
                            ┌──────────────┐
                            │  Frontend    │
                            │  (React/Vue) │
                            └──────────────┘
```
