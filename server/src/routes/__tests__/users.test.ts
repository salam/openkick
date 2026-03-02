import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB } from "../../database.js";
import { usersRouter } from "../users.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;
let authToken: string;

/** Convenience: add auth header to fetch calls */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${authToken}`, ...extra };
}

async function createTestApp(role = "admin") {
  db = await initDB();

  // Seed an admin user (id=1)
  db.run(
    "INSERT INTO guardians (phone, name, email, role, passwordHash) VALUES (?, ?, ?, ?, ?)",
    ["admin@test.com", "Admin", "admin@test.com", "admin", "hash123"],
  );

  // Generate a real JWT for the seeded user
  authToken = generateJWT({ id: 1, role });

  const app = express();
  app.use(express.json());
  app.use("/api", usersRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  db.close();
}

describe("Users routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  // ── GET /api/users ────────────────────────────────────────────────

  it("GET /api/users — returns users with phone hidden when phone equals email", async () => {
    const res = await fetch(`${baseUrl}/api/users`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.length).toBeGreaterThanOrEqual(1);
    const admin = body.find((u: Record<string, unknown>) => u.email === "admin@test.com");
    expect(admin).toBeDefined();
    expect(admin.phone).toBeUndefined();
  });

  it("GET /api/users — returns phone when it differs from email", async () => {
    db.run(
      "INSERT INTO guardians (phone, name, email, role) VALUES (?, ?, ?, ?)",
      ["41791234567", "Coach", "coach@test.com", "coach"],
    );

    const res = await fetch(`${baseUrl}/api/users`, { headers: authHeaders() });
    const body = await res.json();
    const coach = body.find((u: Record<string, unknown>) => u.email === "coach@test.com");
    expect(coach).toBeDefined();
    expect(coach.phone).toBe("41791234567");
  });

  // ── PUT /api/users/:id/phone ──────────────────────────────────────

  it("PUT /api/users/:id/phone — updates phone number for a user", async () => {
    const res = await fetch(`${baseUrl}/api/users/1/phone`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ phone: "+41 79 123 45 67" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.phone).toBe("41791234567");
  });

  it("PUT /api/users/:id/phone — normalizes phone (strips + and 00 prefix)", async () => {
    const res = await fetch(`${baseUrl}/api/users/1/phone`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ phone: "0041 79 999 88 77" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phone).toBe("41799998877");
  });

  it("PUT /api/users/:id/phone — returns 400 when phone is missing", async () => {
    const res = await fetch(`${baseUrl}/api/users/1/phone`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/users/:id/phone — returns 404 for non-existent user", async () => {
    const res = await fetch(`${baseUrl}/api/users/9999/phone`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ phone: "+41 79 000 00 00" }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT /api/users/:id/phone — returns 409 when phone already taken", async () => {
    db.run(
      "INSERT INTO guardians (phone, name, email, role) VALUES (?, ?, ?, ?)",
      ["41791234567", "Coach", "coach@test.com", "coach"],
    );

    const res = await fetch(`${baseUrl}/api/users/1/phone`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ phone: "+41 79 123 45 67" }),
    });
    expect(res.status).toBe(409);
  });

  // ── POST /api/users/invite with phone ─────────────────────────────

  it("POST /api/users/invite — stores phone when provided", async () => {
    const res = await fetch(`${baseUrl}/api/users/invite`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "New Coach",
        email: "newcoach@test.com",
        role: "coach",
        phone: "+41 78 555 44 33",
      }),
    });
    expect(res.status).toBe(201);

    const row = db.exec("SELECT phone FROM guardians WHERE email = ?", [
      "newcoach@test.com",
    ]);
    expect(row[0].values[0][0]).toBe("41785554433");
  });

  it("POST /api/users/invite — uses email as phone when no phone provided", async () => {
    const res = await fetch(`${baseUrl}/api/users/invite`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "New Coach",
        email: "nophone@test.com",
        role: "coach",
      }),
    });
    expect(res.status).toBe(201);

    const row = db.exec("SELECT phone FROM guardians WHERE email = ?", [
      "nophone@test.com",
    ]);
    expect(row[0].values[0][0]).toBe("nophone@test.com");
  });

  it("POST /api/users/invite — rejects duplicate phone", async () => {
    db.run(
      "INSERT INTO guardians (phone, name, email, role) VALUES (?, ?, ?, ?)",
      ["41785554433", "Existing", "existing@test.com", "coach"],
    );

    const res = await fetch(`${baseUrl}/api/users/invite`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "Dup",
        email: "dup@test.com",
        role: "coach",
        phone: "+41 78 555 44 33",
      }),
    });
    expect(res.status).toBe(409);
  });
});
