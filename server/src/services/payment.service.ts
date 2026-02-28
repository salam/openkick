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
