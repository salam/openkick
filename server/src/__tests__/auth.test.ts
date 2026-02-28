import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import type { Database } from "sql.js";
import {
  hashPassword,
  verifyPassword,
  generateJWT,
  verifyJWT,
  generateAccessToken,
  authMiddleware,
  tokenAuthMiddleware,
  requireRole,
} from "../auth.js";
import { initDB } from "../database.js";

// ── Password hashing ────────────────────────────────────────────────

describe("hashPassword", () => {
  it("returns a bcrypt hash (not equal to plaintext)", async () => {
    const hash = await hashPassword("test123");
    expect(hash).not.toBe("test123");
    expect(hash).toMatch(/^\$2[aby]?\$/); // bcrypt prefix
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const hash = await hashPassword("test123");
    const result = await verifyPassword("test123", hash);
    expect(result).toBe(true);
  });

  it("returns false for the wrong password", async () => {
    const hash = await hashPassword("test123");
    const result = await verifyPassword("wrong", hash);
    expect(result).toBe(false);
  });
});

// ── JWT ──────────────────────────────────────────────────────────────

describe("generateJWT", () => {
  it("returns a string token", () => {
    const token = generateJWT({ id: 1, role: "coach" });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
  });
});

describe("verifyJWT", () => {
  it("returns the original payload (id, role)", () => {
    const token = generateJWT({ id: 1, role: "coach" });
    const payload = verifyJWT(token);
    expect(payload).not.toBeNull();
    expect(payload!.id).toBe(1);
    expect(payload!.role).toBe("coach");
  });

  it("returns null for an invalid token", () => {
    const payload = verifyJWT("invalid-token");
    expect(payload).toBeNull();
  });
});

// ── Access token ─────────────────────────────────────────────────────

describe("generateAccessToken", () => {
  it("returns a URL-safe random string (64 chars hex)", () => {
    const token = generateAccessToken();
    expect(typeof token).toBe("string");
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });
});

// ── Middleware helpers ────────────────────────────────────────────────

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

// ── authMiddleware ───────────────────────────────────────────────────

describe("authMiddleware", () => {
  it("rejects request without Authorization header (401)", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects request with invalid JWT (401)", () => {
    const req = mockReq({
      headers: { authorization: "Bearer invalid-token" },
    } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts valid JWT and sets req.user", () => {
    const token = generateJWT({ id: 42, role: "coach" });
    const req = mockReq({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 42, role: "coach" });
  });
});

// ── tokenAuthMiddleware ──────────────────────────────────────────────

describe("tokenAuthMiddleware", () => {
  let db: Database;
  const TEST_TOKEN = "a".repeat(64);

  beforeEach(async () => {
    db = await initDB();
    db.run(
      "INSERT INTO guardians (phone, name, role, accessToken) VALUES (?, ?, ?, ?)",
      ["+491234567890", "Test Parent", "parent", TEST_TOKEN]
    );
  });

  afterEach(() => {
    db.close();
  });

  it("accepts valid access token in query param and sets req.user", () => {
    const req = mockReq({ query: { token: TEST_TOKEN } } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn();

    tokenAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.role).toBe("parent");
    expect(typeof req.user!.id).toBe("number");
  });

  it("rejects invalid token (401)", () => {
    const req = mockReq({ query: { token: "nonexistent" } } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn();

    tokenAuthMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects request without token param (401)", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    tokenAuthMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── requireRole ──────────────────────────────────────────────────────

describe("requireRole", () => {
  it("allows request when user has required role", () => {
    const middleware = requireRole("coach", "admin");
    const req = mockReq();
    req.user = { id: 1, role: "coach" };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when user does not have required role", () => {
    const middleware = requireRole("coach", "admin");
    const req = mockReq();
    req.user = { id: 1, role: "parent" };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
