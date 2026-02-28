import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { securityAuditRouter } from "../security-audit.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", securityAuditRouter);
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

describe("Security audit routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("GET /api/security-audit — returns 401 without auth", async () => {
    const res = await fetch(`${baseUrl}/api/security-audit`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/security-audit — returns 403 for non-admin role", async () => {
    const token = generateJWT({ id: 2, role: "parent" });
    const res = await fetch(`${baseUrl}/api/security-audit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/security-audit — returns 200 with audit result for admin", async () => {
    const token = generateJWT({ id: 1, role: "admin" });
    const res = await fetch(`${baseUrl}/api/security-audit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify the shape of the audit result
    expect(body).toHaveProperty("timestamp");
    expect(typeof body.timestamp).toBe("string");

    expect(body).toHaveProperty("checks");
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThan(0);

    // Each check should have the expected fields
    for (const check of body.checks) {
      expect(check).toHaveProperty("id");
      expect(check).toHaveProperty("category");
      expect(check).toHaveProperty("status");
      expect(check).toHaveProperty("message");
      expect(["pass", "warn", "fail"]).toContain(check.status);
    }

    expect(body).toHaveProperty("summary");
    expect(typeof body.summary.pass).toBe("number");
    expect(typeof body.summary.warn).toBe("number");
    expect(typeof body.summary.fail).toBe("number");
  });
});
