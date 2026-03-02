import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "sql.js";
import request from "supertest";
import { initDB } from "../database.js";
import { generateJWT } from "../auth.js";

// Mock email service (required by app)
vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
  getSmtpConfig: vi.fn(),
}));

// Mock DockerService
const mockCheckDaemon = vi.fn();
const mockGetWahaStatus = vi.fn();
const mockInstallWaha = vi.fn();
const mockStartWaha = vi.fn();
const mockStopWaha = vi.fn();

vi.mock("../services/docker.service.js", () => {
  return {
    DockerService: class {
      checkDaemon = mockCheckDaemon;
      getWahaStatus = mockGetWahaStatus;
      installWaha = mockInstallWaha;
      startWaha = mockStartWaha;
      stopWaha = mockStopWaha;
    },
  };
});

const { default: app } = await import("../index.js");

let db: Database;
let adminToken: string;

function insertAdmin(): number {
  db.run(
    "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, ?)",
    ["admin@test.com", "Admin", "admin@test.com", "hash123", "admin"],
  );
  return db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
}

beforeEach(async () => {
  db = await initDB();
  const adminId = insertAdmin();
  adminToken = generateJWT({ id: adminId, role: "admin" });
  vi.clearAllMocks();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

// ── Auth ──────────────────────────────────────────────────────────────

describe("Setup WAHA auth", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/setup-waha/docker/status");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    db.run(
      "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, ?)",
      ["parent@test.com", "Parent", "parent@test.com", "hash123", "parent"],
    );
    const parentId = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
    const parentToken = generateJWT({ id: parentId, role: "parent" });

    const res = await request(app)
      .get("/api/setup-waha/docker/status")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });
});

// ── GET /docker/status ───────────────────────────────────────────────

describe("GET /api/setup-waha/docker/status", () => {
  it("returns available: true when Docker daemon is reachable", async () => {
    mockCheckDaemon.mockResolvedValue({ available: true });

    const res = await request(app)
      .get("/api/setup-waha/docker/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  it("returns available: false with error when daemon unreachable", async () => {
    mockCheckDaemon.mockResolvedValue({ available: false, error: "Cannot connect" });

    const res = await request(app)
      .get("/api/setup-waha/docker/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, error: "Cannot connect" });
  });
});

// ── GET /waha/status ─────────────────────────────────────────────────

describe("GET /api/setup-waha/waha/status", () => {
  it("returns container status", async () => {
    mockGetWahaStatus.mockResolvedValue({ status: "running", port: 3008 });

    const res = await request(app)
      .get("/api/setup-waha/waha/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "running", port: 3008 });
  });

  it("returns not_found when no container", async () => {
    mockGetWahaStatus.mockResolvedValue({ status: "not_found" });

    const res = await request(app)
      .get("/api/setup-waha/waha/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "not_found" });
  });
});

// ── POST /waha/install — validation ─────────────────────────────────

describe("POST /api/setup-waha/waha/install — validation", () => {
  it("rejects port below 1024", async () => {
    const res = await request(app)
      .post("/api/setup-waha/waha/install")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ port: 80, engine: "WEBJS" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/port/i);
  });

  it("rejects port above 65535", async () => {
    const res = await request(app)
      .post("/api/setup-waha/waha/install")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ port: 70000, engine: "NOWEB" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/port/i);
  });

  it("rejects non-numeric port", async () => {
    const res = await request(app)
      .post("/api/setup-waha/waha/install")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ port: "abc", engine: "WEBJS" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/port/i);
  });

  it("rejects invalid engine", async () => {
    const res = await request(app)
      .post("/api/setup-waha/waha/install")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ port: 3008, engine: "INVALID" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/engine/i);
  });

  it("rejects missing engine", async () => {
    const res = await request(app)
      .post("/api/setup-waha/waha/install")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ port: 3008 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/engine/i);
  });
});

// ── POST /waha/start ─────────────────────────────────────────────────

describe("POST /api/setup-waha/waha/start", () => {
  it("starts the WAHA container", async () => {
    mockStartWaha.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/setup-waha/waha/start")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockStartWaha).toHaveBeenCalled();
  });

  it("returns 500 when start fails", async () => {
    mockStartWaha.mockRejectedValue(new Error("Container not found"));

    const res = await request(app)
      .post("/api/setup-waha/waha/start")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Container not found");
  });
});

// ── POST /waha/stop ──────────────────────────────────────────────────

describe("POST /api/setup-waha/waha/stop", () => {
  it("stops the WAHA container", async () => {
    mockStopWaha.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/setup-waha/waha/stop")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockStopWaha).toHaveBeenCalled();
  });

  it("returns 500 when stop fails", async () => {
    mockStopWaha.mockRejectedValue(new Error("Container not found"));

    const res = await request(app)
      .post("/api/setup-waha/waha/stop")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Container not found");
  });
});

// ── GET /waha/qr ─────────────────────────────────────────────────────

describe("GET /api/setup-waha/waha/qr", () => {
  it("proxies the QR screenshot from WAHA API", async () => {
    // waha_url is seeded as default setting by initDB
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("fake-png-data"), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const res = await request(app)
      .get("/api/setup-waha/waha/qr")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/screenshot?session=default"),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    fetchSpy.mockRestore();
  });

  it("returns 502 when WAHA API is unreachable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const res = await request(app)
      .get("/api/setup-waha/waha/qr")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/ECONNREFUSED/);
    fetchSpy.mockRestore();
  });
});

// ── GET /waha/session ────────────────────────────────────────────────

describe("GET /api/setup-waha/waha/session", () => {
  it("proxies session status from WAHA API", async () => {
    const sessionData = { name: "default", status: "WORKING" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await request(app)
      .get("/api/setup-waha/waha/session")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sessionData);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/sessions/default"),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    fetchSpy.mockRestore();
  });

  it("returns 502 when WAHA API is unreachable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const res = await request(app)
      .get("/api/setup-waha/waha/session")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/ECONNREFUSED/);
    fetchSpy.mockRestore();
  });
});
