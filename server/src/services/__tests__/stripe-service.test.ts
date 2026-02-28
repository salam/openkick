import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCheckoutSessionsCreate = vi.fn();
const mockRefundsCreate = vi.fn();
const mockWebhooksConstructEvent = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();

vi.mock("stripe", () => {
  const StripeMock = function () {
    return {
      checkout: {
        sessions: {
          create: mockCheckoutSessionsCreate,
          retrieve: mockCheckoutSessionsRetrieve,
        },
      },
      refunds: { create: mockRefundsCreate },
      webhooks: { constructEvent: mockWebhooksConstructEvent },
    };
  };
  return { default: StripeMock };
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
    expect(result.redirectUrl).toBe(
      "https://checkout.stripe.com/pay/cs_test_123"
    );
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
    expect(result.currency).toBe("CHF");
  });
});
