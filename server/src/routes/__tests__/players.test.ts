import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { playersRouter } from "../players.js";
import { getCategoryForBirthYear, getSeasonYear } from "../../services/categories.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", playersRouter);
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

// ── Players ──────────────────────────────────────────────────────────

describe("Players routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/players — creates a player with name, yearOfBirth; returns { id, name, yearOfBirth, category }", async () => {
    const res = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Max Müller", yearOfBirth: 2016 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("Max Müller");
    expect(body.yearOfBirth).toBe(2016);
    expect(body).toHaveProperty("category");
  });

  it("POST /api/players — auto-computes SFV category from yearOfBirth", async () => {
    const yearOfBirth = 2016;
    const expectedCategory = getCategoryForBirthYear(yearOfBirth);

    const res = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anna Schmidt", yearOfBirth }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.category).toBe(expectedCategory);
  });

  it("GET /api/players — returns all players with computed category", async () => {
    // Create two players
    await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Player One", yearOfBirth: 2015 }),
    });
    await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Player Two", yearOfBirth: 2018 }),
    });

    const res = await fetch(`${baseUrl}/api/players`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty("category");
    expect(body[1]).toHaveProperty("category");
  });

  it("GET /api/players/:id — returns single player with guardian info", async () => {
    // Create a player
    const createRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Solo Player", yearOfBirth: 2014 }),
    });
    const { id: playerId } = await createRes.json();

    // Create a guardian and link them
    const gRes = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41791234567", name: "Papa Solo", role: "parent" }),
    });
    const { id: guardianId } = await gRes.json();

    await fetch(`${baseUrl}/api/guardians/${guardianId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });

    const res = await fetch(`${baseUrl}/api/players/${playerId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Solo Player");
    expect(body).toHaveProperty("category");
    expect(Array.isArray(body.guardians)).toBe(true);
    expect(body.guardians).toHaveLength(1);
    expect(body.guardians[0].name).toBe("Papa Solo");
  });

  it("PUT /api/players/:id — updates player name, yearOfBirth, position, notes", async () => {
    const createRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Old Name", yearOfBirth: 2015 }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/players/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Name",
        yearOfBirth: 2014,
        position: "Sturm",
        notes: "Schnell",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
    expect(body.yearOfBirth).toBe(2014);
    expect(body.position).toBe("Sturm");
    expect(body.notes).toBe("Schnell");
  });

  it("PUT /api/players/:id with category field — allows manual category override", async () => {
    const createRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Override Kid", yearOfBirth: 2016 }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/players/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "D-9" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.category).toBe("D-9");

    // Verify it persists on GET
    const getRes = await fetch(`${baseUrl}/api/players/${id}`);
    const getBody = await getRes.json();
    expect(getBody.category).toBe("D-9");
  });

  it("POST /api/players — accepts and returns lastNameInitial", async () => {
    const res = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jonas", yearOfBirth: 2015, lastNameInitial: "M" }),
    });
    expect(res.status).toBe(201);
    const player = await res.json();
    expect(player.lastNameInitial).toBe("M");
  });

  it("PUT /api/players/:id — updates lastNameInitial", async () => {
    const createRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jonas", yearOfBirth: 2015 }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/players/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastNameInitial: "S" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastNameInitial).toBe("S");

    // Verify it persists on GET
    const getRes = await fetch(`${baseUrl}/api/players/${id}`);
    const getBody = await getRes.json();
    expect(getBody.lastNameInitial).toBe("S");
  });

  it("DELETE /api/players/:id — removes player", async () => {
    const createRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "To Delete", yearOfBirth: 2015 }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/players/${id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const getRes = await fetch(`${baseUrl}/api/players/${id}`);
    expect(getRes.status).toBe(404);
  });
});

// ── Guardians ────────────────────────────────────────────────────────

