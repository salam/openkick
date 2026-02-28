# Payments Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional payment collection (tournament fees, merchandise, donations) via Stripe and Datatrans, with admin settings, transaction log, refunds, PDF receipts, and full frontend integration.

**Architecture:** Provider-agnostic facade (`PaymentService` class) with a `PaymentProvider` interface implemented by `StripeProvider` and `DatatransProvider`. Webhook routes mounted before `express.json()` for raw body access. Server-side PDF receipts via PDFKit. Frontend admin pages under `/dashboard/payments/`.

**Tech Stack:** Express.js, sql.js, Stripe SDK (`stripe` npm), raw HTTP for Datatrans, PDFKit for receipts, Next.js App Router + Tailwind for frontend.

---

## Task 1: Database Schema

**Files:**
- Modify: `server/src/database.ts:270` (end of SCHEMA constant, before closing backtick)

**Step 1: Add payment tables to the SCHEMA constant**

Insert before the closing backtick of the `SCHEMA` constant at line 271:

```sql
CREATE TABLE IF NOT EXISTS payment_providers (
  id            TEXT PRIMARY KEY,
  enabled       INTEGER NOT NULL DEFAULT 0,
  config        TEXT NOT NULL DEFAULT '{}',
  testMode      INTEGER NOT NULL DEFAULT 1,
  createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_use_cases (
  id            TEXT PRIMARY KEY,
  enabled       INTEGER NOT NULL DEFAULT 0,
  providerId    TEXT REFERENCES payment_providers(id),
  currency      TEXT NOT NULL DEFAULT 'CHF',
  updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId      TEXT,
  providerId      TEXT NOT NULL,
  useCase         TEXT NOT NULL,
  referenceId     TEXT,
  nickname        TEXT,
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'CHF',
  status          TEXT NOT NULL DEFAULT 'pending',
  refundedAmount  INTEGER NOT NULL DEFAULT 0,
  idempotencyKey  TEXT UNIQUE,
  metadata        TEXT,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Add seed data**

In `initDB()`, after the existing `DEFAULT_SETTINGS` seeding loop (after line 387), add:

```typescript
// Seed payment providers
db.run("INSERT OR IGNORE INTO payment_providers (id, enabled, config) VALUES ('stripe', 0, '{}')");
db.run("INSERT OR IGNORE INTO payment_providers (id, enabled, config) VALUES ('datatrans', 0, '{}')");

// Seed payment use cases
db.run("INSERT OR IGNORE INTO payment_use_cases (id, enabled) VALUES ('tournament_fee', 0)");
db.run("INSERT OR IGNORE INTO payment_use_cases (id, enabled) VALUES ('survey_order', 0)");
db.run("INSERT OR IGNORE INTO payment_use_cases (id, enabled) VALUES ('donation', 0)");
```

**Step 3: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```
git commit -m "feat(payments): add payment_providers, payment_use_cases, transactions tables" -- server/src/database.ts
```

---

## Task 2: Install Dependencies

**Step 1: Install stripe and pdfkit**

```
cd server && npm install stripe pdfkit && npm install -D @types/pdfkit
```

**Step 2: Commit**

```
git restore --staged :/ && git add server/package.json server/package-lock.json && git commit -m "chore: add stripe and pdfkit dependencies" -- server/package.json server/package-lock.json
```

---

## Task 3: PaymentProvider Interface & PaymentService Facade

**Files:**
- Create: `server/src/services/payment.service.ts`
- Test: `server/src/services/__tests__/payment-service.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/payment-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PaymentService } from "../payment.service.js";
import type { PaymentProvider, CheckoutParams, CheckoutResult, RefundParams, RefundResult, WebhookVerification, TransactionStatus } from "../payment.service.js";

function createMockProvider(name: "stripe" | "datatrans"): PaymentProvider {
  return {
    name,
    createCheckout: vi.fn(async (): Promise<CheckoutResult> => ({
      externalId: "ext_123",
      redirectUrl: "https://checkout.example.com",
    })),
    verifyWebhook: vi.fn((): WebhookVerification => ({
      valid: true,
      eventType: "payment.completed",
      externalId: "ext_123",
      rawData: {},
    })),
    refund: vi.fn(async (): Promise<RefundResult> => ({
      success: true,
      refundedAmount: 2500,
    })),
    getTransaction: vi.fn(async (): Promise<TransactionStatus> => ({
      externalId: "ext_123",
      status: "completed",
      amount: 2500,
      currency: "CHF",
    })),
  };
}

