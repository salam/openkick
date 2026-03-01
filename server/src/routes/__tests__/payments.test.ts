import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Database } from "sql.js";

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  })),
}));

vi.mock("../../services/receipt.service.js", () => ({
  generateReceipt: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
}));

import { initDB } from "../../database.js";
import { generateJWT } from "../../auth.js";
import { createPaymentsRouter } from "../payments.js";
import { PaymentService } from "../../services/payment.service.js";

let db: Database;
let server: Server;
let baseUrl: string;
let adminToken: string;
let parentToken: string;
let paymentService: PaymentService;

async function createTestApp() {
  db = await initDB();

  db.run(
    "INSERT INTO guardians (id, phone, name, role, passwordHash) VALUES (1, '+41790000000', 'Admin', 'admin', 'hash')"
  );
  db.run(
    "INSERT INTO guardians (id, phone, name, role, passwordHash) VALUES (2, '+41790000001', 'Parent', 'parent', 'hash')"
  );

  adminToken = generateJWT({ id: 1, role: "admin" });
  parentToken = generateJWT({ id: 2, role: "parent" });

  paymentService = new PaymentService();

  const app = express();
  app.use(express.json());
  app.use("/api", createPaymentsRouter(paymentService));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  db.close();
}

describe("Payment Routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
    vi.restoreAllMocks();
  });

  describe("GET /api/admin/payments/settings", () => {
    it("returns providers and use cases", async () => {
      const res = await fetch(`${baseUrl}/api/admin/payments/settings`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providers).toHaveLength(2);
      expect(body.useCases).toHaveLength(3);
    });

    it("masks secrets in config", async () => {
      db.run(
        "UPDATE payment_providers SET config = ? WHERE id = 'stripe'",
        [JSON.stringify({ testSecretKey: "sk_test_abc123xyz789" })]
      );

      const res = await fetch(`${baseUrl}/api/admin/payments/settings`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const body = await res.json();
      const stripe = body.providers.find((p: { id: string }) => p.id === "stripe");
      const config = JSON.parse(stripe.config);
      expect(config.testSecretKey).toBe("****z789");
    });

    it("rejects non-admin", async () => {
      const res = await fetch(`${baseUrl}/api/admin/payments/settings`, {
        headers: { Authorization: `Bearer ${parentToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("PUT /api/admin/payments/settings", () => {
    it("updates provider config", async () => {
      const res = await fetch(`${baseUrl}/api/admin/payments/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          providers: [{
            id: "stripe",
            enabled: true,
            config: { testSecretKey: "sk_test_new" },
            testMode: true,
          }],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providers.find((p: { id: string }) => p.id === "stripe").enabled).toBe(1);
    });
  });

  describe("POST /api/payments/checkout", () => {
    it("returns 400 when no provider is configured", async () => {
      const res = await fetch(`${baseUrl}/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useCase: "tournament_fee",
          amount: 2500,
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/not configured/i);
    });

    it("returns 400 when amount is missing", async () => {
      const res = await fetch(`${baseUrl}/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useCase: "tournament_fee",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown use case", async () => {
      const res = await fetch(`${baseUrl}/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useCase: "nonexistent",
          amount: 1000,
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/unknown use case/i);
    });
  });

  describe("GET /api/admin/payments/transactions", () => {
    it("returns paginated transactions", async () => {
      db.run(
        "INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)",
        ["ext_1", "stripe", "tournament_fee", 2500, "CHF", "completed"]
      );

      const res = await fetch(`${baseUrl}/api/admin/payments/transactions`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.transactions).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("filters by useCase", async () => {
      db.run("INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)", ["ext_1", "stripe", "tournament_fee", 2500, "CHF", "completed"]);
      db.run("INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)", ["ext_2", "stripe", "donation", 1000, "CHF", "completed"]);

      const res = await fetch(`${baseUrl}/api/admin/payments/transactions?useCase=donation`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const body = await res.json();
      expect(body.transactions).toHaveLength(1);
      expect(body.transactions[0].useCase).toBe("donation");
    });

    it("filters by status", async () => {
      db.run("INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)", ["ext_1", "stripe", "tournament_fee", 2500, "CHF", "completed"]);
      db.run("INSERT INTO transactions (externalId, providerId, useCase, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)", ["ext_2", "stripe", "tournament_fee", 1500, "CHF", "pending"]);

      const res = await fetch(`${baseUrl}/api/admin/payments/transactions?status=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const body = await res.json();
      expect(body.transactions).toHaveLength(1);
      expect(body.transactions[0].status).toBe("pending");
    });
  });

  describe("POST /api/admin/payments/refund/:id", () => {
    it("returns 404 for non-existent transaction", async () => {
      const res = await fetch(`${baseUrl}/api/admin/payments/refund/999`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
    });

    it("returns 400 for already fully refunded transaction", async () => {
      db.run(
        "INSERT INTO transactions (id, externalId, providerId, useCase, amount, currency, status, refundedAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [1, "ext_1", "stripe", "tournament_fee", 2500, "CHF", "refunded", 2500]
      );

      const res = await fetch(`${baseUrl}/api/admin/payments/refund/1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/already.*refunded/i);
    });

    it("returns 400 for pending transaction", async () => {
      db.run(
        "INSERT INTO transactions (id, externalId, providerId, useCase, amount, currency, status, refundedAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [2, "ext_2", "stripe", "tournament_fee", 2500, "CHF", "pending", 0]
      );

      const res = await fetch(`${baseUrl}/api/admin/payments/refund/2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/cannot refund/i);
    });
  });
});
