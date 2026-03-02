# Payments Module Blueprint

> Implementation guide for the OpenKick payments module.
> PRD reference: section 4.5.12.
> For detailed API code samples, see `docs/INTEGRATION_RESEARCH.md` sections 1 (Stripe) and 2 (Datatrans).

---

## 1. Module Overview

The payments module adds optional payment collection for three club use cases:

1. **Tournament participation fees** -- parents pay during tournament registration; confirmation is withheld until payment succeeds.
2. **Trikot / merchandise orders** -- surveys (PRD 4.5.11) that carry a price per item redirect the parent to a payment page after submission.
3. **Homepage donations** -- an anonymous donation widget with a configurable suggested amount.

Two payment service providers (PSPs) are supported:

| PSP | SDK | Twint Code | Notes |
|-----|-----|------------|-------|
| **Stripe** | `stripe` npm package | `'twint'` (payment method type) | Card, SEPA, Apple Pay, Google Pay, Twint |
| **Datatrans** | Raw HTTP (`fetch`) -- no SDK | `'TWI'` (payment method code) | Swiss PSP: cards, PostFinance, Twint |

Twint is not a direct integration. It is exposed as a payment method through whichever PSP the admin enables. Twint is CHF-only.

The club's server **never** handles raw card data. All payments go through the PSP's hosted checkout page (Stripe Checkout or Datatrans Lightbox).

---

## 2. Dependencies

### npm packages

```bash
npm install stripe
```

### Already in the project

| Package | Used for |
|---------|----------|
| `express` | Routes, webhook handlers |
| `sql.js` | Database |

### No package needed

| Integration | Approach |
|-------------|----------|
| Datatrans | Raw HTTP with `fetch`. Basic Auth on every call. |

---

## 3. File Structure

All paths are relative to `server/src/`.

```
server/src/
  services/
    stripe.service.ts          # Stripe Checkout session creation, refunds, event construction
    datatrans.service.ts       # Datatrans init, status check, refunds (raw HTTP)
    payment.service.ts         # Provider-agnostic facade (PaymentProvider interface)
  routes/
    payments.routes.ts         # Admin payment settings, transaction log, checkout entry point, refund
    webhooks/
      stripe.webhook.ts        # POST /api/webhooks/stripe  (raw body!)
      datatrans.webhook.ts     # POST /api/webhooks/datatrans
  __tests__/
    payments.test.ts           # Unit + integration tests
```

---

## 4. Database Schema

Add these tables to the schema in `server/src/database.ts`. Use the same `CREATE TABLE IF NOT EXISTS` pattern already in place.

```sql
-- Which PSPs the club has configured
CREATE TABLE IF NOT EXISTS payment_providers (
  id            TEXT PRIMARY KEY,            -- 'stripe' | 'datatrans'
  enabled       INTEGER NOT NULL DEFAULT 0,  -- 0 = off, 1 = on
  config        TEXT NOT NULL DEFAULT '{}',  -- JSON: keys, merchant IDs (encrypted at rest ideally)
  testMode      INTEGER NOT NULL DEFAULT 1,  -- 1 = sandbox, 0 = live
  createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which use cases are turned on
CREATE TABLE IF NOT EXISTS payment_use_cases (
  id            TEXT PRIMARY KEY,            -- 'tournament_fee' | 'survey_order' | 'donation'
  enabled       INTEGER NOT NULL DEFAULT 0,
  providerId    TEXT REFERENCES payment_providers(id),  -- which PSP to route through
  currency      TEXT NOT NULL DEFAULT 'CHF',
  updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every payment attempt (successful or not)
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId      TEXT,                        -- PSP's transaction/session ID
  providerId      TEXT NOT NULL,               -- 'stripe' | 'datatrans'
  useCase         TEXT NOT NULL,               -- 'tournament_fee' | 'survey_order' | 'donation'
  referenceId     TEXT,                        -- eventId, surveyId, or NULL for donations
  nickname        TEXT,                        -- player nickname (no PII)
  amount          INTEGER NOT NULL,            -- in smallest currency unit (centimes)
  currency        TEXT NOT NULL DEFAULT 'CHF',
  status          TEXT NOT NULL DEFAULT 'pending',
    -- pending | completed | failed | refunded | partially_refunded
  refundedAmount  INTEGER NOT NULL DEFAULT 0,  -- cumulative refunded centimes
  idempotencyKey  TEXT UNIQUE,                 -- prevent duplicate processing
  metadata        TEXT,                        -- JSON blob for extra context
  createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Default seed data

```sql
INSERT OR IGNORE INTO payment_providers (id, enabled, config) VALUES ('stripe', 0, '{}');
INSERT OR IGNORE INTO payment_providers (id, enabled, config) VALUES ('datatrans', 0, '{}');

