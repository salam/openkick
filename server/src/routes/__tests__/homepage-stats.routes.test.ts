import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB } from "../../database.js";
import { generateJWT } from "../../auth.js";
import { homepageStatsRouter } from "../public/homepage-stats.js";
import { settingsRouter } from "../settings.js";
import { invalidateHomepageStatsCache } from "../../services/statistics.service.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

function seedData() {
  const db = getDB();
  db.run("INSERT INTO guardians (id, phone, name, role) VALUES (1, '+41790000001', 'Admin', 'admin')");
  db.run("INSERT INTO players (id, name) VALUES (1, 'Luca')");
  db.run("INSERT INTO players (id, name) VALUES (2, 'Mia')");
  db.run("INSERT INTO events (id, type, title, date, createdBy) VALUES (1, 'training', 'T1', '2026-03-01', 1)");
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (1, 1, 'attending')");
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (1, 2, 'attending')");
}

async function createTestApp() {
  db = await initDB();
  seedData();
  invalidateHomepageStatsCache();
  const app = express();
  app.use(express.json());
  app.use("/api", homepageStatsRouter);
  app.use("/api", settingsRouter);
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

describe("GET /api/public/homepage-stats", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("returns 200 without auth", async () => {
    const res = await fetch(`${baseUrl}/api/public/homepage-stats`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.computedAt).toBeDefined();
    expect(data.lifetimeAthletes).toBeGreaterThanOrEqual(2);
  });

  it("returns null for disabled fields", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "homepage_stats_settings",
      JSON.stringify({ lifetimeAthletes: false, activeAthletes: true, tournamentsPlayed: true, trophiesWon: true, trainingSessionsThisSeason: true, activeCoaches: true }),
    ]);
    invalidateHomepageStatsCache();

    const res = await fetch(`${baseUrl}/api/public/homepage-stats`);
    const data = await res.json();
    expect(data.lifetimeAthletes).toBeNull();
    expect(data.activeAthletes).toBeGreaterThanOrEqual(0);
  });

  it("returns cached result on second call", async () => {
    const res1 = await fetch(`${baseUrl}/api/public/homepage-stats`);
    const data1 = await res1.json();
    const res2 = await fetch(`${baseUrl}/api/public/homepage-stats`);
    const data2 = await res2.json();
    expect(data1.computedAt).toBe(data2.computedAt);
  });
});

describe("Homepage stats settings", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /api/admin/settings/homepage-stats requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings/homepage-stats`);
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/settings/homepage-stats returns defaults", async () => {
    const token = generateJWT({ id: 1, role: "admin" });
    const res = await fetch(`${baseUrl}/api/admin/settings/homepage-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.lifetimeAthletes).toBe(true);
  });

  it("PUT /api/admin/settings/homepage-stats updates settings", async () => {
    const token = generateJWT({ id: 1, role: "admin" });
    const res = await fetch(`${baseUrl}/api/admin/settings/homepage-stats`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trophiesWon: false }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.trophiesWon).toBe(false);
    expect(data.lifetimeAthletes).toBe(true); // other fields preserved
  });
});