describe("Guardians routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/guardians — creates guardian with phone, name, role", async () => {
    const res = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41791234567", name: "Mama Test", role: "parent" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.phone).toBe("+41791234567");
    expect(body.name).toBe("Mama Test");
    expect(body.role).toBe("parent");
  });

  it("GET /api/guardians — returns all guardians", async () => {
    await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41791111111", name: "G1", role: "parent" }),
    });
    await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41792222222", name: "G2", role: "parent" }),
    });

    const res = await fetch(`${baseUrl}/api/guardians`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("POST /api/guardians/:id/players — links guardian to player", async () => {
    const playerRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Linked Kid", yearOfBirth: 2015 }),
    });
    const { id: playerId } = await playerRes.json();

    const guardianRes = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41793333333", name: "Linker", role: "parent" }),
    });
    const { id: guardianId } = await guardianRes.json();

    const res = await fetch(`${baseUrl}/api/guardians/${guardianId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.guardianId).toBe(guardianId);
    expect(body.playerId).toBe(playerId);
  });

  it("GET /api/guardians/:id — returns guardian with linked players", async () => {
    const playerRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Child A", yearOfBirth: 2016 }),
    });
    const { id: playerId } = await playerRes.json();

    const guardianRes = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41794444444", name: "Parent A", role: "parent" }),
    });
    const { id: guardianId } = await guardianRes.json();

    await fetch(`${baseUrl}/api/guardians/${guardianId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });

    const res = await fetch(`${baseUrl}/api/guardians/${guardianId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Parent A");
    expect(Array.isArray(body.players)).toBe(true);
    expect(body.players).toHaveLength(1);
    expect(body.players[0].name).toBe("Child A");
  });

  it("PUT /api/guardians/:id — updates guardian name, phone, email", async () => {
    const createRes = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41791000000", name: "Old Name", role: "parent" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/guardians/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name", email: "new@test.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
    expect(body.email).toBe("new@test.com");
    expect(body.phone).toBe("+41791000000");
  });

  it("PUT /api/guardians/:id — returns 404 for nonexistent guardian", async () => {
    const res = await fetch(`${baseUrl}/api/guardians/9999`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nobody" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/guardians/:guardianId/players/:playerId — unlinks guardian from player", async () => {
    const playerRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unlink Kid", yearOfBirth: 2015 }),
    });
    const { id: playerId } = await playerRes.json();

    const guardianRes = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41792000000", name: "Unlinker", role: "parent" }),
    });
    const { id: guardianId } = await guardianRes.json();

    await fetch(`${baseUrl}/api/guardians/${guardianId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });

    // Unlink
    const res = await fetch(`${baseUrl}/api/guardians/${guardianId}/players/${playerId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    // Guardian still exists
    const gRes = await fetch(`${baseUrl}/api/guardians/${guardianId}`);
    expect(gRes.status).toBe(200);

    // Player has no guardians
    const pRes = await fetch(`${baseUrl}/api/players/${playerId}`);
    const player = await pRes.json();
    expect(player.guardians).toHaveLength(0);
  });

  it("POST /api/guardians — returns existing guardian when phone already exists (BUG-GUARDIAN-DUP)", async () => {
    // Create first guardian
    const res1 = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41791234567", name: "Mama Test", role: "parent" }),
    });
    expect(res1.status).toBe(201);
    const guardian1 = await res1.json();

    // Create second guardian with same phone — should return existing, not crash
    const res2 = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41791234567", name: "Mama Test", role: "parent" }),
    });
    expect(res2.status).toBe(200);
    const guardian2 = await res2.json();

    // Same guardian returned
    expect(guardian2.id).toBe(guardian1.id);
    expect(guardian2.phone).toBe("+41791234567");
  });

  it("DELETE /api/guardians/:guardianId/players/:playerId — returns 404 for nonexistent link", async () => {
    const res = await fetch(`${baseUrl}/api/guardians/9999/players/9999`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/guardians/:id — deletes guardian and all links", async () => {
    const playerRes = await fetch(`${baseUrl}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Orphan Kid", yearOfBirth: 2016 }),
    });
    const { id: playerId } = await playerRes.json();

    const guardianRes = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+41793000000", name: "Deletable", role: "parent" }),
    });
    const { id: guardianId } = await guardianRes.json();

    await fetch(`${baseUrl}/api/guardians/${guardianId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });

    // Delete guardian
    const res = await fetch(`${baseUrl}/api/guardians/${guardianId}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    // Guardian gone
    const gRes = await fetch(`${baseUrl}/api/guardians/${guardianId}`);
    expect(gRes.status).toBe(404);

    // Player has no guardians
    const pRes = await fetch(`${baseUrl}/api/players/${playerId}`);
    const player = await pRes.json();
    expect(player.guardians).toHaveLength(0);
  });

  it("DELETE /api/guardians/:id — rejects deletion of coach/admin role", async () => {
    const guardianRes = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+41794000000",
        name: "Coach Protected",
        email: "coach@prot.com",
        password: "pass123",
        role: "coach",
      }),
    });
    const { id: guardianId } = await guardianRes.json();

    const res = await fetch(`${baseUrl}/api/guardians/${guardianId}`, { method: "DELETE" });
    expect(res.status).toBe(403);

    // Guardian still exists
    const gRes = await fetch(`${baseUrl}/api/guardians/${guardianId}`);
    expect(gRes.status).toBe(200);
  });

  it("POST /api/guardians/login — email+password login returns JWT", async () => {
    // Create a coach with email and password
    await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+41795555555",
        name: "Coach Test",
        email: "coach@test.com",
        password: "securepass123",
        role: "coach",
      }),
    });

    const res = await fetch(`${baseUrl}/api/guardians/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "coach@test.com", password: "securepass123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
    expect(body.token.split(".")).toHaveLength(3); // JWT format
  });

  it("POST /api/guardians with role=coach and password — hashes password on creation", async () => {
    const res = await fetch(`${baseUrl}/api/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+41796666666",
        name: "Coach Secure",
        email: "secure@test.com",
        password: "mypassword",
        role: "coach",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe("coach");
    // Password should NOT be in the response
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("passwordHash");

    // Verify the password is hashed in DB (login should work)
    const loginRes = await fetch(`${baseUrl}/api/guardians/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "secure@test.com", password: "mypassword" }),
    });
    expect(loginRes.status).toBe(200);
  });
});
