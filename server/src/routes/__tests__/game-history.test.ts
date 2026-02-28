import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB, getLastInsertId } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const { gameHistoryRouter } = await import("../game-history.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api", gameHistoryRouter);
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

function seedTournament(title: string, date: string): number {
  const d = getDB();
  d.run(
    "INSERT INTO events (type, title, date) VALUES ('tournament', ?, ?)",
    [title, date],
  );
  return getLastInsertId();
}

function seedTickerEntries(tournamentId: number): void {
  const d = getDB();
  d.run(
    `INSERT INTO live_ticker_entries (tournamentId, matchLabel, homeTeam, awayTeam, score)
     VALUES (?, ?, ?, ?, ?)`,
    [tournamentId, "Group A", "FC Blue", "FC Red", "3:1"],
  );
  d.run(
    `INSERT INTO live_ticker_entries (tournamentId, matchLabel, homeTeam, awayTeam, score)
     VALUES (?, ?, ?, ?, ?)`,
    [tournamentId, "Final", "FC Blue", "FC Green", "2:0"],
  );
}

describe("Game History routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  // 1. GET /api/game-history — 200, empty array initially
  it("GET /api/game-history returns 200 with empty array initially", async () => {
    const res = await fetch(`${baseUrl}/api/game-history`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  // 2. POST /api/game-history — 201, creates entry
  it("POST /api/game-history creates entry and returns 201", async () => {
    const res = await fetch(`${baseUrl}/api/game-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentName: "Spring Cup",
        date: "2026-03-15",
        teamName: "U11",
        players: ["J.M.", "A.S."],
        matches: [
          { matchLabel: "Group A", homeTeam: "FC Blue", awayTeam: "FC Red", score: "2:1" },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.id).toBeGreaterThan(0);
  });

  // 3. GET /api/game-history/:id — 200, returns entry with players and matches
  it("GET /api/game-history/:id returns entry with players and matches", async () => {
    // Create an entry first
    const createRes = await fetch(`${baseUrl}/api/game-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentName: "Detail Cup",
        date: "2026-04-01",
        players: ["L.K."],
        matches: [{ homeTeam: "A", awayTeam: "B", score: "1:0" }],
      }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/game-history/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tournamentName).toBe("Detail Cup");
    expect(body.players).toContain("L.K.");
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].homeTeam).toBe("A");
  });

  // 4. GET /api/game-history/latest — 200, returns most recent
  it("GET /api/game-history/latest returns the most recent entry", async () => {
    await fetch(`${baseUrl}/api/game-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentName: "Old Cup", date: "2025-01-01" }),
    });
    await fetch(`${baseUrl}/api/game-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentName: "New Cup", date: "2026-06-01" }),
    });

    const res = await fetch(`${baseUrl}/api/game-history/latest`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tournamentName).toBe("New Cup");
  });

  // 5. PUT /api/game-history/:id/trophy — 200, sets trophy
  it("PUT /api/game-history/:id/trophy sets trophy type", async () => {
    const createRes = await fetch(`${baseUrl}/api/game-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentName: "Trophy Cup", date: "2026-05-01" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/game-history/${id}/trophy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trophyType: "first_place" }),
    });
    expect(res.status).toBe(200);

    // Verify
    const getRes = await fetch(`${baseUrl}/api/game-history/${id}`);
    const body = await getRes.json();
    expect(body.isTrophy).toBe(true);
    expect(body.trophyType).toBe("first_place");
  });

  // 6. POST /api/game-history/archive/:tournamentId — 200, archives tournament
  it("POST /api/game-history/archive/:tournamentId archives tournament", async () => {
    const tid = seedTournament("Summer Cup", "2026-07-01");
    seedTickerEntries(tid);

    const res = await fetch(`${baseUrl}/api/game-history/archive/${tid}`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");

    // Verify archived entry
    const getRes = await fetch(`${baseUrl}/api/game-history/${body.id}`);
    const entry = await getRes.json();
    expect(entry.tournamentName).toBe("Summer Cup");
    expect(entry.matches).toHaveLength(2);
  });

  // 7. DELETE /api/game-history/:id — 200, deletes entry
  it("DELETE /api/game-history/:id deletes entry", async () => {
    const createRes = await fetch(`${baseUrl}/api/game-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentName: "Delete Cup", date: "2026-08-01" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/game-history/${id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    // Verify deleted
    const getRes = await fetch(`${baseUrl}/api/game-history/${id}`);
    expect(getRes.status).toBe(404);
  });
});
