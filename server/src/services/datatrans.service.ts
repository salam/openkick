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

    const bodyStr =
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");

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
