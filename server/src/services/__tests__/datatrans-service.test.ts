import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { DatatransProvider } from "../datatrans.service.js";

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

  it("includes paymentMethods when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ transactionId: "txn_dt_456" }),
    });

    await provider.createCheckout({
      amount: 1000,
      currency: "CHF",
      description: "Fee",
      referenceId: "ref_1",
      paymentMethods: ["TWI", "VIS"],
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.paymentMethods).toEqual(["TWI", "VIS"]);
  });

  it("throws on checkout API error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    await expect(
      provider.createCheckout({
        amount: 2500,
        currency: "CHF",
        description: "Fee",
        referenceId: "ref_1",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toThrow("Datatrans init failed: 400 Bad Request");
  });

  it("verifies a valid webhook signature", () => {
    const rawBody =
      '{"transactionId":"txn_dt_123","status":"settled"}';
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

  it("verifies webhook with Buffer body", () => {
    const rawBody =
      '{"transactionId":"txn_dt_789","status":"authorized"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = timestamp + rawBody;
    const hmac = crypto
      .createHmac("sha256", Buffer.from(config.hmacKey, "hex"))
      .update(signedPayload)
      .digest("hex");
    const sigHeader = `t=${timestamp},s0=${hmac}`;

    const result = provider.verifyWebhook(
      { "datatrans-signature": sigHeader },
      Buffer.from(rawBody, "utf-8")
    );

    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("payment.completed");
  });

  it("maps canceled webhook status to payment.failed", () => {
    const rawBody =
      '{"transactionId":"txn_dt_cancel","status":"canceled"}';
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
    expect(result.eventType).toBe("payment.failed");
  });

  it("rejects invalid webhook signature", () => {
    const result = provider.verifyWebhook(
      { "datatrans-signature": "t=123,s0=bad" },
      '{"transactionId":"txn_dt_123"}'
    );

    expect(result.valid).toBe(false);
  });

  it("rejects webhook with missing signature header", () => {
    const result = provider.verifyWebhook({}, '{"transactionId":"txn_dt_123"}');

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

  it("throws on refund API error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    await expect(
      provider.refund({
        externalId: "txn_dt_bad",
        amount: 1000,
        currency: "CHF",
      })
    ).rejects.toThrow("Datatrans refund failed: 404 Not Found");
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
    expect(result.currency).toBe("CHF");
  });

  it("maps pending transaction statuses", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        transactionId: "txn_dt_pending",
        status: "initialized",
        detail: {},
      }),
    });

    const result = await provider.getTransaction("txn_dt_pending");

    expect(result.status).toBe("pending");
    expect(result.amount).toBe(0);
    expect(result.currency).toBe("CHF");
  });

  it("throws on getTransaction API error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(provider.getTransaction("txn_dt_bad")).rejects.toThrow(
      "Datatrans status check failed: 500"
    );
  });
});
