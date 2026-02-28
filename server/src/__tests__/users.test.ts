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

describe("PUT /api/users/:id/role", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).put("/api/users/1/role").send({ role: "coach" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a coach", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });
    const res = await request(app)
      .put(`/api/users/${coachId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("changes role from coach to admin", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${coachId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("prevents last admin from self-demotion", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${adminId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "coach" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last admin/i);
  });

  it("allows demotion when another admin exists", async () => {
    const admin1 = insertUser("Admin1", "admin1@test.com", "admin");
    insertUser("Admin2", "admin2@test.com", "admin");
    const token = generateJWT({ id: admin1, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${admin1}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "coach" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("coach");
  });

  it("rejects invalid role", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${coachId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "parent" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/users/:id/reset-password", () => {
  it("returns 403 for a coach", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });
    const res = await request(app)
      .post(`/api/users/${coachId}/reset-password`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("sends reset email and returns 204 for admin", async () => {
    const { sendEmail } = await import("../services/email.js");
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .post(`/api/users/${coachId}/reset-password`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(sendEmail).toHaveBeenCalledWith(
      "coach@test.com",
      "Password Reset",
      expect.stringContaining("reset-password"),
    );

    const row = db.exec("SELECT resetToken FROM guardians WHERE id = ?", [coachId]);
    expect(row[0].values[0][0]).toBeTruthy();
  });

  it("returns 404 for non-existent user", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });
    const res = await request(app)
      .post("/api/users/999/reset-password")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
