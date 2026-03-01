import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB } from "../../database.js";
import { generateJWT } from "../../auth.js";
import { statisticsRouter } from "../statistics.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;
let coachToken: string;
let parentToken: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", statisticsRouter);
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

function seedCoach(): number {
  db.run(
    "INSERT INTO guardians (phone, name, role, passwordHash) VALUES (?, ?, ?, ?)",
    ["+41791234567", "Coach Mike", "coach", "hashed"],
  );
  const res = db.exec("SELECT last_insert_rowid()");
  return res[0].values[0][0] as number;
}

function seedParent(): number {
  db.run(
    "INSERT INTO guardians (phone, name, role, passwordHash) VALUES (?, ?, ?, ?)",
    ["+41799999999", "Parent Anna", "parent", "hashed"],
  );
  const res = db.exec("SELECT last_insert_rowid()");
  return res[0].values[0][0] as number;
}

function seedPlayer(name: string): number {
  db.run("INSERT INTO players (name, category) VALUES (?, ?)", [name, "F"]);
  const res = db.exec("SELECT last_insert_rowid()");
  return res[0].values[0][0] as number;
}

function seedTrainingSchedule(): void {
  db.run(
    "INSERT INTO training_schedule (dayOfWeek, startTime, endTime) VALUES (?, ?, ?)",
    [3, "18:00", "19:30"],
  );
}

function seedTrainingEvent(date: string, coachId: number, category = "F"): number {
  db.run(
    "INSERT INTO events (type, title, date, startTime, categoryRequirement, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
    ["training", "Training", date, "18:00", category, coachId],
  );
  const res = db.exec("SELECT last_insert_rowid()");
  return res[0].values[0][0] as number;
}

function seedTournamentEvent(date: string, coachId: number): number {
  db.run(
    "INSERT INTO events (type, title, date, createdBy) VALUES (?, ?, ?, ?)",
    ["tournament", "Spring Cup", date, coachId],
  );
  const res = db.exec("SELECT last_insert_rowid()");
  return res[0].values[0][0] as number;
}

function seedAttendance(eventId: number, playerId: number, status: string): void {
  db.run(
    "INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)",
    [eventId, playerId, status],
  );
}

function seedTeamWithPlayers(eventId: number, playerIds: number[]): void {
  db.run("INSERT INTO teams (eventId, name) VALUES (?, ?)", [eventId, "Team A"]);
  const res = db.exec("SELECT last_insert_rowid()");
  const teamId = res[0].values[0][0] as number;
  for (const pid of playerIds) {
    db.run("INSERT INTO team_players (teamId, playerId) VALUES (?, ?)", [teamId, pid]);
  }
}

function seedAll() {
  const coachId = seedCoach();
  const parentId = seedParent();

  coachToken = generateJWT({ id: coachId, role: "coach" });
  parentToken = generateJWT({ id: parentId, role: "parent" });

  const lucaId = seedPlayer("Luca");
  const miaId = seedPlayer("Mia");
  const noahId = seedPlayer("Noah");

  seedTrainingSchedule();

  // 2026-02-04 = Wednesday, 2026-02-11 = Wednesday
  const event1Id = seedTrainingEvent("2026-02-04", coachId);
  const event2Id = seedTrainingEvent("2026-02-11", coachId);

  // Attendance
  seedAttendance(event1Id, lucaId, "attending");
  seedAttendance(event1Id, miaId, "absent");
  seedAttendance(event1Id, noahId, "unknown");
  seedAttendance(event2Id, lucaId, "attending");
  seedAttendance(event2Id, miaId, "attending");
  seedAttendance(event2Id, noahId, "attending");

  // Tournament
  const tournamentId = seedTournamentEvent("2026-03-15", coachId);
  seedTeamWithPlayers(tournamentId, [lucaId, noahId]);
}

describe("statistics routes", () => {
  beforeEach(async () => {
    await createTestApp();
    seedAll();
  });

  afterEach(async () => {
    await teardown();
  });

  // ---- Auth tests ----

  it("GET /api/admin/stats/training-hours without auth returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/training-hours`);
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/stats/training-hours with parent role returns 403", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/training-hours`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    expect(res.status).toBe(403);
  });

  // ---- Stat endpoints with coach JWT ----

  it("GET /api/admin/stats/training-hours with coach JWT returns 200 + array", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/training-hours`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/admin/stats/person-hours with coach JWT returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/person-hours`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/admin/stats/coach-hours with coach JWT returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/coach-hours`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/admin/stats/no-shows with coach JWT returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/no-shows`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/admin/stats/attendance-rate with coach JWT returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/attendance-rate`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/admin/stats/tournament-participation with coach JWT returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats/tournament-participation`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // ---- Export endpoints ----

  it("GET /api/admin/stats/export?format=csv&type=training-hours returns CSV", async () => {
    const res = await fetch(
      `${baseUrl}/api/admin/stats/export?format=csv&type=training-hours`,
      { headers: { Authorization: `Bearer ${coachToken}` } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("Team");
    expect(text).toContain("Sessions");
    expect(text).toContain("Hours");
  });

  it("GET /api/admin/stats/export?format=pdf&type=training-hours returns PDF", async () => {
    const res = await fetch(
      `${baseUrl}/api/admin/stats/export?format=pdf&type=training-hours`,
      { headers: { Authorization: `Bearer ${coachToken}` } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });

  it("GET /api/admin/stats/export?format=invalid returns 400", async () => {
    const res = await fetch(
      `${baseUrl}/api/admin/stats/export?format=invalid&type=training-hours`,
      { headers: { Authorization: `Bearer ${coachToken}` } },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("format");
  });

  it("GET /api/admin/stats/export without type returns 400", async () => {
    const res = await fetch(
      `${baseUrl}/api/admin/stats/export?format=csv`,
      { headers: { Authorization: `Bearer ${coachToken}` } },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("type");
  });
});
