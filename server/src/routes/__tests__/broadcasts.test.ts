import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

// Mock the broadcasts service
vi.mock("../../services/broadcasts.js", () => ({
  composeTrainingHeadsup: vi.fn(),
  composeRainAlert: vi.fn(),
  composeHolidayAnnouncement: vi.fn(),
  sendBroadcast: vi.fn(),
}));

// Mock the weather service
vi.mock("../../services/weather.js", () => ({
  getWeatherForecast: vi.fn(),
}));

let db: Database;
let server: Server;
let baseUrl: string;
const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${generateJWT({ id: 1, role: "admin" })}`,
};

async function createTestApp() {
  db = await initDB();
  db.run("INSERT INTO guardians (id, phone, name, role, passwordHash) VALUES (1, '+41790000000', 'Admin', 'admin', 'hash')");
  const { broadcastsRouter } = await import("../broadcasts.js");
  const app = express();
  app.use(express.json());
  app.use("/api", broadcastsRouter);
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

describe("Broadcasts routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
    vi.restoreAllMocks();
  });

  it("POST /api/broadcasts — creates draft broadcast", async () => {
    const res = await fetch(`${baseUrl}/api/broadcasts`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        type: "training_headsup",
        message: "Morgen Training um 18:00!",
        scheduledFor: "2026-03-02T10:00:00",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.type).toBe("training_headsup");
    expect(body.message).toBe("Morgen Training um 18:00!");
    expect(body.status).toBe("draft");
    expect(body.scheduledFor).toBe("2026-03-02T10:00:00");
  });

  it("POST /api/broadcasts — returns 400 without type", async () => {
    const res = await fetch(`${baseUrl}/api/broadcasts`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ message: "No type" }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/broadcasts — returns all broadcasts", async () => {
    db.run(
      "INSERT INTO broadcasts (type, message, status) VALUES (?, ?, ?)",
      ["training_headsup", "Message 1", "draft"],
    );
    db.run(
      "INSERT INTO broadcasts (type, message, status) VALUES (?, ?, ?)",
      ["rain_alert", "Message 2", "sent"],
    );

    const res = await fetch(`${baseUrl}/api/broadcasts`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("PUT /api/broadcasts/:id — updates broadcast message before sending", async () => {
    db.run(
      "INSERT INTO broadcasts (type, message, status) VALUES (?, ?, ?)",
      ["training_headsup", "Old message", "draft"],
    );
    const id = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] as number;

    const res = await fetch(`${baseUrl}/api/broadcasts/${id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ message: "Updated message" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Updated message");
    expect(body.type).toBe("training_headsup");
  });

  it("PUT /api/broadcasts/:id — returns 404 for non-existent broadcast", async () => {
    const res = await fetch(`${baseUrl}/api/broadcasts/999`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ message: "Nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/broadcasts/:id/send — triggers sendBroadcast", async () => {
    db.run(
      "INSERT INTO broadcasts (type, message, status) VALUES (?, ?, ?)",
      ["training_headsup", "Send me!", "draft"],
    );
    const id = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] as number;

    const { sendBroadcast } = await import("../../services/broadcasts.js");
    const sendBroadcastMock = vi.mocked(sendBroadcast);
    sendBroadcastMock.mockResolvedValueOnce({ sent: 5 });

    const res = await fetch(`${baseUrl}/api/broadcasts/${id}/send`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(5);
    expect(sendBroadcastMock).toHaveBeenCalledWith(id);
  });

  it("POST /api/broadcasts/compose — returns composed training_headsup message preview", async () => {
    // Create an event in the DB
    db.run(
      "INSERT INTO events (type, title, date, startTime, location) VALUES (?, ?, ?, ?, ?)",
      ["training", "E-Junioren Training", "2026-03-02", "18:00", "Sportplatz A"],
    );
    const eventId = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] as number;

    const { getWeatherForecast } = await import("../../services/weather.js");
    const getWeatherMock = vi.mocked(getWeatherForecast);
    getWeatherMock.mockResolvedValueOnce({
      temperature: 15,
      precipitation: 20,
      weatherCode: 2,
      description: "Partly cloudy",
    });

    const { composeTrainingHeadsup } = await import("../../services/broadcasts.js");
    const composeMock = vi.mocked(composeTrainingHeadsup);
    composeMock.mockResolvedValueOnce("Morgen Training um 18:00 auf Sportplatz A!");

    const res = await fetch(`${baseUrl}/api/broadcasts/compose`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ template: "training_headsup", eventId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Morgen Training um 18:00 auf Sportplatz A!");
  });

  it("POST /api/broadcasts/compose — returns composed rain_alert message preview", async () => {
    db.run(
      "INSERT INTO events (type, title, date, startTime, location) VALUES (?, ?, ?, ?, ?)",
      ["training", "Training", "2026-03-02", "18:00", "Sportplatz A"],
    );
    const eventId = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] as number;

    const { composeRainAlert } = await import("../../services/broadcasts.js");
    const composeMock = vi.mocked(composeRainAlert);
    composeMock.mockResolvedValueOnce("Training fällt wegen Regen aus!");

    const res = await fetch(`${baseUrl}/api/broadcasts/compose`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ template: "rain_alert", eventId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Training fällt wegen Regen aus!");
  });

  it("POST /api/broadcasts/compose — returns composed holiday_announcement message preview", async () => {
    const { composeHolidayAnnouncement } = await import("../../services/broadcasts.js");
    const composeMock = vi.mocked(composeHolidayAnnouncement);
    composeMock.mockResolvedValueOnce("Schöne Frühlingsferien!");

    const res = await fetch(`${baseUrl}/api/broadcasts/compose`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        template: "holiday_announcement",
        vacationName: "Frühlingsferien",
        startDate: "2026-04-12",
        endDate: "2026-04-26",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Schöne Frühlingsferien!");
  });

  it("POST /api/broadcasts/compose — returns 400 for unknown template", async () => {
    const res = await fetch(`${baseUrl}/api/broadcasts/compose`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ template: "unknown_template" }),
    });
    expect(res.status).toBe(400);
  });
});