describe("PaymentService", () => {
  let service: PaymentService;
  let stripeProvider: PaymentProvider;
  let datatransProvider: PaymentProvider;

  beforeEach(() => {
    service = new PaymentService();
    stripeProvider = createMockProvider("stripe");
    datatransProvider = createMockProvider("datatrans");
    service.register(stripeProvider);
    service.register(datatransProvider);
  });

  it("returns registered provider by name", () => {
    expect(service.getProvider("stripe")).toBe(stripeProvider);
    expect(service.getProvider("datatrans")).toBe(datatransProvider);
  });

  it("throws for unknown provider", () => {
    expect(() => service.getProvider("unknown")).toThrow("Unknown provider");
  });

  it("delegates checkout to the correct provider", async () => {
    const params: CheckoutParams = {
      amount: 2500,
      currency: "CHF",
      description: "Tournament fee",
      referenceId: "event_1",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };
    const result = await service.checkout("stripe", params);
    expect(stripeProvider.createCheckout).toHaveBeenCalledWith(params);
    expect(result.externalId).toBe("ext_123");
  });

  it("delegates refund to the correct provider", async () => {
    const params: RefundParams = {
      externalId: "ext_123",
      amount: 1000,
      currency: "CHF",
    };
    const result = await service.refund("stripe", params);
    expect(stripeProvider.refund).toHaveBeenCalledWith(params);
    expect(result.success).toBe(true);
  });

  it("filterPaymentMethods strips twint for non-CHF (stripe)", () => {
    const result = service.filterPaymentMethods(["card", "twint"], "EUR", "stripe");
    expect(result).toEqual(["card"]);
  });

  it("filterPaymentMethods keeps twint for CHF", () => {
    const result = service.filterPaymentMethods(["card", "twint"], "CHF", "stripe");
    expect(result).toEqual(["card", "twint"]);
  });

  it("filterPaymentMethods strips TWI for non-CHF (datatrans)", () => {
    const result = service.filterPaymentMethods(["VIS", "TWI"], "EUR", "datatrans");
    expect(result).toEqual(["VIS"]);
  });

  it("isTerminalStatus returns correct values", () => {
    expect(PaymentService.isTerminalStatus("completed")).toBe(true);
    expect(PaymentService.isTerminalStatus("failed")).toBe(true);
    expect(PaymentService.isTerminalStatus("refunded")).toBe(true);
    expect(PaymentService.isTerminalStatus("pending")).toBe(false);
    expect(PaymentService.isTerminalStatus("partially_refunded")).toBe(false);
  });

  it("computeRefundStatus returns correct status", () => {
    expect(PaymentService.computeRefundStatus(2500, 2500)).toBe("refunded");
    expect(PaymentService.computeRefundStatus(2500, 1000)).toBe("partially_refunded");
    expect(PaymentService.computeRefundStatus(2500, 0)).toBe("completed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/payment-service.test.ts`
Expected: FAIL - module not found

**Step 3: Implement PaymentService**

Create `server/src/services/payment.service.ts`:

```typescript
export interface CheckoutParams {
  amount: number;
  currency: string;
  description: string;
  referenceId: string;
  nickname?: string;
  paymentMethods?: string[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  externalId: string;
  redirectUrl?: string;
  transactionId?: string;
}

export interface RefundParams {
  externalId: string;
  amount?: number;
  currency: string;
}

export interface RefundResult {
  success: boolean;
  refundedAmount: number;
}

export interface TransactionStatus {
  externalId: string;
  status: "pending" | "completed" | "failed" | "refunded";
  amount: number;
  currency: string;
}

export interface WebhookVerification {
  valid: boolean;
  eventType: string;
  externalId: string;
  rawData: unknown;
}

export interface PaymentProvider {
  readonly name: "stripe" | "datatrans";
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  verifyWebhook(headers: Record<string, string>, rawBody: Buffer | string): WebhookVerification;
  refund(params: RefundParams): Promise<RefundResult>;
  getTransaction(externalId: string): Promise<TransactionStatus>;
}

export class PaymentService {
  private providers: Map<string, PaymentProvider> = new Map();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown provider: ${name}`);
    return provider;
  }

  async checkout(providerName: string, params: CheckoutParams): Promise<CheckoutResult> {
    const provider = this.getProvider(providerName);
    return provider.createCheckout(params);
  }

  async refund(providerName: string, params: RefundParams): Promise<RefundResult> {
    const provider = this.getProvider(providerName);
    return provider.refund(params);
  }

  filterPaymentMethods(
    methods: string[],
    currency: string,
    provider: "stripe" | "datatrans"
  ): string[] {
    const twintCode = provider === "stripe" ? "twint" : "TWI";
    if (currency !== "CHF") {
      return methods.filter((m) => m !== twintCode);
    }
    return methods;
  }

  static isTerminalStatus(status: string): boolean {
    return ["completed", "failed", "refunded"].includes(status);
  }

  static computeRefundStatus(amount: number, refundedAmount: number): string {
    if (refundedAmount >= amount) return "refunded";
    if (refundedAmount > 0) return "partially_refunded";
    return "completed";
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/payment-service.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
git restore --staged :/ && git add server/src/services/payment.service.ts server/src/services/__tests__/payment-service.test.ts && git commit -m "feat(payments): add PaymentProvider interface and PaymentService facade"
```

---

## Task 4: Stripe Service

**Files:**
- Create: `server/src/services/stripe.service.ts`
- Test: `server/src/services/__tests__/stripe-service.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/stripe-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the stripe module before importing our service
const mockCheckoutSessionsCreate = vi.fn();
const mockRefundsCreate = vi.fn();
const mockWebhooksConstructEvent = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: {
        sessions: {
          create: mockCheckoutSessionsCreate,
          retrieve: mockCheckoutSessionsRetrieve,
        },
      },
      refunds: { create: mockRefundsCreate },
      webhooks: { constructEvent: mockWebhooksConstructEvent },
    })),
  };
});

import { StripeProvider } from "../stripe.service.js";

