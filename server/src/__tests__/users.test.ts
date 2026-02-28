import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "sql.js";
import request from "supertest";
import { initDB } from "../database.js";
import { generateJWT } from "../auth.js";

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
  getSmtpConfig: vi.fn(),
}));

const { default: app } = await import("../index.js");

let db: Database;

beforeEach(async () => {
  db = await initDB();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

function insertUser(name: string, email: string, role: string): number {
  db.run(
    "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, ?)",
    [email, name, email, "hash123", role],
  );
  return db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
}

describe("GET /api/users", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("returns coaches and admins for an admin", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    insertUser("Coach A", "coach@test.com", "coach");
    db.run(
      "INSERT INTO guardians (phone, name, role) VALUES ('123', 'Parent', 'parent')",
    );

    const token = generateJWT({ id: adminId, role: "admin" });
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("email");
    expect(res.body[0]).toHaveProperty("role");
    expect(res.body[0]).not.toHaveProperty("passwordHash");
  });

  it("returns users for a coach too", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("returns 403 for a parent", async () => {
    const token = generateJWT({ id: 99, role: "parent" });
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
