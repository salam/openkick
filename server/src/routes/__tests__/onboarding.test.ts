import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { onboardingRouter } from "../onboarding.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", onboardingRouter);
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

describe("Onboarding routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("GET /api/onboarding/status — returns expected shape with all steps false initially", async () => {
    const res = await fetch(`${baseUrl}/api/onboarding/status`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty("onboardingCompleted", false);
    expect(body).toHaveProperty("steps");
    expect(body.steps).toEqual({
      clubProfile: false,
      email: false,
      llm: false,
      waha: false,
    });
    expect(body).toHaveProperty("checklist");
    expect(body.checklist).toEqual({
      hasHolidays: false,
      hasTrainings: false,
      hasPlayers: false,
      hasGuardians: false,
      hasFeedsConfigured: true,
    });
  });

  it("GET /api/onboarding/status — clubProfile becomes true after changing club_name", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_name",
      "FC Test",
    ]);

    const res = await fetch(`${baseUrl}/api/onboarding/status`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.steps.clubProfile).toBe(true);
  });

  it("GET /api/onboarding/status — email step becomes true after setting smtp_host", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "smtp_host",
      "smtp.example.com",
    ]);

    const res = await fetch(`${baseUrl}/api/onboarding/status`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.steps.email).toBe(true);
  });

  it("POST /api/onboarding/complete — sets onboardingCompleted to true", async () => {
    const token = generateJWT({ id: 1, role: "admin" });
    const res = await fetch(`${baseUrl}/api/onboarding/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("success", true);

    // Verify the status endpoint reflects the change
    const statusRes = await fetch(`${baseUrl}/api/onboarding/status`);
    const statusBody = await statusRes.json();
    expect(statusBody.onboardingCompleted).toBe(true);
  });

  it("POST /api/onboarding/complete — requires auth (returns 401 without token)", async () => {
    const res = await fetch(`${baseUrl}/api/onboarding/complete`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/onboarding/status — works without auth token", async () => {
    const res = await fetch(`${baseUrl}/api/onboarding/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("onboardingCompleted");
    expect(body).toHaveProperty("steps");
    expect(body).toHaveProperty("checklist");
  });

  it("GET /api/onboarding/status — checklist reflects inserted data", async () => {
    db.run(
      "INSERT INTO players (name) VALUES (?)",
      ["Test Player"]
    );
    db.run(
      "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
      ["Summer", "2026-07-01", "2026-08-15", "manual"]
    );
    db.run(
      "INSERT INTO event_series (type, title, recurrenceDay, startDate, endDate) VALUES (?, ?, ?, ?, ?)",
      ["training", "Monday Training", 1, "2026-01-01", "2026-12-31"]
    );
    db.run(
      "INSERT INTO guardians (phone, role) VALUES (?, ?)",
      ["+41791234567", "parent"]
    );

    const res = await fetch(`${baseUrl}/api/onboarding/status`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.checklist.hasPlayers).toBe(true);
    expect(body.checklist.hasHolidays).toBe(true);
    expect(body.checklist.hasTrainings).toBe(true);
    expect(body.checklist.hasGuardians).toBe(true);
    expect(body.checklist.hasFeedsConfigured).toBe(true);
  });
});
