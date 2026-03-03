import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { calendarRouter } from "../calendar.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;
const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${generateJWT({ id: 1, role: "admin" })}`,
};

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", calendarRouter);
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

// ── Training Schedule CRUD ──────────────────────────────────────────

describe("Training Schedule routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/training-schedule — creates recurring training day", async () => {
    const res = await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "19:30",
        location: "Sportplatz A",
        categoryFilter: "E,F",
        validFrom: "2026-01-01",
        validTo: "2026-06-30",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.dayOfWeek).toBe(1);
    expect(body.startTime).toBe("18:00");
    expect(body.endTime).toBe("19:30");
    expect(body.location).toBe("Sportplatz A");
    expect(body.categoryFilter).toBe("E,F");
    expect(body.validFrom).toBe("2026-01-01");
    expect(body.validTo).toBe("2026-06-30");
  });

  it("POST /api/training-schedule — returns 400 if required fields missing", async () => {
    const res = await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ dayOfWeek: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/training-schedule — returns all training schedules", async () => {
    // Create two schedules
    await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ dayOfWeek: 1, startTime: "18:00", endTime: "19:30" }),
    });
    await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ dayOfWeek: 3, startTime: "17:30", endTime: "19:00" }),
    });

    const res = await fetch(`${baseUrl}/api/training-schedule`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("PUT /api/training-schedule/:id — updates training schedule", async () => {
    const createRes = await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ dayOfWeek: 1, startTime: "18:00", endTime: "19:30" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/training-schedule/${id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ startTime: "17:00", location: "Halle B" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.startTime).toBe("17:00");
    expect(body.location).toBe("Halle B");
    // Original fields should remain
    expect(body.dayOfWeek).toBe(1);
    expect(body.endTime).toBe("19:30");
  });

  it("PUT /api/training-schedule/:id — returns 404 for non-existent schedule", async () => {
    const res = await fetch(`${baseUrl}/api/training-schedule/999`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ startTime: "17:00" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/training-schedule/:id — removes training schedule", async () => {
    const createRes = await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ dayOfWeek: 1, startTime: "18:00", endTime: "19:30" }),
    });
    const { id } = await createRes.json();

    const delRes = await fetch(`${baseUrl}/api/training-schedule/${id}`, { method: "DELETE", headers: authHeaders });
    expect(delRes.status).toBe(204);

    // Should be gone
    const getRes = await fetch(`${baseUrl}/api/training-schedule`);
    const body = await getRes.json();
    expect(body).toHaveLength(0);
  });

  it("DELETE /api/training-schedule/:id — returns 404 for non-existent schedule", async () => {
    const res = await fetch(`${baseUrl}/api/training-schedule/999`, { method: "DELETE", headers: authHeaders });
    expect(res.status).toBe(404);
  });
});

// ── Vacation CRUD ───────────────────────────────────────────────────

describe("Vacation routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/vacations — creates custom vacation period", async () => {
    const res = await fetch(`${baseUrl}/api/vacations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Sportferien",
        startDate: "2026-02-09",
        endDate: "2026-02-22",
        source: "manual",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("Sportferien");
    expect(body.startDate).toBe("2026-02-09");
    expect(body.endDate).toBe("2026-02-22");
    expect(body.source).toBe("manual");
  });

  it("POST /api/vacations — returns 400 if required fields missing", async () => {
    const res = await fetch(`${baseUrl}/api/vacations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/vacations — returns all vacation periods", async () => {
    await fetch(`${baseUrl}/api/vacations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Sportferien", startDate: "2026-02-09", endDate: "2026-02-22", source: "manual" }),
    });
    await fetch(`${baseUrl}/api/vacations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Herbstferien", startDate: "2026-10-05", endDate: "2026-10-18", source: "manual" }),
    });

    const res = await fetch(`${baseUrl}/api/vacations`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("DELETE /api/vacations/:id — removes vacation period", async () => {
    const createRes = await fetch(`${baseUrl}/api/vacations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Sportferien", startDate: "2026-02-09", endDate: "2026-02-22", source: "manual" }),
    });
    const { id } = await createRes.json();

    const delRes = await fetch(`${baseUrl}/api/vacations/${id}`, { method: "DELETE", headers: authHeaders });
    expect(delRes.status).toBe(204);

    const getRes = await fetch(`${baseUrl}/api/vacations`);
    const body = await getRes.json();
    expect(body).toHaveLength(0);
  });

  it("DELETE /api/vacations/:id — returns 404 for non-existent vacation", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/999`, { method: "DELETE", headers: authHeaders });
    expect(res.status).toBe(404);
  });

  it("POST /api/vacations/import-ics — accepts ICS content and creates vacation periods", async () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260209
DTEND;VALUE=DATE:20260222
SUMMARY:Sportferien
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261005
DTEND;VALUE=DATE:20261018
SUMMARY:Herbstferien
END:VEVENT
END:VCALENDAR`;

    const res = await fetch(`${baseUrl}/api/vacations/import-ics`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ icsContent }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.imported).toBe(2);

    // Verify they are stored
    const getRes = await fetch(`${baseUrl}/api/vacations`);
    const vacations = await getRes.json();
    expect(vacations).toHaveLength(2);
    expect(vacations[0].source).toBe("ics-import");
  });

  it("POST /api/vacations/import-url — accepts URL and extracts vacation periods via LLM", async () => {
    // Mock the extractHolidaysFromUrl function
    const { extractHolidaysFromUrl } = await import("../../services/holidays.js");
    const mockExtract = vi.spyOn(await import("../../services/holidays.js"), "extractHolidaysFromUrl");
    mockExtract.mockResolvedValueOnce([
      { name: "Sportferien", startDate: "2026-02-09", endDate: "2026-02-22", source: "https://example.com" },
    ]);

    const res = await fetch(`${baseUrl}/api/vacations/import-url`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ url: "https://example.com/holidays" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.imported).toBe(1);

    mockExtract.mockRestore();
  });

  it("GET /api/vacations/presets — returns grouped preset list with selected", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/presets`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toBeInstanceOf(Array);
    expect(body.groups.length).toBeGreaterThanOrEqual(3);
    expect(body.groups[0].group).toBeTruthy();
    expect(body.groups[0].presets.length).toBeGreaterThan(0);
    expect(typeof body.selected).toBe("string");
  });

  it("POST /api/vacations/sync — syncs a preset by id", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/sync`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ presetId: "ch-zurich" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBeGreaterThan(0);
    expect(body.source).toBe("fallback");
    expect(body.upcoming).toBeDefined();
    expect(Array.isArray(body.upcoming)).toBe(true);

    // Verify they are in the DB
    const getRes = await fetch(`${baseUrl}/api/vacations`);
    const vacations = await getRes.json();
    expect(vacations.length).toBeGreaterThan(0);
    expect(vacations[0].source).toBe("preset:ch-zurich");

    // Verify the preset was persisted in settings for auto-sync
    const presetsRes = await fetch(`${baseUrl}/api/vacations/presets`);
    const presetsBody = await presetsRes.json();
    expect(presetsBody.selected).toBe("ch-zurich");
  });

  it("POST /api/vacations/sync — returns 400 for unknown preset", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/sync`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ presetId: "xx-unknown" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/vacations/sync — returns 400 if presetId missing", async () => {
    const res = await fetch(`${baseUrl}/api/vacations/sync`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

// ── Calendar Endpoint ───────────────────────────────────────────────

describe("Calendar endpoint", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("GET /api/calendar?year=2026 — returns events, trainings, vacations for the year", async () => {
    // Create a training schedule: Monday (1)
    await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "19:30",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      }),
    });

    // Create an event in the events table directly
    db.run(
      "INSERT INTO events (type, title, date, startTime) VALUES (?, ?, ?, ?)",
      ["tournament", "Spring Cup", "2026-04-15", "10:00"]
    );

    const res = await fetch(`${baseUrl}/api/calendar?year=2026`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("events");
    expect(body).toHaveProperty("trainings");
    expect(body).toHaveProperty("vacations");
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.trainings)).toBe(true);
    expect(Array.isArray(body.vacations)).toBe(true);

    // Should have events
    expect(body.events.length).toBeGreaterThanOrEqual(1);

    // Should have many Monday trainings in 2026
    expect(body.trainings.length).toBeGreaterThan(40);
  });

  it("GET /api/calendar?month=2026-03 — returns data filtered to March 2026", async () => {
    // Create a training schedule: Wednesday (3)
    await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dayOfWeek: 3,
        startTime: "17:30",
        endTime: "19:00",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      }),
    });

    // Create events in and out of March
    db.run("INSERT INTO events (type, title, date) VALUES (?, ?, ?)", ["training", "March Event", "2026-03-15"]);
    db.run("INSERT INTO events (type, title, date) VALUES (?, ?, ?)", ["training", "April Event", "2026-04-15"]);

    const res = await fetch(`${baseUrl}/api/calendar?month=2026-03`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Only March event
    expect(body.events).toHaveLength(1);
    expect(body.events[0].title).toBe("March Event");

    // March 2026 has Wednesdays on: 4, 11, 18, 25
    expect(body.trainings).toHaveLength(4);
    // All should be in March
    for (const t of body.trainings) {
      expect(t.date.startsWith("2026-03")).toBe(true);
    }
  });

  it("Trainings during vacation weeks are auto-marked as cancelled", async () => {
    // Create a training schedule: Monday (1)
    await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "19:30",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      }),
    });

    // Create a vacation period covering some Mondays in March
    await fetch(`${baseUrl}/api/vacations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Test Vacation",
        startDate: "2026-03-09",
        endDate: "2026-03-15",
        source: "manual",
      }),
    });

    const res = await fetch(`${baseUrl}/api/calendar?month=2026-03`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // March 2026 Mondays: 2, 9, 16, 23, 30
    expect(body.trainings.length).toBe(5);

    // The training on March 9 should be cancelled (within vacation period)
    const march9 = body.trainings.find((t: any) => t.date === "2026-03-09");
    expect(march9).toBeDefined();
    expect(march9.cancelled).toBe(true);

    // Trainings outside vacation should not be cancelled
    const march2 = body.trainings.find((t: any) => t.date === "2026-03-02");
    expect(march2).toBeDefined();
    expect(march2.cancelled).toBe(false);
  });

  it("GET /api/calendar — returns attendance counts per event", async () => {
    // Create an event in March 2026
    db.run(
      "INSERT INTO events (type, title, date, startTime) VALUES (?, ?, ?, ?)",
      ["tournament", "Attendance Cup", "2026-03-15", "10:00"],
    );
    const eventId = (db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number);

    // Create 3 players
    db.run("INSERT INTO players (name) VALUES (?)", ["Alice"]);
    const player1 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
    db.run("INSERT INTO players (name) VALUES (?)", ["Bob"]);
    const player2 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
    db.run("INSERT INTO players (name) VALUES (?)", ["Charlie"]);
    const player3 = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;

    // Add attendance records: 1 yes, 1 no, 1 unknown
    db.run(
      "INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)",
      [eventId, player1, "yes"],
    );
    db.run(
      "INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)",
      [eventId, player2, "no"],
    );
    db.run(
      "INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)",
      [eventId, player3, "unknown"],
    );

    const res = await fetch(`${baseUrl}/api/calendar?month=2026-03`);
    expect(res.status).toBe(200);
    const body = await res.json();

    const event = body.events.find((e: any) => e.title === "Attendance Cup");
    expect(event).toBeDefined();
    expect(event.attendingCount).toBe(1);
    expect(event.absentCount).toBe(1);
    expect(event.totalPlayers).toBe(3);
  });

  it("GET /api/calendar — training instances have null attendance counts", async () => {
    await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dayOfWeek: 3,
        startTime: "17:30",
        endTime: "19:00",
        validFrom: "2026-03-01",
        validTo: "2026-03-31",
      }),
    });

    const res = await fetch(`${baseUrl}/api/calendar?month=2026-03`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.trainings.length).toBeGreaterThan(0);
    for (const t of body.trainings) {
      expect(t.attendingCount).toBeNull();
      expect(t.absentCount).toBeNull();
      expect(t.totalPlayers).toBeNull();
    }
  });

  it("GET /api/calendar — returns 400 if no year or month parameter", async () => {
    const res = await fetch(`${baseUrl}/api/calendar`);
    expect(res.status).toBe(400);
  });

  it("GET /api/calendar?month=2026-03 — includes expanded series instances in events array", async () => {
    // Insert an event series: every Wednesday in March 2026
    db.run(
      `INSERT INTO event_series (type, title, description, startTime, attendanceTime, location,
        categoryRequirement, maxParticipants, minParticipants, recurrenceDay, startDate, endDate,
        customDates, excludedDates, deadlineOffsetHours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "training", "Wed Series", "Series for calendar", "18:00", "17:45", "Platz C",
        "E", 20, 8, 3, "2026-03-01", "2026-06-30",
        null, null, 24,
      ],
    );

    // Also create a standalone event in March
    db.run(
      "INSERT INTO events (type, title, date, startTime) VALUES (?, ?, ?, ?)",
      ["tournament", "March Cup", "2026-03-20", "10:00"],
    );

    const res = await fetch(`${baseUrl}/api/calendar?month=2026-03`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Standalone event should be present
    const standalone = body.events.find((e: any) => e.title === "March Cup");
    expect(standalone).toBeDefined();

    // March 2026 Wednesdays: 4, 11, 18, 25 → 4 series instances
    const seriesInstances = body.events.filter((e: any) => e.title === "Wed Series");
    expect(seriesInstances.length).toBe(4);

    // Verify fields
    expect(seriesInstances[0].seriesId).toBeDefined();
    expect(seriesInstances[0].type).toBe("training");
    expect(seriesInstances[0].startTime).toBe("18:00");
    expect(seriesInstances[0].location).toBe("Platz C");
  });

  it("GET /api/calendar — series instances respect vacation periods", async () => {
    // Insert a series: every Wednesday in March 2026
    db.run(
      `INSERT INTO event_series (type, title, startTime, recurrenceDay, startDate, endDate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["training", "Vacation-Test Series", "18:00", 3, "2026-03-01", "2026-03-31"],
    );

    // Add vacation covering March 11 (a Wednesday)
    db.run(
      "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
      ["Test Break", "2026-03-09", "2026-03-15", "manual"],
    );

    const res = await fetch(`${baseUrl}/api/calendar?month=2026-03`);
    const body = await res.json();

    // March Wednesdays: 4, 11, 18, 25. But 11 is in vacation → 3 instances
    const seriesInstances = body.events.filter((e: any) => e.title === "Vacation-Test Series");
    expect(seriesInstances.length).toBe(3);
    expect(seriesInstances.find((e: any) => e.date === "2026-03-11")).toBeUndefined();
  });

  it("Training schedule validFrom/validTo are respected", async () => {
    // Schedule valid only in February
    await fetch(`${baseUrl}/api/training-schedule`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "19:30",
        validFrom: "2026-02-01",
        validTo: "2026-02-28",
      }),
    });

    // March calendar should have no trainings
    const res = await fetch(`${baseUrl}/api/calendar?month=2026-03`);
    const body = await res.json();
    expect(body.trainings).toHaveLength(0);

    // February calendar should have trainings
    const febRes = await fetch(`${baseUrl}/api/calendar?month=2026-02`);
    const febBody = await febRes.json();
    // Feb 2026 Mondays: 2, 9, 16, 23
    expect(febBody.trainings).toHaveLength(4);
  });
});