INSERT OR IGNORE INTO payment_use_cases (id, enabled) VALUES ('tournament_fee', 0);
INSERT OR IGNORE INTO payment_use_cases (id, enabled) VALUES ('survey_order', 0);
INSERT OR IGNORE INTO payment_use_cases (id, enabled) VALUES ('donation', 0);
```

---

## 5. API Endpoints

### 5.1 Checkout

```
POST /api/payments/checkout
```

Creates a checkout session with the configured PSP and returns a redirect URL (or transaction ID for Datatrans Lightbox).

**Request body:**

```typescript
interface CheckoutRequest {
  useCase: 'tournament_fee' | 'survey_order' | 'donation';
  referenceId?: string;    // eventId or surveyId; omitted for donations
  nickname?: string;       // player nickname; omitted for anonymous donations
  amount: number;          // in centimes (e.g. 2500 = CHF 25.00)
  currency?: string;       // defaults to 'CHF'
  paymentMethods?: string[]; // optional override; e.g. ['card', 'twint']
  donorMessage?: string;   // optional, donations only
  successUrl: string;      // frontend URL to redirect on success
  cancelUrl: string;       // frontend URL to redirect on cancel
}
```

**Response (200):**

```typescript
interface CheckoutResponse {
  provider: 'stripe' | 'datatrans';
  // Stripe: full URL to redirect the browser
  // Datatrans: transaction ID to pass to the Lightbox JS
  redirectUrl?: string;        // Stripe
  transactionId?: string;      // Datatrans
  internalTransactionId: number; // our DB record ID
}
```

**Errors:** 400 if no provider enabled for this use case, 400 if currency mismatch for Twint (must be CHF).

### 5.2 Stripe Webhook

```
POST /api/webhooks/stripe
```

**Critical:** This route must receive the **raw body** (not parsed JSON). Register it _before_ `express.json()` middleware, or mount it on a separate sub-app. See section 8 for details.

Returns `200 { received: true }` on success, `400` on signature failure.

### 5.3 Datatrans Webhook

```
POST /api/webhooks/datatrans
```

Receives JSON body with HMAC-SHA-256 signature in the `Datatrans-Signature` header. Verifies signature, then updates the transaction record.

Returns `200 { received: true }` on success, `400` on signature failure.

### 5.4 Transaction Log (Admin)

```
GET /api/admin/payments/transactions
```

Query params: `?page=1&limit=20&useCase=tournament_fee&status=completed`

**Response:**

```typescript
interface TransactionListResponse {
  transactions: {
    id: number;
    provider: string;
    useCase: string;
    nickname: string | null;  // no PII, only nickname
    amount: number;
    currency: string;
    status: string;
    refundedAmount: number;
    createdAt: string;
  }[];
  total: number;
  page: number;
  limit: number;
}
```

### 5.5 Refund (Admin)

```
POST /api/admin/payments/refund/:transactionId
```

**Request body:**

```typescript
interface RefundRequest {
  amount?: number;  // partial refund in centimes; omit for full refund
}
```

**Response (200):**

```typescript
interface RefundResponse {
  transactionId: number;
  refundedAmount: number;   // new cumulative refunded amount
  status: string;           // 'refunded' | 'partially_refunded'
}
```

**Errors:** 404 if transaction not found, 400 if already fully refunded, 400 if refund amount exceeds remaining balance.

### 5.6 Payment Settings (Admin)

```
GET /api/admin/payments/settings
```

Returns all providers and use cases with their current configuration (secrets are masked in the response -- only last 4 characters shown).

```
PUT /api/admin/payments/settings
```

**Request body:**

```typescript
interface PaymentSettingsUpdate {
  providers?: {
    id: 'stripe' | 'datatrans';
    enabled: boolean;
    config: Record<string, string>;  // key-value pairs for API keys, merchant IDs
    testMode: boolean;
  }[];
  useCases?: {
    id: 'tournament_fee' | 'survey_order' | 'donation';
    enabled: boolean;
    providerId: string;
    currency: string;
  }[];
}
```

---

## 6. Checkout Flow -- Sequence Diagram

```
  Frontend              Backend               PSP (Stripe/Datatrans)
     |                    |                           |
     |  POST /api/payments/checkout                   |
     |------------------->|                           |
     |                    |                           |
     |                    |  Create transaction (DB, status=pending)
     |                    |                           |
     |                    |  createCheckout() ------->|
     |                    |       (Stripe: session)   |
     |                    |       (Datatrans: init)   |
     |                    |<--------------------------|
     |                    |  return URL / txn ID      |
     |<-------------------|                           |
     |                                                |
     |  Redirect / open Lightbox                      |
     |----------------------------------------------->|
     |                                                |
     |                 (customer pays)                |
     |                                                |
     |  redirect to successUrl / cancelUrl            |
     |<-----------------------------------------------|
     |                                                |
     |                    |  Webhook POST             |
     |                    |<--------------------------|
     |                    |                           |
     |                    |  Verify signature          |
     |                    |  Update transaction (DB)   |
     |                    |  status = completed|failed |
     |                    |                           |
     |                    |  (if tournament_fee:       |
     |                    |   confirm registration)    |
     |                    |                           |
     |                    |  (if identified parent:    |
     |                    |   send WhatsApp receipt)   |
     |                    |                           |
     |                    |  200 { received: true }   |
     |                    |-------------------------->|
