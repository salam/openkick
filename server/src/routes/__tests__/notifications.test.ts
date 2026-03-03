import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { generateJWT } from "../../auth.js";
import { notificationsRouter } from "../notifications.js";
import { createNotification } from "../../services/notifications.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;
const authHeaders = {
  Authorization: `Bearer ${generateJWT({ id: 1, role: "parent" })}`,
};

async function createTestApp() {
  db = await initDB();
  db.run("INSERT INTO guardians (id, phone, name, role, passwordHash) VALUES (1, '+41790000000', 'Admin', 'admin', 'hash')");
  const app = express();
  app.use(express.json());
  app.use("/api", notificationsRouter);
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

describe("Notifications routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("GET /api/notifications — returns unread notifications for userId", async () => {
    createNotification({ userId: 1, type: "info", message: "Hello" });
    createNotification({ userId: 1, type: "alert", message: "Deadline soon" });
    createNotification({ userId: 2, type: "info", message: "Other user msg" });

    const res = await fetch(`${baseUrl}/api/notifications?userId=1`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body.every((n: Record<string, unknown>) => n.userId === 1)).toBe(true);
    expect(body.every((n: Record<string, unknown>) => n.read === 0)).toBe(true);
  });

  it("GET /api/notifications — returns empty array when no unread", async () => {
    const res = await fetch(`${baseUrl}/api/notifications?userId=99`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("PUT /api/notifications/:id/read — marks notification as read", async () => {
    const notification = createNotification({
      userId: 1,
      type: "info",
      message: "Mark me read",
    });

    const res = await fetch(`${baseUrl}/api/notifications/${notification.id}/read`, {
      method: "PUT",
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it no longer appears in unread list
    const listRes = await fetch(`${baseUrl}/api/notifications?userId=1`, {
      headers: authHeaders,
    });
    const listBody = await listRes.json();
    expect(listBody).toHaveLength(0);
  });

  it("PUT /api/notifications/:id/read — returns 400 for invalid id", async () => {
    const res = await fetch(`${baseUrl}/api/notifications/abc/read`, {
      method: "PUT",
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });
});
