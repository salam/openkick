import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { attendanceRouter } from "../attendance.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", attendanceRouter);
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

function createEvent(maxParticipants?: number): number {
  db.run(
    "INSERT INTO events (type, title, date, maxParticipants) VALUES (?, ?, ?, ?)",
    ["training", "Test Event", "2026-03-01", maxParticipants ?? null],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function createPlayer(name: string): number {
  db.run("INSERT INTO players (name) VALUES (?)", [name]);
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

describe("Attendance routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/attendance — creates attendance record and returns it", async () => {
    const eventId = createEvent();
    const playerId = createPlayer("Alice");

    const res = await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        playerId,
        status: "attending",
        source: "web",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.finalStatus).toBe("attending");
  });

  it("POST /api/attendance with waitlist scenario — returns waitlist status", async () => {
    const eventId = createEvent(1);
    const p1 = createPlayer("P1");
    const p2 = createPlayer("P2");

    // Fill the spot
    await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId: p1, status: "attending", source: "web" }),
    });

    // This one should be waitlisted
    const res = await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId: p2, status: "attending", source: "web" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.finalStatus).toBe("waitlist");
  });

  it("GET /api/events/:id/attendance — returns attendance list for event", async () => {
    const eventId = createEvent();
    const p1 = createPlayer("A");
    const p2 = createPlayer("B");

    await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId: p1, status: "attending", source: "web" }),
    });
    await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId: p2, status: "absent", source: "web" }),
    });

    const res = await fetch(`${baseUrl}/api/events/${eventId}/attendance`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("DELETE /api/attendance/:id — removes attendance record", async () => {
    const eventId = createEvent();
    const playerId = createPlayer("Del");

    await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, playerId, status: "attending", source: "web" }),
    });

    // Get the record id
    const listRes = await fetch(`${baseUrl}/api/events/${eventId}/attendance`);
    const list = await listRes.json();
    const recordId = list[0].id;

    const res = await fetch(`${baseUrl}/api/attendance/${recordId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    // Verify it's gone
    const afterRes = await fetch(`${baseUrl}/api/events/${eventId}/attendance`);
    const afterList = await afterRes.json();
    expect(afterList).toHaveLength(0);
  });
});