```

**Important:** The frontend success page should **not** treat the redirect as proof of payment. Always wait for the webhook to flip the transaction status in the database. The success page should poll or display "Payment is being confirmed..." until the backend confirms.

---

## 7. Provider Abstraction

### PaymentProvider Interface

Define in `server/src/services/payment.service.ts`:

```typescript
export interface CheckoutParams {
  amount: number;            // centimes
  currency: string;          // e.g. 'CHF'
  description: string;       // human-readable line item
  referenceId: string;       // internal reference (event ID, survey ID, etc.)
  nickname?: string;
  paymentMethods?: string[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  externalId: string;        // PSP's session/transaction ID
  redirectUrl?: string;      // Stripe: full checkout URL
  transactionId?: string;    // Datatrans: ID for Lightbox
}

export interface RefundParams {
  externalId: string;
  amount?: number;           // partial refund; omit for full
  currency: string;
}

export interface RefundResult {
  success: boolean;
  refundedAmount: number;
}

export interface TransactionStatus {
  externalId: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  amount: number;
  currency: string;
}

export interface WebhookVerification {
  valid: boolean;
  eventType: string;          // normalized: 'payment.completed' | 'payment.failed' | 'refund.completed'
  externalId: string;
  rawData: unknown;
}

export interface PaymentProvider {
  readonly name: 'stripe' | 'datatrans';

  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;

  verifyWebhook(headers: Record<string, string>, rawBody: Buffer | string): WebhookVerification;

  refund(params: RefundParams): Promise<RefundResult>;

  getTransaction(externalId: string): Promise<TransactionStatus>;
}
```

### Facade: PaymentService

```typescript
export class PaymentService {
  private providers: Map<string, PaymentProvider> = new Map();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Resolve the active provider for a given use case from DB config */
  async getProviderForUseCase(useCase: string): Promise<PaymentProvider> {
    // Query payment_use_cases table to find which providerId is assigned
    // Then look it up in the providers map
    // Throw if not found or not enabled
  }

  async checkout(useCase: string, params: CheckoutParams): Promise<CheckoutResult> {
    const provider = await this.getProviderForUseCase(useCase);
    return provider.createCheckout(params);
  }

  async refund(providerId: string, params: RefundParams): Promise<RefundResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    return provider.refund(params);
  }
}
```

---

## 8. Webhook Security

### 8.1 Stripe: Raw Body Requirement

Stripe webhook signature verification requires the **raw request body** (the exact bytes received). If `express.json()` parses the body first, the signature check will always fail.

**Solution -- register the Stripe webhook route before the JSON middleware:**

In `server/src/index.ts`, mount the webhook routes _before_ `app.use(express.json())`:

```typescript
import { stripeWebhookRouter } from './routes/webhooks/stripe.webhook.js';
import { datatransWebhookRouter } from './routes/webhooks/datatrans.webhook.js';

// Webhook routes MUST come before express.json()
app.use('/api/webhooks/stripe', stripeWebhookRouter);
app.use('/api/webhooks/datatrans', datatransWebhookRouter);

// Now apply JSON parsing for all other routes
app.use(express.json());
```

Inside `stripe.webhook.ts`:

```typescript
import express from 'express';
import Stripe from 'stripe';

const router = express.Router();

router.post('/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,                             // raw Buffer
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('Stripe signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle events...
    res.json({ received: true });
  }
);

export { router as stripeWebhookRouter };
```

### 8.2 Datatrans: HMAC-SHA-256

Datatrans sends a `Datatrans-Signature` header containing a timestamp and HMAC.

Inside `datatrans.webhook.ts`:

```typescript
import express from 'express';
import crypto from 'node:crypto';

