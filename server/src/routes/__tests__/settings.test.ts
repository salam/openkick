import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDB } from "../../database.js";
import { generateJWT } from "../../auth.js";
import { settingsRouter } from "../settings.js";
import type { Database } from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database;
let server: Server;
let baseUrl: string;
let adminToken: string;

async function createTestApp() {
  db = await initDB();
  db.run(
    "INSERT INTO guardians (id, phone, name, role, passwordHash) VALUES (1, '+41790000000', 'Admin', 'admin', 'hash')"
  );
  adminToken = generateJWT({ id: 1, role: "admin" });
  const app = express();
  app.use(express.json());
  app.use("/api", settingsRouter);
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

describe("Settings routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("GET /api/settings — returns non-secret settings without auth", async () => {
    // Insert a secret setting
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_api_key', 'sk-secret-123')");
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_pass', 'smtp-secret')");

    const res = await fetch(`${baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Public settings should be present
    expect(body).toMatchObject({
      bot_language: "de",
      club_name: "My Club",
    });
    // Non-whitelisted keys must NOT be present without auth
    expect(body).not.toHaveProperty("llm_provider");
    // Secret keys must NOT be present without auth
    expect(body).not.toHaveProperty("llm_api_key");
    expect(body).not.toHaveProperty("smtp_pass");
    expect(body).not.toHaveProperty("captcha_hmac_secret");
  });

  it("GET /api/settings — returns ALL settings with admin auth", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_api_key', 'sk-secret-123')");
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_pass', 'smtp-secret')");

    const res = await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.llm_api_key).toBe("sk-secret-123");
    expect(body.smtp_pass).toBe("smtp-secret");
    expect(body.club_name).toBe("My Club");
  });

  it("GET /api/settings/:key — returns single setting value", async () => {
    const res = await fetch(`${baseUrl}/api/settings/bot_language`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ key: "bot_language", value: "de" });
  });

  it("GET /api/settings/:key — returns 403 for secret key without auth", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_api_key', 'sk-secret')");
    const res = await fetch(`${baseUrl}/api/settings/llm_api_key`);
    expect(res.status).toBe(403);
  });

  it("GET /api/settings/:key — returns secret key with admin auth", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_pass', 'my-password')");
    const res = await fetch(`${baseUrl}/api/settings/smtp_pass`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe("my-password");
  });

  it("PUT /api/settings/:key — returns 401 without auth", async () => {
    const res = await fetch(`${baseUrl}/api/settings/club_name`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "Hacked Club" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/settings/:key — returns 403 for non-whitelisted key without auth", async () => {
    const res = await fetch(`${baseUrl}/api/settings/nonexistent`);
    expect(res.status).toBe(403);
  });

  it("GET /api/settings/:key — returns 404 for unknown key with admin auth", async () => {
    const res = await fetch(`${baseUrl}/api/settings/nonexistent`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("PUT /api/settings/:key — updates an existing setting", async () => {
    const res = await fetch(`${baseUrl}/api/settings/bot_language`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ value: "en" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ key: "bot_language", value: "en" });
  });

  it("PUT /api/settings/:key — creates setting if it doesn't exist", async () => {
    const res = await fetch(`${baseUrl}/api/settings/new_setting`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ value: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ key: "new_setting", value: "hello" });
  });

  it("PUT /api/settings/:key — returns 400 if value is missing", async () => {
    const res = await fetch(`${baseUrl}/api/settings/bot_language`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET after PUT — confirms the update persisted", async () => {
    await fetch(`${baseUrl}/api/settings/club_name`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ value: "Updated Club" }),
    });

    const res = await fetch(`${baseUrl}/api/settings/club_name`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ key: "club_name", value: "Updated Club" });

    // Also verify in the full settings list
    const allRes = await fetch(`${baseUrl}/api/settings`);
    const allBody = await allRes.json();
    expect(allBody.club_name).toBe("Updated Club");
  });

  describe("POST /api/settings/upload-logo", () => {
    const uploadDir = path.resolve(__dirname, "../../../../public/uploads");

    afterEach(() => {
      // Clean up uploaded files after each logo test
      const logoPath = path.join(uploadDir, "club-logo.png");
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    });

    it("saves logo and updates setting", async () => {
      // 1x1 transparent PNG pixel
      const pngPixel =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const res = await fetch(`${baseUrl}/api/settings/upload-logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ data: pngPixel, filename: "test-logo.png" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toBe("club_logo");
      expect(body.value).toBe("/uploads/club-logo.png");

      // Verify file was written
      expect(fs.existsSync(path.join(uploadDir, "club-logo.png"))).toBe(true);

      // Verify setting was persisted in DB
      const settingRes = await fetch(`${baseUrl}/api/settings/club_logo`);
      const settingBody = await settingRes.json();
      expect(settingBody.value).toBe("/uploads/club-logo.png");
    });

    it("rejects invalid file type", async () => {
      const res = await fetch(`${baseUrl}/api/settings/upload-logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ data: "dGVzdA==", filename: "test.exe" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid file type/);
    });

    it("rejects request with missing data", async () => {
      const res = await fetch(`${baseUrl}/api/settings/upload-logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ filename: "logo.png" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/data and filename are required/);
    });

    it("rejects request with missing filename", async () => {
      const res = await fetch(`${baseUrl}/api/settings/upload-logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ data: "dGVzdA==" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/data and filename are required/);
    });
  });
});
