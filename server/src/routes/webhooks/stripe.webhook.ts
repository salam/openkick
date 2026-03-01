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
