import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

// Mock CaptchaProvider that always succeeds
const mockCaptchaProvider = {
  generateChallenge: async () => ({
    challenge: "test",
    salt: "test",
    algorithm: "SHA-256",
    signature: "test",
    maxnumber: 100000,
  }),
  verifySolution: async () => true,
};

async function createTestApp() {
  db = await initDB();
  const { createRsvpRouter } = await import("../rsvp.js");
  const app = express();
  app.use(express.json());
  app.use("/api/rsvp", createRsvpRouter(mockCaptchaProvider as any));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

function seedGuardianAndPlayer() {
  db.run(
    "INSERT INTO players (name, yearOfBirth, category) VALUES ('Luca Mueller', 2016, 'E')"
  );
  db.run(
    "INSERT INTO guardians (name, phone, role, accessToken, consentGiven) VALUES ('Maria Mueller', '491234567', 'parent', 'test-token-abc', 1)"
  );
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (1, 1)"
  );
}

function seedEvent() {
  db.run(
    "INSERT INTO events (title, date, startTime, type) VALUES ('Training', '2026-03-07', '18:00', 'training')"
  );
}

describe("RSVP API", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // GET /resolve
  it("resolves valid token + event", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    const res = await fetch(
      `${baseUrl}/api/rsvp/resolve?token=test-token-abc&event=1`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.players).toHaveLength(1);
    expect(data.players[0].firstName).toBe("Luca");
    expect(data.event.title).toBe("Training");
  });

  it("returns 404 for invalid token", async () => {
    seedEvent();
    const res = await fetch(
      `${baseUrl}/api/rsvp/resolve?token=bad-token&event=1`
    );
    expect(res.status).toBe(404);
  });

  // POST /search
  it("searches player by name with captcha", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1, captcha: "valid" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rsvpToken).toBeDefined();
    expect(data.playerInitials).toBe("L. M.");
  });

  // BUGu — full search→confirm flow uses rsvpToken field consistently
  it("search→confirm end-to-end with rsvpToken field", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    const searchRes = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1, captcha: "valid" }),
    });
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    // Server returns 'rsvpToken', not 'token'
    expect(searchData.rsvpToken).toBeDefined();
    expect(searchData.token).toBeUndefined();

    // Confirm using the rsvpToken from search
    const confirmRes = await fetch(`${baseUrl}/api/rsvp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvpToken: searchData.rsvpToken, status: "attending" }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmData = await confirmRes.json();
    expect(confirmData.finalStatus).toBe("attending");
  });

  it("returns 404 for no match", async () => {
    seedEvent();
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nonexistent",
        eventId: 1,
        captcha: "valid",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing captcha", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1 }),
    });
    expect(res.status).toBe(400);
  });

  // POST /confirm with accessToken
  it("confirms attendance with accessToken", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    const res = await fetch(`${baseUrl}/api/rsvp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: "test-token-abc",
        playerId: 1,
        eventId: 1,
        status: "attending",
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.finalStatus).toBe("attending");
  });

  // POST /confirm with rsvpToken
  it("confirms attendance with rsvpToken", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    // First create an rsvp token
    db.run(
      "INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('rsvp-tok-1', 1, 1, datetime('now', '+1 hour'))"
    );
    const res = await fetch(`${baseUrl}/api/rsvp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvpToken: "rsvp-tok-1", status: "attending" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.finalStatus).toBe("attending");
    // Verify token is marked as used
    const rows = db.exec(
      "SELECT used FROM rsvp_tokens WHERE token = 'rsvp-tok-1'"
    );
    expect(rows[0].values[0][0]).toBe(1);
  });

  it("rejects expired rsvpToken", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    db.run(
      "INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('rsvp-expired', 1, 1, datetime('now', '-1 hour'))"
    );
    const res = await fetch(`${baseUrl}/api/rsvp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rsvpToken: "rsvp-expired",
        status: "attending",
      }),
    });
    expect(res.status).toBe(403);
  });

  // BUGu — sending 'token' instead of 'rsvpToken' must fail with "Token required"
  it("returns 400 when confirm body uses wrong field name 'token'", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    db.run(
      "INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('rsvp-tok-field', 1, 1, datetime('now', '+1 hour'))"
    );
    const res = await fetch(`${baseUrl}/api/rsvp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "rsvp-tok-field", status: "attending" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Token required");
  });

  // BUGv — past events can still be RSVP'd to
  it("allows RSVP on past events", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    // Update the event date to the past
    db.run("UPDATE events SET date = '2024-01-01' WHERE id = 1");
    db.run(
      "INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('rsvp-past', 1, 1, datetime('now', '+1 hour'))"
    );
    const res = await fetch(`${baseUrl}/api/rsvp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvpToken: "rsvp-past", status: "absent" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.finalStatus).toBe("absent");
  });

  // GET /settings
  it("returns requirePhone false by default", async () => {
    const res = await fetch(`${baseUrl}/api/rsvp/settings`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requirePhone).toBe(false);
  });

  it("returns requirePhone true when setting enabled", async () => {
    db.run("INSERT INTO settings (key, value) VALUES ('rsvp_require_phone', 'true')");
    const res = await fetch(`${baseUrl}/api/rsvp/settings`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requirePhone).toBe(true);
  });

  // Phone validation in search
  it("search succeeds without phone when setting disabled", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1, captcha: "valid" }),
    });
    expect(res.status).toBe(200);
  });

  it("search requires phone when setting enabled", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    db.run("INSERT INTO settings (key, value) VALUES ('rsvp_require_phone', 'true')");
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1, captcha: "valid" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Phone required");
  });

  it("search succeeds with matching phone when setting enabled", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    db.run("INSERT INTO settings (key, value) VALUES ('rsvp_require_phone', 'true')");
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1, captcha: "valid", phone: "491234567" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rsvpToken).toBeDefined();
  });

  it("search rejects mismatched phone when setting enabled", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    db.run("INSERT INTO settings (key, value) VALUES ('rsvp_require_phone', 'true')");
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1, captcha: "valid", phone: "999999999" }),
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Phone mismatch");
  });

  it("search accepts phone in different formats when setting enabled", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    db.run("INSERT INTO settings (key, value) VALUES ('rsvp_require_phone', 'true')");
    // Guardian phone is '491234567', try with + prefix and spaces
    const res = await fetch(`${baseUrl}/api/rsvp/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Luca Mueller", eventId: 1, captcha: "valid", phone: "+49 123 4567" }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects used rsvpToken", async () => {
    seedGuardianAndPlayer();
    seedEvent();
    db.run(
      "INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt, used) VALUES ('rsvp-used', 1, 1, datetime('now', '+1 hour'), 1)"
    );
    const res = await fetch(`${baseUrl}/api/rsvp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvpToken: "rsvp-used", status: "attending" }),
    });
    expect(res.status).toBe(403);
  });
});
