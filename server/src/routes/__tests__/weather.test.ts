import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

// Mock the weather service
vi.mock("../../services/weather.js", () => ({
  getWeatherForecast: vi.fn(),
}));

// Mock the geocoding service
vi.mock("../../services/geocoding.js", () => ({
  geocodeLocation: vi.fn(),
}));

import { getWeatherForecast } from "../../services/weather.js";
import { geocodeLocation } from "../../services/geocoding.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const { weatherRouter } = await import("../weather.js");
  const app = express();
  app.use(express.json());
  app.use("/api", weatherRouter);
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

const MOCK_FORECAST = {
  temperature: 18,
  precipitation: 10,
  weatherCode: 0,
  description: "Sunny",
};

describe("Weather routes", () => {
  beforeEach(async () => {
    vi.mocked(getWeatherForecast).mockReset();
    vi.mocked(geocodeLocation).mockReset();
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  // ── GET /api/weather/current ──────────────────────────────────────

  it("GET /api/weather/current — returns 404 when no club coordinates are configured", async () => {
    // No latitude/longitude settings inserted
    const res = await fetch(`${baseUrl}/api/weather/current`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No club coordinates configured");
  });

  it("GET /api/weather/current — returns forecast when coordinates exist", async () => {
    // Insert club coordinates into settings
    db.run("INSERT INTO settings (key, value) VALUES ('latitude', '47.38')");
    db.run("INSERT INTO settings (key, value) VALUES ('longitude', '8.54')");

    vi.mocked(getWeatherForecast).mockResolvedValue(MOCK_FORECAST);

    const res = await fetch(`${baseUrl}/api/weather/current`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.temperature).toBe(18);
    expect(body.precipitation).toBe(10);
    expect(body.weatherCode).toBe(0);
    expect(body.description).toBe("Sunny");
    expect(body.icon).toBe("☀️");
    expect(vi.mocked(getWeatherForecast)).toHaveBeenCalledWith(
      47.38,
      8.54,
      expect.any(String),
      expect.any(String),
    );
  });

  // ── GET /api/events/:id/weather ───────────────────────────────────

  it("GET /api/events/:id/weather — returns 404 for non-existent event", async () => {
    const res = await fetch(`${baseUrl}/api/events/9999/weather`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Event not found");
  });

  it("GET /api/events/:id/weather — returns forecast for valid event within 7 days", async () => {
    // Create an event that is tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    db.run(
      "INSERT INTO events (id, type, title, date, startTime, location) VALUES (1, 'training', 'Training', ?, '18:00', 'Sportplatz Zürich')",
      [dateStr],
    );

    // Insert club coordinates as fallback
    db.run("INSERT INTO settings (key, value) VALUES ('latitude', '47.38')");
    db.run("INSERT INTO settings (key, value) VALUES ('longitude', '8.54')");

    vi.mocked(geocodeLocation).mockResolvedValue({
      latitude: 47.39,
      longitude: 8.55,
    });
    vi.mocked(getWeatherForecast).mockResolvedValue(MOCK_FORECAST);

    const res = await fetch(`${baseUrl}/api/events/1/weather`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.temperature).toBe(18);
    expect(body.icon).toBe("☀️");
    expect(vi.mocked(geocodeLocation)).toHaveBeenCalledWith("Sportplatz Zürich");
    expect(vi.mocked(getWeatherForecast)).toHaveBeenCalledWith(
      47.39,
      8.55,
      dateStr,
      "18:00",
    );
  });

  it("GET /api/events/:id/weather — returns 404 for events more than 7 days away", async () => {
    // Create an event 10 days from now
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const dateStr = futureDate.toISOString().slice(0, 10);

    db.run(
      "INSERT INTO events (id, type, title, date, startTime) VALUES (2, 'game', 'Future Game', ?, '15:00')",
      [dateStr],
    );

    const res = await fetch(`${baseUrl}/api/events/2/weather`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Weather forecast not available for this date");
  });

  it("GET /api/events/:id/weather — supports synthetic series IDs", async () => {
    // Create an event series
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    db.run(
      "INSERT INTO event_series (id, type, title, startTime, location, recurrenceDay, startDate, endDate) VALUES (1, 'training', 'Weekly Training', '19:00', 'Kunstrasen', 3, '2026-01-01', '2026-12-31')",
    );

    // Insert club coordinates as fallback
    db.run("INSERT INTO settings (key, value) VALUES ('latitude', '47.38')");
    db.run("INSERT INTO settings (key, value) VALUES ('longitude', '8.54')");

    vi.mocked(geocodeLocation).mockResolvedValue({
      latitude: 47.40,
      longitude: 8.56,
    });
    vi.mocked(getWeatherForecast).mockResolvedValue({
      ...MOCK_FORECAST,
      weatherCode: 61,
      description: "Light rain",
    });

    const res = await fetch(
      `${baseUrl}/api/events/series-1-${dateStr}/weather`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe("Light rain");
    expect(body.icon).toBe("🌧️");
    expect(vi.mocked(geocodeLocation)).toHaveBeenCalledWith("Kunstrasen");
    expect(vi.mocked(getWeatherForecast)).toHaveBeenCalledWith(
      47.40,
      8.56,
      dateStr,
      "19:00",
    );
  });

  it("GET /api/events/:id/weather — returns 404 for non-existent series", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const res = await fetch(
      `${baseUrl}/api/events/series-999-${dateStr}/weather`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Event series not found");
  });

  it("GET /api/events/:id/weather — falls back to club coordinates when no event location", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    db.run(
      "INSERT INTO events (id, type, title, date, startTime) VALUES (3, 'training', 'No Location Event', ?, '10:00')",
      [dateStr],
    );

    // Insert club coordinates
    db.run("INSERT INTO settings (key, value) VALUES ('latitude', '47.38')");
    db.run("INSERT INTO settings (key, value) VALUES ('longitude', '8.54')");

    vi.mocked(getWeatherForecast).mockResolvedValue(MOCK_FORECAST);

    const res = await fetch(`${baseUrl}/api/events/3/weather`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.temperature).toBe(18);
    // geocodeLocation should not be called since location is null
    expect(vi.mocked(geocodeLocation)).not.toHaveBeenCalled();
    expect(vi.mocked(getWeatherForecast)).toHaveBeenCalledWith(
      47.38,
      8.54,
      dateStr,
      "10:00",
    );
  });

  it("GET /api/events/:id/weather — returns 404 when no coordinates available at all", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    db.run(
      "INSERT INTO events (id, type, title, date, startTime, location) VALUES (4, 'game', 'Somewhere', ?, '14:00', 'Unknown Place')",
      [dateStr],
    );

    // geocodeLocation fails, no club coordinates configured
    vi.mocked(geocodeLocation).mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/events/4/weather`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No coordinates available");
  });
});
