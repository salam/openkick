import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { teamsRouter } from "../teams.js";
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
  app.use("/api", teamsRouter);
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

function createEvent(): number {
  db.run(
    "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
    ["training", "Test Event", "2026-03-01"],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function createPlayer(name: string, category?: string): number {
  db.run("INSERT INTO players (name, category) VALUES (?, ?)", [name, category ?? null]);
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function setAttending(eventId: number, playerId: number): void {
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source) VALUES (?, ?, 'attending', 'web')",
    [eventId, playerId],
  );
}

describe("Teams routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/events/:eventId/teams — auto-assigns and returns teams", async () => {
    const eventId = createEvent();
    const playerIds: number[] = [];
    for (let i = 1; i <= 6; i++) {
      playerIds.push(createPlayer(`Player${i}`));
    }
    for (const pid of playerIds) {
      setAttending(eventId, pid);
    }

    const res = await fetch(`${baseUrl}/api/events/${eventId}/teams`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ teamCount: 2 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teams).toHaveLength(2);
    expect(body.teams[0].players).toHaveLength(3);
    expect(body.teams[1].players).toHaveLength(3);
  });

  it("POST /api/events/:eventId/teams — returns 400 without teamCount", async () => {
    const eventId = createEvent();

    const res = await fetch(`${baseUrl}/api/events/${eventId}/teams`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("GET /api/events/:eventId/teams — returns team compositions", async () => {
    const eventId = createEvent();
    const playerIds: number[] = [];
    for (let i = 1; i <= 4; i++) {
      playerIds.push(createPlayer(`Player${i}`));
    }
    for (const pid of playerIds) {
      setAttending(eventId, pid);
    }

    // First assign teams
    await fetch(`${baseUrl}/api/events/${eventId}/teams`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ teamCount: 2 }),
    });

    // Then get them
    const res = await fetch(`${baseUrl}/api/events/${eventId}/teams`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    for (const team of body) {
      expect(team).toHaveProperty("id");
      expect(team).toHaveProperty("name");
      expect(team).toHaveProperty("players");
    }
  });

  it("PUT /api/teams/:teamId/players — manually adjusts team players", async () => {
    const eventId = createEvent();
    const p1 = createPlayer("P1");
    const p2 = createPlayer("P2");
    const p3 = createPlayer("P3");
    const p4 = createPlayer("P4");
    for (const pid of [p1, p2, p3, p4]) {
      setAttending(eventId, pid);
    }

    // Assign teams first
    const assignRes = await fetch(`${baseUrl}/api/events/${eventId}/teams`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ teamCount: 2 }),
    });
    const assignBody = await assignRes.json();
    const teamId = assignBody.teams[0].id;

    // Manually set players for team
    const res = await fetch(`${baseUrl}/api/teams/${teamId}/players`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ playerIds: [p1, p2, p3] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.players).toHaveLength(3);
    expect(body.players.map((p: { id: number }) => p.id).sort()).toEqual([p1, p2, p3].sort());
  });

  it("PUT /api/teams/:teamId/players — returns 404 for nonexistent team", async () => {
    const res = await fetch(`${baseUrl}/api/teams/9999/players`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ playerIds: [1] }),
    });

    expect(res.status).toBe(404);
  });

  it("DELETE /api/events/:eventId/teams — clears all teams", async () => {
    const eventId = createEvent();
    const playerIds: number[] = [];
    for (let i = 1; i <= 4; i++) {
      playerIds.push(createPlayer(`Player${i}`));
    }
    for (const pid of playerIds) {
      setAttending(eventId, pid);
    }

    // Assign teams
    await fetch(`${baseUrl}/api/events/${eventId}/teams`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ teamCount: 2 }),
    });

    // Delete teams
    const res = await fetch(`${baseUrl}/api/events/${eventId}/teams`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${generateJWT({ id: 1, role: "admin" })}` },
    });
    expect(res.status).toBe(204);

    // Verify they're gone
    const getRes = await fetch(`${baseUrl}/api/events/${eventId}/teams`);
    const body = await getRes.json();
    expect(body).toHaveLength(0);
  });
});
