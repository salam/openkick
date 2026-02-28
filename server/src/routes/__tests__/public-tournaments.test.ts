import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB, getLastInsertId } from "../../database.js";
import { publicTournamentsRouter } from "../public-tournaments.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", publicTournamentsRouter);
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

describe("GET /api/public/tournaments/:id", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("should return tournament with team initials (no auth required)", async () => {
    db.run(
      "INSERT INTO events (type, title, date, startTime, location, teamName) VALUES ('tournament', 'Summer Cup', '2026-06-15', '09:00', 'Sportplatz', 'FC Example E1')"
    );
    const eventId = getLastInsertId();
    db.run(
      `INSERT INTO teams (eventId, name) VALUES (${eventId}, 'Team A')`
    );
    const teamId = getLastInsertId();
    db.run(
      "INSERT INTO players (name, yearOfBirth) VALUES ('Jonas', 2015)"
    );
    const p1 = getLastInsertId();
    db.run(
      "INSERT INTO players (name, yearOfBirth) VALUES ('Felix', 2015)"
    );
    const p2 = getLastInsertId();
    db.run(
      `INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p1})`
    );
    db.run(
      `INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p2})`
    );

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Summer Cup");
    expect(body.teamName).toBe("FC Example E1");
    expect(body.teams[0].players).toEqual([
      { initial: "F." },
      { initial: "J." },
    ]);
    // CRITICAL: no full names
    expect(JSON.stringify(body)).not.toContain("Jonas");
    expect(JSON.stringify(body)).not.toContain("Felix");
  });

  it("should 404 for non-tournament events", async () => {
    db.run(
      "INSERT INTO events (type, title, date) VALUES ('training', 'Training', '2026-06-15')"
    );
    const id = getLastInsertId();
    const res = await fetch(`${baseUrl}/api/public/tournaments/${id}`);
    expect(res.status).toBe(404);
  });

  it("should 404 for non-existent event", async () => {
    const res = await fetch(`${baseUrl}/api/public/tournaments/99999`);
    expect(res.status).toBe(404);
  });

  it("should disambiguate colliding initials", async () => {
    db.run(
      "INSERT INTO events (type, title, date) VALUES ('tournament', 'Cup', '2026-06-15')"
    );
    const eventId = getLastInsertId();
    db.run(
      `INSERT INTO teams (eventId, name) VALUES (${eventId}, 'Team A')`
    );
    const teamId = getLastInsertId();
    db.run(
      "INSERT INTO players (name, yearOfBirth, lastNameInitial) VALUES ('Jonas', 2015, 'M')"
    );
    const p1 = getLastInsertId();
    db.run(
      "INSERT INTO players (name, yearOfBirth, lastNameInitial) VALUES ('Jan', 2015, 'S')"
    );
    const p2 = getLastInsertId();
    db.run(
      `INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p1})`
    );
    db.run(
      `INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p2})`
    );

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    const body = await res.json();
    expect(body.teams[0].players).toEqual([
      { initial: "J. S." },
      { initial: "J. M." },
    ]);
  });

  it("should return status 'closed' when deadline has passed", async () => {
    db.run(
      "INSERT INTO events (type, title, date, deadline) VALUES ('tournament', 'Past Cup', '2026-06-15', '2020-01-01T00:00:00')"
    );
    const eventId = getLastInsertId();

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    const body = await res.json();
    expect(body.status).toBe("closed");
  });

  it("should return status 'closed' when maxParticipants reached", async () => {
    db.run(
      "INSERT INTO events (type, title, date, maxParticipants) VALUES ('tournament', 'Full Cup', '2026-06-15', 2)"
    );
    const eventId = getLastInsertId();
    db.run(
      "INSERT INTO players (name, yearOfBirth) VALUES ('A', 2015)"
    );
    const p1 = getLastInsertId();
    db.run(
      "INSERT INTO players (name, yearOfBirth) VALUES ('B', 2015)"
    );
    const p2 = getLastInsertId();
    db.run(
      `INSERT INTO attendance (eventId, playerId, status, source) VALUES (${eventId}, ${p1}, 'attending', 'web')`
    );
    db.run(
      `INSERT INTO attendance (eventId, playerId, status, source) VALUES (${eventId}, ${p2}, 'attending', 'web')`
    );

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    const body = await res.json();
    expect(body.status).toBe("closed");
    expect(body.attendingCount).toBe(2);
  });

  it("should return status 'closing_soon' when deadline < 48h away", async () => {
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO events (type, title, date, deadline) VALUES ('tournament', 'Soon Cup', '2026-06-15', '${soon}')`
    );
    const eventId = getLastInsertId();

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    const body = await res.json();
    expect(body.status).toBe("closing_soon");
  });

  it("should return status 'open' when no deadline constraints", async () => {
    db.run(
      "INSERT INTO events (type, title, date) VALUES ('tournament', 'Open Cup', '2026-06-15')"
    );
    const eventId = getLastInsertId();

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    const body = await res.json();
    expect(body.status).toBe("open");
  });
});