const router = express.Router();

function verifyDatatransSignature(headerValue: string, rawBody: string): boolean {
  const parts = Object.fromEntries(
    headerValue.split(',').map(p => {
      const [k, v] = p.split('=', 2);
      return [k, v];
    })
  );
  const signedPayload = parts['t'] + rawBody;
  const hmacKey = Buffer.from(process.env.DATATRANS_HMAC_KEY!, 'hex');
  const expected = crypto
    .createHmac('sha256', hmacKey)
    .update(signedPayload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(parts['s0'], 'hex'),
    Buffer.from(expected, 'hex')
  );
}

router.post('/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['datatrans-signature'] as string;
    const rawBody = req.body.toString('utf-8');

    if (!sig || !verifyDatatransSignature(sig, rawBody)) {
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(rawBody);
    // Handle payload...
    res.json({ received: true });
  }
);

export { router as datatransWebhookRouter };
```

---

## 9. Twint Notes

Twint has no direct developer API. It is available only through a PSP.

| Property | Stripe | Datatrans |
|----------|--------|-----------|
| Payment method identifier | `'twint'` (string in `payment_method_types`) | `'TWI'` (code in `paymentMethods` array) |
| Currency restriction | **CHF only** | **CHF only** |
| Account requirement | Swiss Stripe account | Twint activated on Datatrans merchant |
| Sandbox | Stripe test mode supports Twint | Datatrans sandbox has a Twint simulator |

**Implementation rule:** When the checkout currency is not `CHF`, strip Twint from the `paymentMethods` array before sending to the PSP. If the _only_ requested method was Twint and the currency is not CHF, return a `400` error.

```typescript
function filterPaymentMethods(
  methods: string[],
  currency: string,
  provider: 'stripe' | 'datatrans'
): string[] {
  const twintCode = provider === 'stripe' ? 'twint' : 'TWI';
  if (currency !== 'CHF') {
    return methods.filter(m => m !== twintCode);
  }
  return methods;
}
```

---

## 10. Privacy

The payments module follows the project's zero-trust data exposure principle (PRD 4.5.5).

| Data Point | Stored? | Details |
|------------|---------|---------|
| Player nickname | Yes | `transactions.nickname` -- display name only |
| Player real name | **No** | Never stored in payment records |
| Card number / IBAN | **No** | Handled entirely by the PSP's hosted checkout |
| Phone number | **No** | Not stored in transaction records |
| Email | **No** | Not stored in transaction records |
| Donor message | Yes | Optional free text for donations |
| PSP transaction ID | Yes | `transactions.externalId` -- needed for refunds |

**API responses** for the transaction log return `nickname` only. No PII is ever included.

**Receipts:** The downloadable PDF receipt contains: date, amount, purpose (e.g. "Tournament fee -- Spring Cup 2026"), and nickname. No address, no card details, no phone number.

---

## 11. Edge Cases

### 11.1 Webhook Ordering

Webhooks may arrive out of order or before the frontend redirect completes. The webhook handler must be the single source of truth for payment status.

- Always create the `transactions` record _before_ redirecting to the PSP (status = `pending`).
- The webhook updates the record to `completed` or `failed`.
- If a webhook arrives for an unknown `externalId`, log a warning and return `200` (do not crash).

### 11.2 Idempotency

PSPs may send the same webhook multiple times (retries on timeout, network issues).

- Use `transactions.idempotencyKey` (set to the PSP's event ID / webhook delivery ID).
- Before processing a webhook, check if a transaction with that idempotency key already has a terminal status (`completed`, `failed`, `refunded`). If so, return `200` immediately without re-processing.

```typescript
function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'refunded'].includes(status);
}
```

### 11.3 Partial Refunds

- Track cumulative refunded amount in `transactions.refundedAmount`.
- A refund request for amount `X` must satisfy: `refundedAmount + X <= amount`.
- After a partial refund, set status to `partially_refunded`.
- After a full refund (refundedAmount equals amount), set status to `refunded`.

```typescript
function computeRefundStatus(amount: number, refundedAmount: number): string {
  if (refundedAmount >= amount) return 'refunded';
  if (refundedAmount > 0) return 'partially_refunded';
  return 'completed';
}
```

### 11.4 Currency Mismatch

- Default currency is `CHF` (configurable per use case in `payment_use_cases`).
- If the checkout request specifies a currency different from the use case's configured currency, return `400`.
- Twint is strictly CHF-only (see section 9).

### 11.5 Test Mode vs. Live

- Each provider row in `payment_providers` has a `testMode` flag.
- When `testMode = 1`:
  - Stripe uses `sk_test_` keys and the Stripe test dashboard.
  - Datatrans uses `https://api.sandbox.datatrans.com`.
