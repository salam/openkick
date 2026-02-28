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

  it("POST /api/attendance with synthetic series eventId — auto-materializes and returns real eventId", async () => {
    // Create an event series directly in DB
    db.run(
      `INSERT INTO event_series (type, title, description, startTime, attendanceTime, location, categoryRequirement, maxParticipants, minParticipants, recurrenceDay, startDate, endDate, deadlineOffsetHours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "training",
        "Weekly Training",
        "Regular training session",
        "18:00",
        "17:45",
        "Main Field",
        null,
        20,
        5,
        1, // Monday
        "2026-01-01",
        "2026-12-31",
        24,
      ],
    );
    const seriesResult = db.exec("SELECT last_insert_rowid() AS id");
    const seriesId = seriesResult[0].values[0][0] as number;

    const playerId = createPlayer("SeriesPlayer");

    // RSVP using synthetic eventId
    const res = await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: `series-${seriesId}-2026-03-02`,
        playerId,
        status: "attending",
        source: "web",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.finalStatus).toBe("attending");
    // The returned eventId should be a real number
    expect(typeof body.eventId).toBe("number");
    expect(body.eventId).toBeGreaterThan(0);

    // Verify the materialized event exists in DB with correct seriesId and date
    const eventRows = db.exec(
      "SELECT * FROM events WHERE seriesId = ? AND date = ?",
      [seriesId, "2026-03-02"],
    );
    expect(eventRows.length).toBe(1);
    expect(eventRows[0].values.length).toBe(1);

    // Verify event fields were copied from the series template
    const cols = eventRows[0].columns;
    const vals = eventRows[0].values[0];
    const event: Record<string, unknown> = {};
    cols.forEach((col, i) => { event[col] = vals[i]; });

    expect(event.type).toBe("training");
    expect(event.title).toBe("Weekly Training");
    expect(event.startTime).toBe("18:00");
    expect(event.attendanceTime).toBe("17:45");
    expect(event.location).toBe("Main Field");
    expect(event.maxParticipants).toBe(20);
    expect(event.minParticipants).toBe(5);
    expect(event.seriesId).toBe(seriesId);
    // deadline should be computed (24h before the event date + startTime)
    expect(event.deadline).toBeTruthy();
  });

  it("POST /api/attendance with synthetic series eventId — reuses existing materialized event", async () => {
    // Create an event series
    db.run(
      `INSERT INTO event_series (type, title, recurrenceDay, startDate, endDate)
       VALUES (?, ?, ?, ?, ?)`,
      ["training", "Reuse Test", 1, "2026-01-01", "2026-12-31"],
    );
    const seriesResult = db.exec("SELECT last_insert_rowid() AS id");
    const seriesId = seriesResult[0].values[0][0] as number;

    // Pre-materialize an event for this series+date
    db.run(
      "INSERT INTO events (type, title, date, seriesId) VALUES (?, ?, ?, ?)",
      ["training", "Reuse Test", "2026-03-09", seriesId],
    );
    const eventResult = db.exec("SELECT last_insert_rowid() AS id");
    const existingEventId = eventResult[0].values[0][0] as number;

    const playerId = createPlayer("ReusePlayer");

    const res = await fetch(`${baseUrl}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: `series-${seriesId}-2026-03-09`,
        playerId,
        status: "attending",
        source: "web",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eventId).toBe(existingEventId);
  });

  it("should create notification when tournament reaches 80% capacity", async () => {
    // Create a guardian so createdBy FK is satisfied
    db.run("INSERT INTO guardians (phone, name) VALUES (?, ?)", ["+41790000001", "Coach"]);
    const guardianResult = db.exec("SELECT last_insert_rowid() AS id");
    const guardianId = guardianResult[0].values[0][0] as number;

    // Create a tournament event with maxParticipants=5
    db.run(
      "INSERT INTO events (type, title, date, maxParticipants, createdBy) VALUES (?, ?, ?, ?, ?)",
      ["tournament", "Cup", "2026-06-15", 5, guardianId],
    );
    const eventIdResult = db.exec("SELECT last_insert_rowid() AS id");
    const eventId = eventIdResult[0].values[0][0] as number;

    // RSVP 4 players (80% of 5) to trigger "filling_up" alert
    for (let i = 0; i < 4; i++) {
      const pid = createPlayer(`P${i}`);
      await fetch(`${baseUrl}/api/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, playerId: pid, status: "attending", source: "web" }),
      });
    }

    const notifs = db.exec("SELECT * FROM notifications WHERE type = 'filling_up'");
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].values.length).toBeGreaterThan(0);
  });

  it("should create 'full' notification when tournament reaches 100% capacity", async () => {
    db.run("INSERT INTO guardians (phone, name) VALUES (?, ?)", ["+41790000002", "Coach2"]);
    const guardianResult = db.exec("SELECT last_insert_rowid() AS id");
    const guardianId = guardianResult[0].values[0][0] as number;

    db.run(
      "INSERT INTO events (type, title, date, maxParticipants, createdBy) VALUES (?, ?, ?, ?, ?)",
      ["tournament", "Final Cup", "2026-06-20", 3, guardianId],
    );
    const eventIdResult = db.exec("SELECT last_insert_rowid() AS id");
    const eventId = eventIdResult[0].values[0][0] as number;

    // RSVP 3 players (100% of 3)
    for (let i = 0; i < 3; i++) {
      const pid = createPlayer(`Full${i}`);
      await fetch(`${baseUrl}/api/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, playerId: pid, status: "attending", source: "web" }),
      });
    }

    const notifs = db.exec("SELECT * FROM notifications WHERE type = 'full'");
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].values.length).toBeGreaterThan(0);
  });

  it("should not create notification for non-tournament events", async () => {
    const eventId = createEvent(5); // type is "training", not "tournament"
    for (let i = 0; i < 4; i++) {
      const pid = createPlayer(`Train${i}`);
      await fetch(`${baseUrl}/api/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, playerId: pid, status: "attending", source: "web" }),
      });
    }

    const notifs = db.exec("SELECT * FROM notifications WHERE eventId = ?", [eventId]);
    expect(notifs.length === 0 || notifs[0].values.length === 0).toBe(true);
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
