import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "sql.js";
import request from "supertest";
import { initDB } from "../database.js";

// Mock email service before importing app
vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
  getSmtpConfig: vi.fn(),
}));

// Dynamic import so mock is in place
const { default: app } = await import("../index.js");

let db: Database;

beforeEach(async () => {
  db = await initDB();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

// ── Setup status ────────────────────────────────────────────────────

describe("GET /api/setup/status", () => {
  it("returns needsSetup: true when no admin exists", async () => {
    const res = await request(app).get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ needsSetup: true });
  });

  it("returns needsSetup: false when an admin exists", async () => {
    db.run(
      "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, 'admin')",
      ["admin@test.com", "Admin", "admin@test.com", "hash"],
    );

    const res = await request(app).get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ needsSetup: false });
  });
});

// ── Setup ───────────────────────────────────────────────────────────

describe("POST /api/setup", () => {
  it("creates admin and returns JWT", async () => {
    const res = await request(app).post("/api/setup").send({
      name: "Admin User",
      email: "admin@example.com",
      password: "securepass123",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.split(".")).toHaveLength(3);
  });

  it("returns 409 when admin already exists", async () => {
    db.run(
      "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, 'admin')",
      ["admin@test.com", "Existing Admin", "admin@test.com", "hash"],
    );

    const res = await request(app).post("/api/setup").send({
      name: "New Admin",
      email: "new@example.com",
      password: "securepass123",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Setup already complete");
  });

  it("validates required fields", async () => {
    const res = await request(app).post("/api/setup").send({
      name: "Admin",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it("validates password length", async () => {
    const res = await request(app).post("/api/setup").send({
      name: "Admin",
      email: "admin@example.com",
      password: "short",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/);
  });
});

// ── Forgot password ─────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  it("returns 204 for known email", async () => {
    db.run(
      "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, 'admin')",
      ["admin@test.com", "Admin", "admin@test.com", "hash"],
    );

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "admin@test.com" });

    expect(res.status).toBe(204);
  });

  it("returns 204 for unknown email (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nonexistent@test.com" });

    expect(res.status).toBe(204);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });
});

// ── Reset password ──────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  const RESET_TOKEN = "a".repeat(64);

  it("resets password with valid token", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.run(
      "INSERT INTO guardians (phone, name, email, passwordHash, role, resetToken, resetTokenExpiry) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
      [
        "admin@test.com",
        "Admin",
        "admin@test.com",
        "oldhash",
        RESET_TOKEN,
        futureExpiry,
      ],
    );

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: RESET_TOKEN, password: "newpassword123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.split(".")).toHaveLength(3);

    // Verify token was cleared
    const result = db.exec(
      "SELECT resetToken, resetTokenExpiry FROM guardians WHERE email = 'admin@test.com'",
    );
    expect(result[0].values[0][0]).toBeNull();
    expect(result[0].values[0][1]).toBeNull();
  });

  it("rejects expired token", async () => {
    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.run(
      "INSERT INTO guardians (phone, name, email, passwordHash, role, resetToken, resetTokenExpiry) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
      [
        "admin@test.com",
        "Admin",
        "admin@test.com",
        "oldhash",
        RESET_TOKEN,
        pastExpiry,
      ],
    );

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: RESET_TOKEN, password: "newpassword123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid or expired/);
  });

  it("rejects invalid token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "nonexistent-token", password: "newpassword123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid or expired/);
  });

  it("validates required fields", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it("validates password length", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: RESET_TOKEN, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/);
  });
});