- When `testMode = 0`:
  - Stripe uses `sk_live_` keys.
  - Datatrans uses `https://api.datatrans.com`.
- The `config` JSON in `payment_providers` stores both test and live keys. The service selects the correct set based on `testMode`.

**Config JSON structure:**

```typescript
interface StripeConfig {
  testSecretKey: string;        // sk_test_...
  liveSecretKey: string;        // sk_live_...
  testPublishableKey: string;   // pk_test_...
  livePublishableKey: string;   // pk_live_...
  testWebhookSecret: string;    // whsec_...
  liveWebhookSecret: string;    // whsec_...
}

interface DatatransConfig {
  merchantId: string;           // same for test and live
  testApiPassword: string;
  liveApiPassword: string;
  hmacKey: string;              // same for test and live
}
```

### 11.6 Provider Not Configured

If a parent tries to pay but no provider is enabled for the use case:

- The checkout endpoint returns `400 { error: 'payments_not_configured' }`.
- The frontend should hide payment buttons when the settings indicate no provider is active (fetch this from a public config endpoint or embed it in the page data).

### 11.7 Webhook Endpoint Downtime

If the server is down when a webhook fires, PSPs retry:

- **Stripe:** retries for up to 3 days with exponential backoff.
- **Datatrans:** retries up to 10 times.

The idempotency check (11.2) ensures that late-arriving retries do not cause double-processing.

### 11.8 Donation Amounts

- The admin sets a `suggestedAmount` (optional) and a `minAmount` (default: 100 centimes = CHF 1.00).
- If the donor enters an amount below `minAmount`, return `400`.
- "Any amount" mode means the frontend shows a free-form input instead of a preset button.

---

## 12. Environment Variables

These are read from `.env`. **Never commit them.**

```
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Datatrans
DATATRANS_MERCHANT_ID=1100012345
DATATRANS_API_PASSWORD=s2s-password
DATATRANS_HMAC_KEY=hex-key
DATATRANS_BASE_URL=https://api.sandbox.datatrans.com

# App
FRONTEND_URL=http://localhost:3000
```

Alternatively, store PSP credentials in the `payment_providers.config` JSON column (managed through the admin settings UI). In that case, environment variables serve as fallback or initial bootstrap values.

---

## 13. Testing Strategy

### Unit tests (`server/src/__tests__/payments.test.ts`)

- **PaymentService facade:** Mock both providers. Verify routing by use case. Verify error when no provider is configured.
- **Idempotency:** Send the same webhook payload twice. Verify the DB is updated only once.
- **Refund math:** Test full refund, partial refund, over-refund rejection.
- **Currency filtering:** Verify Twint is stripped for non-CHF currencies.
- **Signature verification:** Test with valid and tampered payloads for both Stripe and Datatrans.

### Integration tests

- **Stripe test mode:** Use Stripe's test card numbers (`4242424242424242`) to create real Checkout Sessions in test mode and verify the full round-trip.
- **Datatrans sandbox:** Use the sandbox API to initialize transactions and simulate webhooks.

### Local development

- Stripe CLI: `stripe listen --forward-to localhost:3001/api/webhooks/stripe` forwards test webhooks to the local server.
- Datatrans sandbox admin panel: `https://admin.sandbox.datatrans.com` for inspecting test transactions.

---

## 14. Implementation Order

1. **Database schema** -- add the three tables to `database.ts`.
2. **PaymentProvider interface** -- `payment.service.ts` with types and facade.
3. **Stripe service** -- `stripe.service.ts` implementing the interface.
4. **Datatrans service** -- `datatrans.service.ts` implementing the interface.
5. **Webhook routes** -- `stripe.webhook.ts` and `datatrans.webhook.ts`, including the `express.raw()` middleware ordering fix in `index.ts`.
6. **Payments routes** -- `payments.routes.ts` with checkout, transaction log, refund, and settings endpoints.
7. **Tests** -- write tests _before_ each step (test-first, as per project conventions).
8. **Admin UI integration** -- settings page, transaction log page (frontend, out of scope for this blueprint).

---

## References

- PRD section 4.5.12: `requirements/FOOTBALL_TOOL_Attendance_and_Tournament_Management.md`
- Integration research (Stripe + Datatrans API samples): `docs/INTEGRATION_RESEARCH.md`
- Stripe Checkout docs: https://stripe.com/docs/payments/checkout
- Datatrans API reference: https://api-reference.datatrans.ch/
- Datatrans integration docs: https://docs.datatrans.ch/docs
