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