describe("StripeProvider", () => {
  let provider: StripeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new StripeProvider({
      secretKey: "sk_test_fake",
      webhookSecret: "whsec_fake",
    });
  });

  it("has name 'stripe'", () => {
    expect(provider.name).toBe("stripe");
  });

  it("creates a checkout session", async () => {
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });

    const result = await provider.createCheckout({
      amount: 2500,
      currency: "CHF",
      description: "Tournament fee",
      referenceId: "event_1",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    expect(result.externalId).toBe("cs_test_123");
    expect(result.redirectUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        currency: "chf",
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel",
      })
    );
  });

  it("creates a checkout with payment methods including twint", async () => {
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_test_456",
      url: "https://checkout.stripe.com/pay/cs_test_456",
    });

    await provider.createCheckout({
      amount: 1000,
      currency: "CHF",
      description: "Donation",
      referenceId: "donation_1",
      paymentMethods: ["card", "twint"],
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ["card", "twint"],
      })
    );
  });

  it("verifies a valid webhook", () => {
    const fakeEvent = {
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123" } },
    };
    mockWebhooksConstructEvent.mockReturnValue(fakeEvent);

    const result = provider.verifyWebhook(
      { "stripe-signature": "sig_test" },
      Buffer.from("{}")
    );

    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("payment.completed");
    expect(result.externalId).toBe("cs_test_123");
  });

  it("returns invalid for bad webhook signature", () => {
    mockWebhooksConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const result = provider.verifyWebhook(
      { "stripe-signature": "bad_sig" },
      Buffer.from("{}")
    );

    expect(result.valid).toBe(false);
  });

  it("processes a refund", async () => {
    mockRefundsCreate.mockResolvedValue({ amount: 2500 });

    const result = await provider.refund({
      externalId: "pi_test_123",
      amount: 2500,
      currency: "CHF",
    });

    expect(result.success).toBe(true);
    expect(result.refundedAmount).toBe(2500);
  });

  it("retrieves transaction status", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({
      id: "cs_test_123",
      payment_status: "paid",
      amount_total: 2500,
      currency: "chf",
    });

    const result = await provider.getTransaction("cs_test_123");

    expect(result.externalId).toBe("cs_test_123");
    expect(result.status).toBe("completed");
    expect(result.amount).toBe(2500);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/stripe-service.test.ts`
Expected: FAIL - module not found

**Step 3: Implement StripeProvider**

Create `server/src/services/stripe.service.ts`:

```typescript
import Stripe from "stripe";
import type {
  PaymentProvider,
  CheckoutParams,
  CheckoutResult,
  RefundParams,
  RefundResult,
  TransactionStatus,
  WebhookVerification,
} from "./payment.service.js";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey);
    this.webhookSecret = config.webhookSecret;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      currency: params.currency.toLowerCase(),
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: { name: params.description },
            unit_amount: params.amount,
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        referenceId: params.referenceId,
        ...(params.nickname ? { nickname: params.nickname } : {}),
        ...params.metadata,
      },
    };

    if (params.paymentMethods && params.paymentMethods.length > 0) {
      sessionParams.payment_method_types = params.paymentMethods as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams);

    return {
      externalId: session.id,
      redirectUrl: session.url ?? undefined,
    };
  }

  verifyWebhook(
    headers: Record<string, string>,
    rawBody: Buffer | string
  ): WebhookVerification {
    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        headers["stripe-signature"],
        this.webhookSecret
      );

      const eventTypeMap: Record<string, string> = {
        "checkout.session.completed": "payment.completed",
        "checkout.session.expired": "payment.failed",
        "charge.refunded": "refund.completed",
      };

      const sessionData = event.data.object as { id?: string };

      return {
        valid: true,
        eventType: eventTypeMap[event.type] || event.type,
        externalId: sessionData.id || "",
        rawData: event,
      };
    } catch {
      return {
        valid: false,
        eventType: "",
        externalId: "",
        rawData: null,
      };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: params.externalId,
    };
    if (params.amount !== undefined) {
      refundParams.amount = params.amount;
    }

    const refund = await this.stripe.refunds.create(refundParams);

    return {
      success: true,
      refundedAmount: refund.amount,
    };
  }

  async getTransaction(externalId: string): Promise<TransactionStatus> {
    const session = await this.stripe.checkout.sessions.retrieve(externalId);

    const statusMap: Record<string, TransactionStatus["status"]> = {
      paid: "completed",
      unpaid: "pending",
      no_payment_required: "completed",
    };

    return {
      externalId: session.id,
      status: statusMap[session.payment_status] || "pending",
      amount: session.amount_total || 0,
      currency: (session.currency || "chf").toUpperCase(),
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/stripe-service.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
git restore --staged :/ && git add server/src/services/stripe.service.ts server/src/services/__tests__/stripe-service.test.ts && git commit -m "feat(payments): add Stripe provider implementation"
```

---

## Task 5: Datatrans Service

**Files:**
- Create: `server/src/services/datatrans.service.ts`
- Test: `server/src/services/__tests__/datatrans-service.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/datatrans-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { DatatransProvider } from "../datatrans.service.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("DatatransProvider", () => {
  let provider: DatatransProvider;
  const config = {
    merchantId: "1100012345",
    apiPassword: "test-password",
    hmacKey: crypto.randomBytes(32).toString("hex"),
    baseUrl: "https://api.sandbox.datatrans.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DatatransProvider(config);
  });

  it("has name 'datatrans'", () => {
    expect(provider.name).toBe("datatrans");
  });

  it("creates a checkout session via init endpoint", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ transactionId: "txn_dt_123" }),
    });

    const result = await provider.createCheckout({
      amount: 2500,
      currency: "CHF",
      description: "Tournament fee",
      referenceId: "event_1",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    expect(result.externalId).toBe("txn_dt_123");
    expect(result.transactionId).toBe("txn_dt_123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sandbox.datatrans.com/v1/transactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("verifies a valid webhook signature", () => {
    const rawBody = '{"transactionId":"txn_dt_123","status":"settled"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = timestamp + rawBody;
    const hmac = crypto
      .createHmac("sha256", Buffer.from(config.hmacKey, "hex"))
      .update(signedPayload)
      .digest("hex");
    const sigHeader = `t=${timestamp},s0=${hmac}`;

    const result = provider.verifyWebhook(
      { "datatrans-signature": sigHeader },
      rawBody
    );

    expect(result.valid).toBe(true);
    expect(result.externalId).toBe("txn_dt_123");
    expect(result.eventType).toBe("payment.completed");
  });

  it("rejects invalid webhook signature", () => {
    const result = provider.verifyWebhook(
      { "datatrans-signature": "t=123,s0=bad" },
      '{"transactionId":"txn_dt_123"}'
    );

    expect(result.valid).toBe(false);
  });

  it("processes a refund", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await provider.refund({
      externalId: "txn_dt_123",
      amount: 2500,
      currency: "CHF",
    });

    expect(result.success).toBe(true);
    expect(result.refundedAmount).toBe(2500);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sandbox.datatrans.com/v1/transactions/txn_dt_123/credit",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("retrieves transaction status", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        transactionId: "txn_dt_123",
        status: "settled",
        detail: { authorize: { amount: 2500, currency: "CHF" } },
      }),
    });

    const result = await provider.getTransaction("txn_dt_123");

    expect(result.externalId).toBe("txn_dt_123");
    expect(result.status).toBe("completed");
    expect(result.amount).toBe(2500);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/datatrans-service.test.ts`
Expected: FAIL - module not found

**Step 3: Implement DatatransProvider**

Create `server/src/services/datatrans.service.ts`:

```typescript
import crypto from "node:crypto";
import type {
  PaymentProvider,
  CheckoutParams,
  CheckoutResult,
  RefundParams,
  RefundResult,
  TransactionStatus,
  WebhookVerification,
} from "./payment.service.js";

export interface DatatransConfig {
  merchantId: string;
  apiPassword: string;
  hmacKey: string;
  baseUrl: string;
}

export class DatatransProvider implements PaymentProvider {
  readonly name = "datatrans" as const;
  private config: DatatransConfig;

  constructor(config: DatatransConfig) {
    this.config = config;
  }

  private get authHeader(): string {
    const credentials = Buffer.from(
      `${this.config.merchantId}:${this.config.apiPassword}`
    ).toString("base64");
    return `Basic ${credentials}`;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const body: Record<string, unknown> = {
      currency: params.currency,
      refno: params.referenceId,
      amount: params.amount,
      redirect: {
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        errorUrl: params.cancelUrl,
      },
    };

    if (params.paymentMethods && params.paymentMethods.length > 0) {
      body.paymentMethods = params.paymentMethods;
    }

    const response = await fetch(
      `${this.config.baseUrl}/v1/transactions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Datatrans init failed: ${response.status} ${error}`);
    }

    const data = (await response.json()) as { transactionId: string };

