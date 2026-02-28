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

  it("POST /api/events — accepts teamName and returns it in response", async () => {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "tournament",
        title: "Spring Cup",
        date: "2026-04-05",
        teamName: "FC Example E1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.teamName).toBe("FC Example E1");

    // Verify it persists via GET
    const getRes = await fetch(`${baseUrl}/api/events/${body.id}`);
    const getBody = await getRes.json();
    expect(getBody.teamName).toBe("FC Example E1");
  });

  it("POST /api/events — teamName defaults to null when not provided", async () => {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training", title: "No Team", date: "2026-04-06" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.teamName).toBeNull();
  });

  it("PUT /api/events/:id — can update teamName", async () => {
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "tournament",
        title: "Autumn Cup",
        date: "2026-10-10",
        teamName: "FC Old Name",
      }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName: "FC New Name" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teamName).toBe("FC New Name");
    // Other fields unchanged
    expect(body.title).toBe("Autumn Cup");
  });

  it("GET /api/events — includes expanded series instances", async () => {
    // Insert an event series directly into the DB (every Wednesday, March 2026)
    db.run(
      `INSERT INTO event_series (type, title, description, startTime, attendanceTime, location,
        categoryRequirement, maxParticipants, minParticipants, recurrenceDay, startDate, endDate,
        customDates, excludedDates, deadlineOffsetHours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "training", "Wednesday Series", "Series desc", "18:00", "17:45", "Platz B",
        "E", 20, 8, 3, "2026-03-01", "2026-03-31",
        null, null, 24,
      ],
    );

    // Also create a standalone event to make sure it still shows up
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "tournament", title: "Standalone Cup", date: "2026-03-15" }),
    });

    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    // The standalone event should be present
    const standalone = body.find((e: any) => e.title === "Standalone Cup");
    expect(standalone).toBeDefined();
    expect(standalone.type).toBe("tournament");

    // March 2026 Wednesdays: 4, 11, 18, 25 → 4 series instances
    const seriesInstances = body.filter((e: any) => e.title === "Wednesday Series");
    expect(seriesInstances.length).toBe(4);

    // Verify fields on one instance
    const first = seriesInstances[0];
    expect(first.seriesId).toBeDefined();
    expect(first.type).toBe("training");
    expect(first.date).toBe("2026-03-04");
    expect(first.startTime).toBe("18:00");
    expect(first.location).toBe("Platz B");

    // Should be sorted by date
    for (let i = 1; i < body.length; i++) {
      expect(body[i].date >= body[i - 1].date).toBe(true);
    }
  });

  it("GET /api/events?upcoming=true — filters to only future events", async () => {
    // Past event
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["tournament", "Past Cup", "2025-01-01"],
    );
    // Future event
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["tournament", "Future Cup", "2027-06-15"],
    );
    // Future training (should appear without type filter)
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["training", "Future Training", "2027-06-15"],
    );

    // With type filter — only future tournaments
    const res = await fetch(`${baseUrl}/api/events?type=tournament&upcoming=true`);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Future Cup");

    // Without type filter — all future events
    const res2 = await fetch(`${baseUrl}/api/events?upcoming=true`);
    const body2 = await res2.json();
    expect(body2).toHaveLength(2);
    expect(body2.every((e: Record<string, unknown>) => e.date! >= new Date().toISOString().slice(0, 10))).toBe(true);
  });

  it("GET /api/events?upcoming=false — returns all events including past", async () => {
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["tournament", "Past Cup", "2025-01-01"],
    );
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["tournament", "Future Cup", "2027-06-15"],
    );

    const res = await fetch(`${baseUrl}/api/events?upcoming=false`);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("GET /api/events — does not duplicate materialized series events", async () => {
    // Insert a series
    db.run(
      `INSERT INTO event_series (type, title, startTime, recurrenceDay, startDate, endDate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["training", "Mat Series", "18:00", 3, "2026-03-01", "2026-03-31"],
    );

    // Materialize one instance (March 4 is a Wednesday)
    db.run(
      `INSERT INTO events (type, title, date, startTime, seriesId)
       VALUES (?, ?, ?, ?, ?)`,
      ["training", "Mat Series (edited)", "2026-03-04", "19:00", 1],
    );

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    // Should not have duplicate entries for 2026-03-04
    const march4Events = body.filter(
      (e: any) => e.date === "2026-03-04" && (e.title === "Mat Series" || e.title === "Mat Series (edited)"),
    );
    expect(march4Events).toHaveLength(1);
    // The materialized version should win
    expect(march4Events[0].title).toBe("Mat Series (edited)");
    expect(march4Events[0].startTime).toBe("19:00");
  });
});
