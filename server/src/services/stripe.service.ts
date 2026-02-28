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
      sessionParams.payment_method_types =
        params.paymentMethods as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
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
