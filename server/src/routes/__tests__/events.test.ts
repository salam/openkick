import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { eventsRouter } from "../events.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", eventsRouter);
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

describe("Events routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/events — creates event and returns 201", async () => {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "training",
        title: "Monday Training",
        date: "2026-03-02",
        startTime: "18:00",
        attendanceTime: "17:45",
        deadline: "2026-03-01T12:00:00",
        maxParticipants: 20,
        minParticipants: 8,
        location: "Sportplatz A",
        categoryRequirement: "E,F",
        recurring: 1,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.type).toBe("training");
    expect(body.title).toBe("Monday Training");
    expect(body.date).toBe("2026-03-02");
    expect(body.startTime).toBe("18:00");
    expect(body.attendanceTime).toBe("17:45");
    expect(body.maxParticipants).toBe(20);
    expect(body.minParticipants).toBe(8);
    expect(body.location).toBe("Sportplatz A");
    expect(body.categoryRequirement).toBe("E,F");
    expect(body.recurring).toBe(1);
    expect(body.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("GET /api/events — returns all upcoming events sorted by date ascending", async () => {
    // Create events with different dates
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "Later", date: "2026-04-10" }),
    });
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "Earlier", date: "2026-03-05" }),
    });

    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("Earlier");
    expect(body[1].title).toBe("Later");
  });

  it("GET /api/events?type=tournament — filters by type", async () => {
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "Training A", date: "2026-03-01" }),
    });
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "tournament", title: "Cup B", date: "2026-03-02" }),
    });
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "tournament", title: "Cup C", date: "2026-03-03" }),
    });

    const res = await fetch(`${baseUrl}/api/events?type=tournament`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.every((e: Record<string, unknown>) => e.type === "tournament")).toBe(true);
  });

  it("GET /api/events?category=E — filters by categoryRequirement containing E", async () => {
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "E+F Training", date: "2026-03-01", categoryRequirement: "E,F" }),
    });
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "D Training", date: "2026-03-02", categoryRequirement: "D" }),
    });
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "E Only", date: "2026-03-03", categoryRequirement: "E" }),
    });

    const res = await fetch(`${baseUrl}/api/events?category=E`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    const titles = body.map((e: Record<string, unknown>) => e.title);
    expect(titles).toContain("E+F Training");
    expect(titles).toContain("E Only");
  });

  it("GET /api/events/:id — returns single event with attendance summary", async () => {
    // Create event
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "Detail Event", date: "2026-03-10" }),
    });
    const { id: eventId } = await createRes.json();

    // Create some players and attendance records directly in the DB
    db.run("INSERT INTO players (name, yearOfBirth) VALUES (?, ?)", ["P1", 2015]);
    db.run("INSERT INTO players (name, yearOfBirth) VALUES (?, ?)", ["P2", 2015]);
    db.run("INSERT INTO players (name, yearOfBirth) VALUES (?, ?)", ["P3", 2015]);
    db.run("INSERT INTO players (name, yearOfBirth) VALUES (?, ?)", ["P4", 2015]);

    db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)", [eventId, 1, "attending"]);
    db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)", [eventId, 2, "attending"]);
    db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)", [eventId, 3, "absent"]);
    db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)", [eventId, 4, "waitlist"]);

    const res = await fetch(`${baseUrl}/api/events/${eventId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Detail Event");
    expect(body.attendanceSummary).toEqual({
      attending: 2,
      absent: 1,
      waitlist: 1,
      unknown: 0,
    });
  });

  it("GET /api/events/:id — returns 404 for non-existent event", async () => {
    const res = await fetch(`${baseUrl}/api/events/999`);
    expect(res.status).toBe(404);
  });

  it("PUT /api/events/:id — updates event fields", async () => {
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "Old Title", date: "2026-03-01" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title", location: "New Field", maxParticipants: 15 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("New Title");
    expect(body.location).toBe("New Field");
    expect(body.maxParticipants).toBe(15);
    // Original fields should remain
    expect(body.type).toBe("training");
    expect(body.date).toBe("2026-03-01");
  });

  it("PUT /api/events/:id — returns 404 for non-existent event", async () => {
    const res = await fetch(`${baseUrl}/api/events/999`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/events/:id — removes event and cascade-deletes attendance records", async () => {
    // Create event
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "To Delete", date: "2026-03-15" }),
    });
    const { id: eventId } = await createRes.json();

    // Add attendance record
    db.run("INSERT INTO players (name, yearOfBirth) VALUES (?, ?)", ["P1", 2015]);
    db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)", [eventId, 1, "attending"]);

    const delRes = await fetch(`${baseUrl}/api/events/${eventId}`, { method: "DELETE" });
    expect(delRes.status).toBe(204);

    // Event should be gone
    const getRes = await fetch(`${baseUrl}/api/events/${eventId}`);
    expect(getRes.status).toBe(404);

    // Attendance records should also be gone
    const attRows = db.exec("SELECT * FROM attendance WHERE eventId = ?", [eventId]);
    expect(attRows.length).toBe(0);
  });

  it("DELETE /api/events/:id — returns 404 for non-existent event", async () => {
    const res = await fetch(`${baseUrl}/api/events/999`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
