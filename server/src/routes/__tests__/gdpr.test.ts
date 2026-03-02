import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB, getLastInsertId } from "../../database.js";
import { gdprRouter } from "../gdpr.js";
import { playersRouter } from "../players.js";
import { generateJWT, generateAccessToken } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", gdprRouter);
  app.use("/api", playersRouter);
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

function createParentWithToken(): { id: number; token: string } {
  const db = getDB();
  const token = generateAccessToken();
  db.run(
    "INSERT INTO guardians (phone, name, email, role, accessToken, consentGiven) VALUES (?, ?, ?, 'parent', ?, 1)",
    ["+41791111111", "Test Parent", "parent@test.com", token]
  );
  return { id: getLastInsertId(), token };
}

function createAdminWithJWT(): { id: number; jwt: string } {
  const db = getDB();
  db.run(
    "INSERT INTO guardians (phone, name, email, role, passwordHash, consentGiven) VALUES (?, ?, ?, 'admin', 'hash', 1)",
    ["+41790000000", "Admin", "admin@test.com"]
  );
  const id = getLastInsertId();
  return { id, jwt: generateJWT({ id, role: "admin" }) };
}

describe("GDPR Routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });
  afterEach(async () => {
    await teardown();
  });

  describe("PUT /api/guardians/:id/consent", () => {
    it("updates consent via token auth", async () => {
      const { id, token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/guardians/${id}/consent?token=${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.consentGiven).toBe(1);
      expect(body.consentGivenAt).toBeTruthy();
    });

    it("rejects consent update for different guardian", async () => {
      const { id: firstId } = createParentWithToken();
      const db = getDB();
      const otherToken = generateAccessToken();
      db.run(
        "INSERT INTO guardians (phone, name, role, accessToken) VALUES (?, ?, 'parent', ?)",
        ["+41792222222", "Other", otherToken]
      );

      const res = await fetch(`${baseUrl}/api/guardians/${firstId}/consent?token=${otherToken}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      expect(res.status).toBe(403);
    });

    it("allows admin to update any guardian consent", async () => {
      const { id: parentId } = createParentWithToken();
      const { jwt } = createAdminWithJWT();
      const res = await fetch(`${baseUrl}/api/guardians/${parentId}/consent`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ consent: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.consentGiven).toBe(0);
    });
  });

  describe("POST /api/gdpr/requests", () => {
    it("creates an export request via token auth", async () => {
      const { id, token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.type).toBe("export");
      expect(body.status).toBe("pending");
      expect(body.guardianId).toBe(id);
    });

    it("creates a deletion request with reason", async () => {
      const { token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "deletion", reason: "Leaving club" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.type).toBe("deletion");
      expect(body.reason).toBe("Leaving club");
    });

    it("rejects invalid type", async () => {
      const { token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invalid" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/gdpr/requests (admin)", () => {
    it("lists all requests for admin", async () => {
      const { token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });

      const res = await fetch(`${baseUrl}/api/gdpr/requests`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it("rejects non-admin access", async () => {
      const { token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe("PUT /api/gdpr/requests/:id (admin approve/reject)", () => {
    it("approves a request", async () => {
      const { token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/gdpr/requests/${reqId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ status: "approved" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("approved");
    });

    it("rejects a request with note", async () => {
      const { token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/gdpr/requests/${reqId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ status: "rejected", adminNote: "Not valid" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("rejected");
      expect(body.adminNote).toBe("Not valid");
    });
  });

  describe("GET /api/gdpr/exports/:id (download)", () => {
    it("generates and returns export ZIP for approved request", async () => {
      const { id: parentId, token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      // Create a player and link to guardian
      const playerRes = await fetch(`${baseUrl}/api/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Export Kid", yearOfBirth: 2016 }),
      });
      const { id: playerId } = await playerRes.json();
      await fetch(`${baseUrl}/api/guardians/${parentId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });

      // Create export request
      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      // Approve it
      await fetch(`${baseUrl}/api/gdpr/requests/${reqId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ status: "approved" }),
      });

      // Download
      const res = await fetch(`${baseUrl}/api/gdpr/exports/${reqId}?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/zip");
    });

    it("rejects download for non-approved request", async () => {
      const { token } = createParentWithToken();

      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/gdpr/exports/${reqId}?token=${token}`);
      expect(res.status).toBe(403);
    });
  });
});
