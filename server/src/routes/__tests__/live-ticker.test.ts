import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB, getLastInsertId } from "../../database.js";
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
  db.run("INSERT INTO guardians (id, phone, name, role, passwordHash) VALUES (1, '+41790000000', 'Admin', 'admin', 'hash')");
  const { liveTickerRouter } = await import("../live-ticker.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api", liveTickerRouter);
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

function seedTournament(date: string): number {
  const d = getDB();
  d.run(
    "INSERT INTO events (type, title, date) VALUES ('tournament', 'Test Cup', ?)",
    [date],
  );
  return getLastInsertId();
}

describe("Live Ticker routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("GET /api/live-ticker/active — returns 200 with empty array when no active tournaments", async () => {
    const res = await fetch(`${baseUrl}/api/live-ticker/active`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("GET /api/live-ticker/:tournamentId — returns 200 with entries for a tournament", async () => {
    const tid = seedTournament("2026-03-01");
    const res = await fetch(`${baseUrl}/api/live-ticker/${tid}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("POST /api/live-ticker/:tournamentId/manual — creates a manual entry and returns 201", async () => {
    const tid = seedTournament("2026-03-01");
    const res = await fetch(`${baseUrl}/api/live-ticker/${tid}/manual`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        home: "FC Blue",
        away: "FC Red",
        score: "2-1",
        matchLabel: "Group A",
        matchTime: "10:00",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("success", true);

    // Verify the entry exists
    const entriesRes = await fetch(`${baseUrl}/api/live-ticker/${tid}`);
    const entries = await entriesRes.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].homeTeam).toBe("FC Blue");
    expect(entries[0].awayTeam).toBe("FC Red");
    expect(entries[0].score).toBe("2-1");
  });

  it("POST /api/live-ticker/:tournamentId/manual — returns 400 without required fields", async () => {
    const tid = seedTournament("2026-03-01");
    const res = await fetch(`${baseUrl}/api/live-ticker/${tid}/manual`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ home: "FC Blue" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/live-ticker/:tournamentId/crawl-config — sets a crawl config", async () => {
    const tid = seedTournament("2026-03-01");
    const res = await fetch(
      `${baseUrl}/api/live-ticker/${tid}/crawl-config`,
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          url: "https://example.com/results",
          intervalMin: 5,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("success", true);
  });

  it("PUT /api/live-ticker/:tournamentId/crawl-config — returns 400 without url", async () => {
    const tid = seedTournament("2026-03-01");
    const res = await fetch(
      `${baseUrl}/api/live-ticker/${tid}/crawl-config`,
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/live-ticker/:tournamentId/crawl-configs — returns crawl configs", async () => {
    const tid = seedTournament("2026-03-01");

    // Set a config first
    await fetch(`${baseUrl}/api/live-ticker/${tid}/crawl-config`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ url: "https://example.com/results" }),
    });

    const res = await fetch(
      `${baseUrl}/api/live-ticker/${tid}/crawl-configs`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].url).toBe("https://example.com/results");
  });

  it("DELETE /api/live-ticker/crawl-config/:id — deactivates a config", async () => {
    const tid = seedTournament("2026-03-01");

    // Set a config first
    await fetch(`${baseUrl}/api/live-ticker/${tid}/crawl-config`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ url: "https://example.com/results" }),
    });

    // Get the config id
    const configsRes = await fetch(
      `${baseUrl}/api/live-ticker/${tid}/crawl-configs`,
    );
    const configs = await configsRes.json();
    const configId = configs[0].id;

    const res = await fetch(
      `${baseUrl}/api/live-ticker/crawl-config/${configId}`,
      { method: "DELETE", headers: authHeaders },
    );
    expect(res.status).toBe(200);

    // Verify it's gone from active configs
    const afterRes = await fetch(
      `${baseUrl}/api/live-ticker/${tid}/crawl-configs`,
    );
    const afterConfigs = await afterRes.json();
    expect(afterConfigs).toHaveLength(0);
  });
});
