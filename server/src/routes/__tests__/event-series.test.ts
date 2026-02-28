import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { eventSeriesRouter } from "../event-series.js";
import { eventsRouter } from "../events.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", eventSeriesRouter);
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

const SERIES_PAYLOAD = {
  type: "training",
  title: "Monday Training",
  description: "Weekly Monday session",
  startTime: "18:00",
  attendanceTime: "17:45",
  location: "Sportplatz A",
  categoryRequirement: "E,F",
  maxParticipants: 20,
  minParticipants: 8,
  recurrenceDay: 1, // Monday
  startDate: "2026-03-02",
  endDate: "2026-03-30",
  deadlineOffsetHours: 24,
};

async function createSeries(payload = SERIES_PAYLOAD) {
  const res = await fetch(`${baseUrl}/api/event-series`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res;
}

describe("Event Series routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  // 1. POST /api/event-series — creates series, returns 201 with id
  it("POST /api/event-series — creates series and returns 201 with id", async () => {
    const res = await createSeries();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.type).toBe("training");
    expect(body.title).toBe("Monday Training");
    expect(body.recurrenceDay).toBe(1);
    expect(body.startDate).toBe("2026-03-02");
    expect(body.endDate).toBe("2026-03-30");
    expect(body.deadlineOffsetHours).toBe(24);
    expect(body.location).toBe("Sportplatz A");
  });

  // 2. POST /api/event-series — rejects missing title (400)
  it("POST /api/event-series — rejects missing title with 400", async () => {
    const res = await fetch(`${baseUrl}/api/event-series`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "training",
        recurrenceDay: 1,
        startDate: "2026-03-02",
        endDate: "2026-03-30",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  // 3. GET /api/event-series — lists all series
  it("GET /api/event-series — lists all series", async () => {
    await createSeries();
    await createSeries({ ...SERIES_PAYLOAD, title: "Friday Training", recurrenceDay: 5 });

    const res = await fetch(`${baseUrl}/api/event-series`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  // 4. GET /api/event-series/:id — returns { series, instances } with expanded dates
  it("GET /api/event-series/:id — returns series with expanded instances", async () => {
    const createRes = await createSeries();
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/event-series/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("series");
    expect(body).toHaveProperty("instances");
    expect(body.series.id).toBe(id);
    expect(body.series.title).toBe("Monday Training");
    // March 2026 has Mondays on 2, 9, 16, 23, 30
    expect(body.instances).toHaveLength(5);
    expect(body.instances[0].date).toBe("2026-03-02");
    expect(body.instances[4].date).toBe("2026-03-30");
    // Virtual instances should not be materialized
    expect(body.instances[0].materialized).toBe(false);
  });

  // 4b. GET /api/event-series/:id — returns 404 for non-existent
  it("GET /api/event-series/:id — returns 404 for non-existent series", async () => {
    const res = await fetch(`${baseUrl}/api/event-series/999`);
    expect(res.status).toBe(404);
  });

  // 5. PUT /api/event-series/:id — updates template fields
  it("PUT /api/event-series/:id — updates template fields", async () => {
    const createRes = await createSeries();
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/event-series/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Training", location: "Field B" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Updated Training");
    expect(body.location).toBe("Field B");
    // Original fields remain
    expect(body.type).toBe("training");
    expect(body.recurrenceDay).toBe(1);
  });

  // 5b. PUT /api/event-series/:id — returns 404 for non-existent
  it("PUT /api/event-series/:id — returns 404 for non-existent series", async () => {
    const res = await fetch(`${baseUrl}/api/event-series/999`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });
    expect(res.status).toBe(404);
  });

  // 6. DELETE /api/event-series/:id — returns 204, subsequent GET returns 404
  it("DELETE /api/event-series/:id — deletes series and materialized events", async () => {
    const createRes = await createSeries();
    const { id } = await createRes.json();

    // Materialize an event first
    await fetch(`${baseUrl}/api/event-series/${id}/materialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-03-02" }),
    });

    const delRes = await fetch(`${baseUrl}/api/event-series/${id}`, { method: "DELETE" });
    expect(delRes.status).toBe(204);

    // Series should be gone
    const getRes = await fetch(`${baseUrl}/api/event-series/${id}`);
    expect(getRes.status).toBe(404);

    // Materialized events should also be gone
    const eventsRows = db.exec("SELECT * FROM events WHERE seriesId = ?", [id]);
    expect(eventsRows.length).toBe(0);
  });

  // 6b. DELETE /api/event-series/:id — returns 404 for non-existent
  it("DELETE /api/event-series/:id — returns 404 for non-existent series", async () => {
    const res = await fetch(`${baseUrl}/api/event-series/999`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  // 7. POST /api/event-series/:id/exclude — excludes a date
  it("POST /api/event-series/:id/exclude — excludes a date from instances", async () => {
    const createRes = await createSeries();
    const { id } = await createRes.json();

    // Exclude March 9
    const excludeRes = await fetch(`${baseUrl}/api/event-series/${id}/exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-03-09" }),
    });
    expect(excludeRes.status).toBe(200);

    // Verify the excluded date is gone from instances
    const getRes = await fetch(`${baseUrl}/api/event-series/${id}`);
    const body = await getRes.json();
    // Was 5 Mondays, now 4 after excluding March 9
    expect(body.instances).toHaveLength(4);
    const dates = body.instances.map((i: { date: string }) => i.date);
    expect(dates).not.toContain("2026-03-09");
  });

  // 7b. POST /api/event-series/:id/exclude — returns 404 for non-existent
  it("POST /api/event-series/:id/exclude — returns 404 for non-existent series", async () => {
    const res = await fetch(`${baseUrl}/api/event-series/999/exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-03-09" }),
    });
    expect(res.status).toBe(404);
  });

  // 8. POST /api/event-series/:id/materialize — creates real event row
  it("POST /api/event-series/:id/materialize — creates a real event row", async () => {
    const createRes = await createSeries();
    const { id: seriesId } = await createRes.json();

    const matRes = await fetch(`${baseUrl}/api/event-series/${seriesId}/materialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-03-02" }),
    });
    expect(matRes.status).toBe(201);
    const event = await matRes.json();
    expect(typeof event.id).toBe("number");
    expect(event.seriesId).toBe(seriesId);
    expect(event.date).toBe("2026-03-02");
    expect(event.title).toBe("Monday Training");
    expect(event.type).toBe("training");
    expect(event.startTime).toBe("18:00");
    expect(event.location).toBe("Sportplatz A");
    // Deadline should be computed (24 hours before 2026-03-02 18:00)
    expect(event.deadline).toBe("2026-03-01T18:00:00");
  });

  // 8b. POST /api/event-series/:id/materialize — returns 409 if already materialized
  it("POST /api/event-series/:id/materialize — returns 409 if already materialized", async () => {
    const createRes = await createSeries();
    const { id: seriesId } = await createRes.json();

    // First materialization
    await fetch(`${baseUrl}/api/event-series/${seriesId}/materialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-03-02" }),
    });

    // Second materialization — should be conflict
    const matRes = await fetch(`${baseUrl}/api/event-series/${seriesId}/materialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-03-02" }),
    });
    expect(matRes.status).toBe(409);
  });

  // 8c. Materialized event shows as materialized in GET instances
  it("GET /api/event-series/:id — materialized events show materialized=true", async () => {
    const createRes = await createSeries();
    const { id: seriesId } = await createRes.json();

    // Materialize March 9
    await fetch(`${baseUrl}/api/event-series/${seriesId}/materialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-03-09" }),
    });

    const getRes = await fetch(`${baseUrl}/api/event-series/${seriesId}`);
    const body = await getRes.json();
    const march9 = body.instances.find((i: { date: string }) => i.date === "2026-03-09");
    expect(march9).toBeDefined();
    expect(march9.materialized).toBe(true);
    expect(typeof march9.id).toBe("number");
  });
});