    return {
      externalId: data.transactionId,
      transactionId: data.transactionId,
    };
  }

  verifyWebhook(
    headers: Record<string, string>,
    rawBody: Buffer | string
  ): WebhookVerification {
    const sigHeader = headers["datatrans-signature"];
    if (!sigHeader) {
      return { valid: false, eventType: "", externalId: "", rawData: null };
    }

    const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");

    try {
      const parts = Object.fromEntries(
        sigHeader.split(",").map((p) => {
          const [k, v] = p.split("=", 2);
          return [k, v];
        })
      );

      const signedPayload = parts["t"] + bodyStr;
      const hmacKey = Buffer.from(this.config.hmacKey, "hex");
      const expected = crypto
        .createHmac("sha256", hmacKey)
        .update(signedPayload)
        .digest("hex");

      const valid = crypto.timingSafeEqual(
        Buffer.from(parts["s0"], "hex"),
        Buffer.from(expected, "hex")
      );

      if (!valid) {
        return { valid: false, eventType: "", externalId: "", rawData: null };
      }

      const payload = JSON.parse(bodyStr);
      const statusMap: Record<string, string> = {
        settled: "payment.completed",
        authorized: "payment.completed",
        canceled: "payment.failed",
        failed: "payment.failed",
      };

      return {
        valid: true,
        eventType: statusMap[payload.status] || payload.status,
        externalId: payload.transactionId || "",
        rawData: payload,
      };
    } catch {
      return { valid: false, eventType: "", externalId: "", rawData: null };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const body: Record<string, unknown> = {
      currency: params.currency,
    };
    if (params.amount !== undefined) {
      body.amount = params.amount;
    }

    const response = await fetch(
      `${this.config.baseUrl}/v1/transactions/${params.externalId}/credit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Datatrans refund failed: ${response.status} ${error}`);
    }

    return {
      success: true,
      refundedAmount: params.amount || 0,
    };
  }

  async getTransaction(externalId: string): Promise<TransactionStatus> {
    const response = await fetch(
      `${this.config.baseUrl}/v1/transactions/${externalId}`,
      {
        method: "GET",
        headers: { Authorization: this.authHeader },
      }
    );

    if (!response.ok) {
      throw new Error(`Datatrans status check failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      transactionId: string;
      status: string;
      detail?: { authorize?: { amount?: number; currency?: string } };
    };

    const statusMap: Record<string, TransactionStatus["status"]> = {
      settled: "completed",
      authorized: "completed",
      canceled: "failed",
      failed: "failed",
      transmitted: "pending",
      initialized: "pending",
    };

    return {
      externalId: data.transactionId,
      status: statusMap[data.status] || "pending",
      amount: data.detail?.authorize?.amount || 0,
      currency: (data.detail?.authorize?.currency || "CHF").toUpperCase(),
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/datatrans-service.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
git restore --staged :/ && git add server/src/services/datatrans.service.ts server/src/services/__tests__/datatrans-service.test.ts && git commit -m "feat(payments): add Datatrans provider implementation"
```

---

## Task 6: Webhook Routes

**Files:**
- Create: `server/src/routes/webhooks/stripe.webhook.ts`
- Create: `server/src/routes/webhooks/datatrans.webhook.ts`
- Modify: `server/src/index.ts` (mount webhook routes BEFORE `express.json()`)

**Step 1: Create the webhooks directory**

```
mkdir -p server/src/routes/webhooks
```

**Step 2: Create Stripe webhook route**

Create `server/src/routes/webhooks/stripe.webhook.ts`:

```typescript
import express from "express";
import { getDB } from "../../database.js";
import type { PaymentService } from "../../services/payment.service.js";

export function createStripeWebhookRouter(paymentService: PaymentService) {
  const router = express.Router();

  router.post(
    "/",
    express.raw({ type: "application/json" }),
    (req, res) => {
      let provider;
      try {
        provider = paymentService.getProvider("stripe");
      } catch {
        res.json({ received: true });
        return;
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers[key] = value;
      }

      const verification = provider.verifyWebhook(headers, req.body);

      if (!verification.valid) {
        res.status(400).json({ error: "Invalid signature" });
        return;
      }

      const db = getDB();

      // Idempotency check
      const existing = db.exec(
        "SELECT status FROM transactions WHERE externalId = ? AND status IN ('completed', 'failed', 'refunded')",
        [verification.externalId]
      );
      if (existing.length > 0 && existing[0].values.length > 0) {
        res.json({ received: true });
        return;
      }

      if (verification.eventType === "payment.completed") {
        db.run(
          "UPDATE transactions SET status = 'completed', updatedAt = datetime('now') WHERE externalId = ?",
          [verification.externalId]
        );
      } else if (verification.eventType === "payment.failed") {
        db.run(
          "UPDATE transactions SET status = 'failed', updatedAt = datetime('now') WHERE externalId = ?",
          [verification.externalId]
        );
      }

      res.json({ received: true });
    }
  );

  return router;
}
```

**Step 3: Create Datatrans webhook route**

Create `server/src/routes/webhooks/datatrans.webhook.ts`:

```typescript
import express from "express";
import { getDB } from "../../database.js";
import type { PaymentService } from "../../services/payment.service.js";

export function createDatatransWebhookRouter(paymentService: PaymentService) {
  const router = express.Router();

  router.post(
    "/",
    express.raw({ type: "application/json" }),
    (req, res) => {
      let provider;
      try {
        provider = paymentService.getProvider("datatrans");
      } catch {
        res.json({ received: true });
        return;
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers[key] = value;
      }

      const rawBody = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
      const verification = provider.verifyWebhook(headers, rawBody);

      if (!verification.valid) {
        res.status(400).json({ error: "Invalid signature" });
        return;
      }

      const db = getDB();

      // Idempotency check
      const existing = db.exec(
        "SELECT status FROM transactions WHERE externalId = ? AND status IN ('completed', 'failed', 'refunded')",
        [verification.externalId]
      );
      if (existing.length > 0 && existing[0].values.length > 0) {
        res.json({ received: true });
        return;
      }

      if (verification.eventType === "payment.completed") {
        db.run(
          "UPDATE transactions SET status = 'completed', updatedAt = datetime('now') WHERE externalId = ?",
          [verification.externalId]
        );
      } else if (verification.eventType === "payment.failed") {
        db.run(
          "UPDATE transactions SET status = 'failed', updatedAt = datetime('now') WHERE externalId = ?",
          [verification.externalId]
        );
      }

      res.json({ received: true });
    }
  );

  return router;
}
```

**Step 4: Mount webhook routes in index.ts BEFORE `express.json()`**

In `server/src/index.ts`, add imports at the top (after line 38):

```typescript
import { createStripeWebhookRouter } from "./routes/webhooks/stripe.webhook.js";
import { createDatatransWebhookRouter } from "./routes/webhooks/datatrans.webhook.js";
import { PaymentService } from "./services/payment.service.js";
```

Then, BEFORE `app.use(express.json())` (currently line 44), insert:

```typescript
// Payment webhook routes MUST come before express.json() for raw body access
const paymentService = new PaymentService();
app.use("/api/webhooks/stripe", createStripeWebhookRouter(paymentService));
app.use("/api/webhooks/datatrans", createDatatransWebhookRouter(paymentService));
```

Move `app.use(express.json());` to AFTER these lines.

Also export `paymentService` for use by the payments router:

```typescript
export { paymentService };
```

**Step 5: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```
git restore --staged :/ && git add server/src/routes/webhooks/stripe.webhook.ts server/src/routes/webhooks/datatrans.webhook.ts server/src/index.ts && git commit -m "feat(payments): add webhook routes with raw body handling"
```

---

## Task 7: Payment Routes (Checkout, Transactions, Refund, Settings)

**Files:**
- Create: `server/src/routes/payments.ts`
- Test: `server/src/routes/__tests__/payments.test.ts`

**Step 1: Write the failing test**

Create `server/src/routes/__tests__/payments.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "sql.js";

// Mock stripe before importing app
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  })),
}));

import request from "supertest";
import { initDB } from "../../database.js";
import { generateJWT } from "../../auth.js";

const { default: app } = await import("../../index.js");

let db: Database;

function adminToken(): string {
  return generateJWT({ id: 1, role: "admin" });
}

function seedAdmin(db: Database) {
  db.run(
    "INSERT OR IGNORE INTO guardians (id, phone, name, role, passwordHash) VALUES (1, '+41790000000', 'Admin', 'admin', 'hash')"
  );
}

describe("Payment Routes", () => {
  beforeEach(async () => {
    db = await initDB();
    seedAdmin(db);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  describe("GET /api/admin/payments/settings", () => {
    it("returns providers and use cases", async () => {
      const res = await request(app)
        .get("/api/admin/payments/settings")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.providers).toHaveLength(2);
      expect(res.body.useCases).toHaveLength(3);
    });

    it("masks secrets in config", async () => {
      db.run(
        "UPDATE payment_providers SET config = ? WHERE id = 'stripe'",
        [JSON.stringify({ testSecretKey: "sk_test_abc123xyz789" })]
      );

      const res = await request(app)
        .get("/api/admin/payments/settings")
        .set("Authorization", `Bearer ${adminToken()}`);

      const stripe = res.body.providers.find((p: { id: string }) => p.id === "stripe");
      const config = JSON.parse(stripe.config);
      expect(config.testSecretKey).toBe("****x789");
    });

    it("rejects non-admin", async () => {
      const parentToken = generateJWT({ id: 2, role: "parent" });
      const res = await request(app)
        .get("/api/admin/payments/settings")
        .set("Authorization", `Bearer ${parentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("PUT /api/admin/payments/settings", () => {
    it("updates provider config", async () => {
      const res = await request(app)
        .put("/api/admin/payments/settings")
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({
          providers: [{
            id: "stripe",
            enabled: true,
            config: { testSecretKey: "sk_test_new" },
            testMode: true,
          }],
        });

      expect(res.status).toBe(200);
      expect(res.body.providers.find((p: { id: string }) => p.id === "stripe").enabled).toBe(1);
    });
  });

  describe("POST /api/payments/checkout", () => {
    it("returns 400 when no provider is configured", async () => {
      const res = await request(app)
        .post("/api/payments/checkout")
        .send({
          useCase: "tournament_fee",
          amount: 2500,
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not configured/i);
    });

    it("returns 400 when amount is missing", async () => {
      const res = await request(app)
        .post("/api/payments/checkout")
        .send({
          useCase: "tournament_fee",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/admin/payments/transactions", () => {
    it("returns paginated transactions", async () => {
      db.run(
        "INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)",
        ["ext_1", "stripe", "tournament_fee", 2500, "CHF", "completed"]
      );

      const res = await request(app)
        .get("/api/admin/payments/transactions")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it("filters by useCase", async () => {
      db.run("INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)", ["ext_1", "stripe", "tournament_fee", 2500, "CHF", "completed"]);
      db.run("INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)", ["ext_2", "stripe", "donation", 1000, "CHF", "completed"]);

      const res = await request(app)
        .get("/api/admin/payments/transactions?useCase=donation")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].useCase).toBe("donation");
    });
  });

  describe("POST /api/admin/payments/refund/:id", () => {
    it("returns 404 for non-existent transaction", async () => {
      const res = await request(app)
        .post("/api/admin/payments/refund/999")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(res.status).toBe(404);
    });

    it("returns 400 for already fully refunded transaction", async () => {
      db.run(
        "INSERT INTO transactions (id, externalId, providerId, useCase, amount, currency, status, refundedAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [1, "ext_1", "stripe", "tournament_fee", 2500, "CHF", "refunded", 2500]
      );

      const res = await request(app)
        .post("/api/admin/payments/refund/1")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already.*refunded/i);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/payments.test.ts`
Expected: FAIL - route not found / 404

**Step 3: Implement payment routes**

Create `server/src/routes/payments.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { getDB, getLastInsertId } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";
import { PaymentService } from "../services/payment.service.js";
import { generateReceipt } from "../services/receipt.service.js";

export function createPaymentsRouter(paymentService: PaymentService) {
  const router = Router();

  // --- Public: Checkout ---
  router.post("/payments/checkout", async (req: Request, res: Response) => {
    const { useCase, referenceId, nickname, amount, currency, paymentMethods, donorMessage, successUrl, cancelUrl } = req.body;

    if (!useCase || !amount || !successUrl || !cancelUrl) {
      res.status(400).json({ error: "useCase, amount, successUrl, and cancelUrl are required" });
      return;
    }

    const db = getDB();

    const ucResult = db.exec(
      "SELECT enabled, providerId, currency FROM payment_use_cases WHERE id = ?",
      [useCase]
    );

    if (ucResult.length === 0 || ucResult[0].values.length === 0) {
      res.status(400).json({ error: "Unknown use case" });
      return;
    }

    const [ucEnabled, providerId, ucCurrency] = ucResult[0].values[0] as [number, string, string];

    if (!ucEnabled || !providerId) {
      res.status(400).json({ error: "Payments not configured for this use case" });
      return;
    }

    const provResult = db.exec(
      "SELECT enabled, config, testMode FROM payment_providers WHERE id = ?",
      [providerId]
    );

    if (provResult.length === 0 || provResult[0].values.length === 0 || !(provResult[0].values[0][0] as number)) {
      res.status(400).json({ error: "Payment provider not enabled" });
      return;
    }

    const requestCurrency = currency || ucCurrency || "CHF";

    if (ucCurrency && requestCurrency !== ucCurrency) {
      res.status(400).json({ error: `Currency mismatch: expected ${ucCurrency}, got ${requestCurrency}` });
      return;
    }

    let methods = paymentMethods;
    if (methods && methods.length > 0) {
      methods = paymentService.filterPaymentMethods(methods, requestCurrency, providerId as "stripe" | "datatrans");
      if (methods.length === 0) {
        res.status(400).json({ error: "No valid payment methods for this currency" });
        return;
      }
    }

    const metadata = donorMessage ? JSON.stringify({ donorMessage }) : null;
    db.run(
      `INSERT INTO transactions (externalId, providerId, useCase, referenceId, nickname, amount, currency, status, metadata)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [providerId, useCase, referenceId || null, nickname || null, amount, requestCurrency, metadata]
    );
    const internalId = getLastInsertId();

    try {
      const result = await paymentService.checkout(providerId, {
        amount,
        currency: requestCurrency,
        description: `${useCase} - ${referenceId || "general"}`,
        referenceId: referenceId || `txn_${internalId}`,
        nickname,
        paymentMethods: methods,
        successUrl,
        cancelUrl,
        metadata: { internalId: String(internalId) },
      });

      db.run(
        "UPDATE transactions SET externalId = ?, updatedAt = datetime('now') WHERE id = ?",
        [result.externalId, internalId]
      );

      res.json({
        provider: providerId,
        redirectUrl: result.redirectUrl,
        transactionId: result.transactionId,
        internalTransactionId: internalId,
      });
    } catch (err) {
      db.run("UPDATE transactions SET status = 'failed', updatedAt = datetime('now') WHERE id = ?", [internalId]);
      console.error("Checkout error:", err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // --- Admin: Payment Settings ---
  router.get(
    "/admin/payments/settings",
    authMiddleware,
    requireRole("admin"),
    (_req: Request, res: Response) => {
      const db = getDB();

      const providers = db.exec("SELECT id, enabled, config, testMode, createdAt, updatedAt FROM payment_providers ORDER BY id");
      const useCases = db.exec("SELECT id, enabled, providerId, currency, updatedAt FROM payment_use_cases ORDER BY id");

      const providerRows = (providers[0]?.values || []).map((row) => {
        const config = row[2] as string;
        let maskedConfig = config;
        try {
          const parsed = JSON.parse(config);
          const masked: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            const val = String(v);
            masked[k] = val.length > 4 ? `****${val.slice(-4)}` : val;
          }
          maskedConfig = JSON.stringify(masked);
        } catch { /* keep original */ }

        return {
          id: row[0], enabled: row[1], config: maskedConfig,
          testMode: row[3], createdAt: row[4], updatedAt: row[5],
        };
      });

      const useCaseRows = (useCases[0]?.values || []).map((row) => ({
        id: row[0], enabled: row[1], providerId: row[2], currency: row[3], updatedAt: row[4],
      }));

      res.json({ providers: providerRows, useCases: useCaseRows });
    }
  );

  router.put(
    "/admin/payments/settings",
    authMiddleware,
    requireRole("admin"),
    (req: Request, res: Response) => {
      const { providers, useCases } = req.body;
      const db = getDB();

      if (providers && Array.isArray(providers)) {
        for (const p of providers) {
          const configStr = typeof p.config === "string" ? p.config : JSON.stringify(p.config || {});
          db.run(
            "UPDATE payment_providers SET enabled = ?, config = ?, testMode = ?, updatedAt = datetime('now') WHERE id = ?",
            [p.enabled ? 1 : 0, configStr, p.testMode ? 1 : 0, p.id]
          );
        }
      }

      if (useCases && Array.isArray(useCases)) {
        for (const uc of useCases) {
          db.run(
            "UPDATE payment_use_cases SET enabled = ?, providerId = ?, currency = ?, updatedAt = datetime('now') WHERE id = ?",
            [uc.enabled ? 1 : 0, uc.providerId || null, uc.currency || "CHF", uc.id]
          );
        }
      }

      const updatedProviders = db.exec("SELECT id, enabled, config, testMode, createdAt, updatedAt FROM payment_providers ORDER BY id");
      const updatedUseCases = db.exec("SELECT id, enabled, providerId, currency, updatedAt FROM payment_use_cases ORDER BY id");

      res.json({
        providers: (updatedProviders[0]?.values || []).map((row) => ({
          id: row[0], enabled: row[1], config: row[2], testMode: row[3], createdAt: row[4], updatedAt: row[5],
        })),
        useCases: (updatedUseCases[0]?.values || []).map((row) => ({
          id: row[0], enabled: row[1], providerId: row[2], currency: row[3], updatedAt: row[4],
        })),
      });
    }
  );

  // --- Admin: Transaction Log ---
  router.get(
    "/admin/payments/transactions",
    authMiddleware,
    requireRole("admin"),
    (req: Request, res: Response) => {
      const db = getDB();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      let where = "1=1";
      const params: unknown[] = [];

      if (req.query.useCase) {
        where += " AND useCase = ?";
        params.push(req.query.useCase);
      }
      if (req.query.status) {
        where += " AND status = ?";
        params.push(req.query.status);
      }

      const countResult = db.exec(`SELECT COUNT(*) FROM transactions WHERE ${where}`, params);
      const total = (countResult[0]?.values[0]?.[0] as number) || 0;

      const result = db.exec(
        `SELECT id, providerId, useCase, nickname, amount, currency, status, refundedAmount, createdAt
         FROM transactions WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const transactions = (result[0]?.values || []).map((row) => ({
        id: row[0], provider: row[1], useCase: row[2], nickname: row[3],
        amount: row[4], currency: row[5], status: row[6], refundedAmount: row[7], createdAt: row[8],
      }));

      res.json({ transactions, total, page, limit });
    }
  );

  // --- Admin: Refund ---
  router.post(
    "/admin/payments/refund/:transactionId",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      const db = getDB();
      const txnId = parseInt(req.params.transactionId);
      const { amount } = req.body;

      const result = db.exec(
        "SELECT id, externalId, providerId, amount, currency, status, refundedAmount FROM transactions WHERE id = ?",
        [txnId]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }

      const row = result[0].values[0];
      const [, externalId, providerId, txnAmount, currency, status, refundedAmount] = row as [number, string, string, number, string, string, number];

      if (status === "refunded") {
        res.status(400).json({ error: "Transaction already fully refunded" });
        return;
      }

      if (status !== "completed" && status !== "partially_refunded") {
        res.status(400).json({ error: `Cannot refund transaction with status: ${status}` });
        return;
      }

      const refundAmount = amount || (txnAmount - refundedAmount);
      const remaining = txnAmount - refundedAmount;

      if (refundAmount > remaining) {
        res.status(400).json({ error: `Refund amount (${refundAmount}) exceeds remaining balance (${remaining})` });
        return;
      }

      try {
        await paymentService.refund(providerId, {
          externalId,
          amount: refundAmount,
          currency,
        });

        const newRefundedAmount = refundedAmount + refundAmount;
        const newStatus = PaymentService.computeRefundStatus(txnAmount, newRefundedAmount);

        db.run(
          "UPDATE transactions SET refundedAmount = ?, status = ?, updatedAt = datetime('now') WHERE id = ?",
          [newRefundedAmount, newStatus, txnId]
        );

        res.json({
          transactionId: txnId,
          refundedAmount: newRefundedAmount,
          status: newStatus,
        });
      } catch (err) {
        console.error("Refund error:", err);
        res.status(500).json({ error: "Failed to process refund" });
      }
    }
  );

  // --- Receipt Download (authenticated) ---
  router.get(
    "/payments/receipt/:transactionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      const db = getDB();
      const txnId = parseInt(req.params.transactionId);

      const result = db.exec(
        "SELECT id, useCase, referenceId, nickname, amount, currency, status, createdAt FROM transactions WHERE id = ?",
        [txnId]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }

      const row = result[0].values[0];
      const [id, useCase, referenceId, nickname, amount, currency, status, createdAt] = row as [number, string, string | null, string | null, number, string, string, string];

      if (status !== "completed" && status !== "partially_refunded" && status !== "refunded") {
        res.status(400).json({ error: "Receipt available only for completed payments" });
        return;
      }

      try {
        const pdf = await generateReceipt({
          transactionId: id,
          amount,
          currency,
          useCase,
          nickname: nickname || undefined,
          date: createdAt,
          description: referenceId || useCase,
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="receipt-${id}.pdf"`);
        res.send(pdf);
      } catch (err) {
        console.error("Receipt generation error:", err);
        res.status(500).json({ error: "Failed to generate receipt" });
      }
    }
  );

  return router;
}
```

**Step 4: Register payments router in index.ts**

In `server/src/index.ts`, add import:

```typescript
import { createPaymentsRouter } from "./routes/payments.js";
```

After the webhook routes and `express.json()`, add:

```typescript
app.use("/api", createPaymentsRouter(paymentService));
```

**Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/payments.test.ts`
Expected: All tests PASS

**Step 6: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```
git restore --staged :/ && git add server/src/routes/payments.ts server/src/routes/__tests__/payments.test.ts server/src/index.ts && git commit -m "feat(payments): add checkout, transaction log, refund, settings, and receipt routes"
```

---

## Task 8: Receipt Service (PDF Generation)

**Files:**
- Create: `server/src/services/receipt.service.ts`
- Test: `server/src/services/__tests__/receipt-service.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/receipt-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../database.js", () => ({
  getDB: vi.fn(() => ({
    exec: vi.fn().mockReturnValue([{
      values: [["My Club"]],
    }]),
  })),
}));

import { generateReceipt } from "../receipt.service.js";

describe("Receipt Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a PDF buffer", async () => {
    const buffer = await generateReceipt({
      transactionId: 1,
      amount: 2500,
      currency: "CHF",
      useCase: "tournament_fee",
      nickname: "Max M.",
      date: "2026-03-01T10:00:00Z",
      description: "Spring Cup 2026",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PDF files start with %PDF
    expect(buffer.toString("ascii", 0, 4)).toBe("%PDF");
  });

  it("generates receipt without nickname", async () => {
    const buffer = await generateReceipt({
      transactionId: 2,
      amount: 1050,
      currency: "CHF",
      useCase: "donation",
      date: "2026-03-01T12:00:00Z",
      description: "Donation",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/receipt-service.test.ts`
Expected: FAIL - module not found

**Step 3: Implement receipt service**

Create `server/src/services/receipt.service.ts`:

```typescript
import PDFDocument from "pdfkit";
import { getDB } from "../database.js";

export interface ReceiptData {
  transactionId: number;
  amount: number;
  currency: string;
  useCase: string;
  nickname?: string;
  date: string;
  description: string;
}

function getClubName(): string {
  try {
    const db = getDB();
    const result = db.exec("SELECT value FROM settings WHERE key = 'club_name'");
    return (result[0]?.values[0]?.[0] as string) || "OpenKick";
  } catch {
    return "OpenKick";
  }
}

function formatAmount(centimes: number, currency: string): string {
  const major = (centimes / 100).toFixed(2);
  return `${currency} ${major}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const useCaseLabels: Record<string, string> = {
  tournament_fee: "Tournament participation fee",
  survey_order: "Merchandise order",
  donation: "Donation",
};

export function generateReceipt(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const clubName = getClubName();

    // Header
    doc.fontSize(20).text(clubName, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).text("Payment Receipt", { align: "center" });
    doc.moveDown(1.5);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Details
    doc.fontSize(11);

    const details: [string, string][] = [
      ["Receipt No.", `#${data.transactionId}`],
      ["Date", formatDate(data.date)],
      ["Purpose", useCaseLabels[data.useCase] || data.useCase],
      ["Description", data.description],
      ["Amount", formatAmount(data.amount, data.currency)],
    ];

    if (data.nickname) {
      details.push(["Player", data.nickname]);
    }

    for (const [label, value] of details) {
      doc.font("Helvetica-Bold").text(`${label}:`, { continued: true });
      doc.font("Helvetica").text(`  ${value}`);
      doc.moveDown(0.3);
    }

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.fontSize(9).fillColor("#666666");
    doc.text(
      "This is an automatically generated receipt. No signature required.",
      { align: "center" }
    );

    doc.end();
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/receipt-service.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
git restore --staged :/ && git add server/src/services/receipt.service.ts server/src/services/__tests__/receipt-service.test.ts && git commit -m "feat(payments): add PDF receipt generation service"
```

---

## Task 9: Provider Initialization (Wire Stripe & Datatrans from DB Config)

**Files:**
- Modify: `server/src/index.ts`

**Step 1: Add provider initialization in the `main()` function**

In `server/src/index.ts`, add imports:

```typescript
import { StripeProvider } from "./services/stripe.service.js";
import { DatatransProvider } from "./services/datatrans.service.js";
```

Inside `main()`, after `const db = getDB();`, add:

```typescript
  // Initialize payment providers from DB config
  function initPaymentProviders() {
    const db = getDB();
    const providers = db.exec("SELECT id, enabled, config, testMode FROM payment_providers");
    if (providers.length === 0) return;

    for (const row of providers[0].values) {
      const [id, enabled, configJson, testMode] = row as [string, number, string, number];
      if (!enabled) continue;

      try {
        const config = JSON.parse(configJson);
        if (id === "stripe") {
          const secretKey = testMode ? (config.testSecretKey || process.env.STRIPE_SECRET_KEY) : (config.liveSecretKey || process.env.STRIPE_SECRET_KEY);
          const webhookSecret = testMode ? (config.testWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET) : (config.liveWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET);
          if (secretKey && webhookSecret) {
            paymentService.register(new StripeProvider({ secretKey, webhookSecret }));
          }
        } else if (id === "datatrans") {
          const merchantId = config.merchantId || process.env.DATATRANS_MERCHANT_ID;
          const apiPassword = testMode ? (config.testApiPassword || process.env.DATATRANS_API_PASSWORD) : (config.liveApiPassword || process.env.DATATRANS_API_PASSWORD);
          const hmacKey = config.hmacKey || process.env.DATATRANS_HMAC_KEY;
          const baseUrl = testMode ? "https://api.sandbox.datatrans.com" : "https://api.datatrans.com";
          if (merchantId && apiPassword && hmacKey) {
            paymentService.register(new DatatransProvider({ merchantId, apiPassword, hmacKey, baseUrl }));
          }
        }
      } catch (err) {
        console.error(`Failed to initialize payment provider ${id}:`, err);
      }
    }
  }

  initPaymentProviders();
```

**Step 2: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```
git commit -m "feat(payments): wire provider initialization from DB config" -- server/src/index.ts
```

---

## Task 10: Frontend - Payment Settings Admin Page

**Files:**
- Create: `web/src/app/dashboard/payments/page.tsx`
- Create: `web/src/app/dashboard/payments/settings/page.tsx`
- Modify: `web/src/lib/i18n.ts` (add payment translation keys)
- Modify: `web/src/components/Navbar.tsx` (add payments nav link)

**Step 1: Create directories**

```
mkdir -p web/src/app/dashboard/payments/settings
```

**Step 2: Create transaction log page** (`web/src/app/dashboard/payments/page.tsx`)

A standard admin page using the project patterns:
- `'use client'` directive
- Uses `apiFetch` from `@/lib/api`
- Uses `t()` from `@/lib/i18n` for translations
- Tailwind CSS styling matching existing dashboard pages
- Paginated table showing: ID, date, type, player, amount, status, actions (refund + receipt download)
- Filter dropdowns for useCase and status
- Refund button calls `POST /api/admin/payments/refund/:id`
- Receipt link points to `GET /api/payments/receipt/:id`

**Step 3: Create settings page** (`web/src/app/dashboard/payments/settings/page.tsx`)

Admin settings page:
- Toggle enable/disable for each provider (Stripe, Datatrans)
- Toggle test mode per provider
- Password-type input fields for API keys (per provider, see `providerFields` map in blueprint)
- Use case configuration: enable/disable, select provider, select currency
- Save button calls `PUT /api/admin/payments/settings`
- Back/cancel link to `/dashboard/payments`

**Step 4: Add i18n keys**

Add translation keys for both English and German to `web/src/lib/i18n.ts`:
- `payments_title`, `payments_settings`, `payments_all_types`, `payments_tournament_fee`, `payments_merchandise`, `payments_donation`
- `payments_all_statuses`, `payments_completed`, `payments_pending`, `payments_failed`, `payments_refunded`
- `payments_no_transactions`, `payments_date`, `payments_type`, `payments_player`, `payments_amount`, `payments_status`, `payments_actions`
- `payments_refund`, `payments_receipt`, `payments_confirm_refund`, `payments_showing`, `payments_of`
- `payments_enabled`, `payments_test_mode`, `payments_use_cases`, `payments_provider`, `payments_currency`, `payments_none`

**Step 5: Add Payments link to Navbar**

In `web/src/components/Navbar.tsx`, add a nav link for payments alongside other admin navigation items:

```tsx
<Link href="/dashboard/payments">{t('payments_title') || 'Payments'}</Link>
```

**Step 6: Verify frontend compiles**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 7: Commit**

```
git restore --staged :/ && git add web/src/app/dashboard/payments/ web/src/lib/i18n.ts web/src/components/Navbar.tsx && git commit -m "feat(payments): add admin payments dashboard and settings pages"
```

---

## Task 11: Update Documentation

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`
- Verify: `docs/guides/PAYMENTS_SETUP.md`

**Step 1: Update FEATURES.md** - mark payment items as completed

**Step 2: Update RELEASE_NOTES.md** - add new release section with payment features

**Step 3: Verify PAYMENTS_SETUP.md** - check endpoint paths match implementation

**Step 4: Commit**

```
git restore --staged :/ && git add FEATURES.md RELEASE_NOTES.md docs/guides/PAYMENTS_SETUP.md && git commit -m "docs: update features, release notes, and payment setup guide"
```

---

## Task 12: Final Verification

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 2: Run server build**

Run: `cd server && npm run build`
Expected: Build succeeds (tests + tsc)

**Step 3: Run frontend build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Manual smoke test**

1. Start server: `cd server && npm run dev`
2. Start frontend: `cd web && npm run dev`
3. Navigate to `/dashboard/payments/settings` -- verify settings page loads
4. Navigate to `/dashboard/payments` -- verify transaction log loads (empty)
5. Test checkout endpoint:

```
curl -X POST http://localhost:3001/api/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{"useCase":"tournament_fee","amount":2500,"successUrl":"http://localhost:3000/success","cancelUrl":"http://localhost:3000/cancel"}'
```

Expected: 400 "Payments not configured for this use case" (correct - no provider enabled yet)
