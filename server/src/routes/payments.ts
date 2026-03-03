import { Router, type Request, type Response } from "express";
import { getDB, getLastInsertId } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";
import { PaymentService } from "../services/payment.service.js";
import { generateReceipt } from "../services/receipt.service.js";

export function createPaymentsRouter(paymentService: PaymentService) {
  const router = Router();

  // --- Public: Payment status (which use cases are enabled) ---
  router.get("/public/payment-status", (_req: Request, res: Response) => {
    const db = getDB();
    // BUG21b: join with payment_providers to only report enabled when provider is also configured and enabled
    const rows = db.exec(
      `SELECT uc.id, uc.enabled, uc.currency, uc.providerId, pp.enabled AS providerEnabled
       FROM payment_use_cases uc
       LEFT JOIN payment_providers pp ON pp.id = uc.providerId`
    );
    if (rows.length === 0) {
      res.json({ useCases: {} });
      return;
    }
    const useCases: Record<string, { enabled: boolean; currency: string }> = {};
    for (const row of rows[0].values) {
      const ucEnabled = !!(row[1] as number);
      const hasProvider = !!(row[3]);
      const providerEnabled = !!(row[4] as number);
      useCases[row[0] as string] = {
        enabled: ucEnabled && hasProvider && providerEnabled,
        currency: (row[2] as string) || "CHF",
      };
    }
    res.json({ useCases });
  });

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
        id: row[0], enabled: row[1], provider: row[2], currency: row[3], updatedAt: row[4],
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
            [uc.enabled ? 1 : 0, uc.provider || uc.providerId || null, uc.currency || "CHF", uc.id]
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
          id: row[0], enabled: row[1], provider: row[2], currency: row[3], updatedAt: row[4],
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
      const params: (string | number | null)[] = [];

      if (req.query.useCase) {
        where += " AND useCase = ?";
        params.push(req.query.useCase as string);
      }
      if (req.query.status) {
        where += " AND status = ?";
        params.push(req.query.status as string);
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
      const txnId = parseInt(req.params.transactionId as string);
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
      const txnId = parseInt(req.params.transactionId as string);

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
