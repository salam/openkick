import { describe, it, expect, beforeEach } from "vitest";
import { initDB, getDB } from "../../database.js";
import type { Database } from "sql.js";
import {
  getOrCreateSession,
  updateSessionState,
  resetSession,
  isDuplicate,
  logMessage,
} from "../whatsapp-session.js";

let db: Database;

describe("whatsapp_sessions table", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it("creates whatsapp_sessions table", () => {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name='whatsapp_sessions'");
    expect(tables[0]?.values).toHaveLength(1);
  });

  it("creates message_log table", () => {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name='message_log'");
    expect(tables[0]?.values).toHaveLength(1);
  });

  it("creates rsvp_tokens table", () => {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name='rsvp_tokens'");
    expect(tables[0]?.values).toHaveLength(1);
  });

  it("enforces unique phone on whatsapp_sessions", () => {
    db.run("INSERT INTO whatsapp_sessions (phone, state) VALUES ('123', 'idle')");
    expect(() =>
      db.run("INSERT INTO whatsapp_sessions (phone, state) VALUES ('123', 'idle')")
    ).toThrow();
  });

  it("enforces unique wahaMessageId on message_log", () => {
    db.run("INSERT INTO message_log (wahaMessageId, phone, direction, body) VALUES ('msg1', '123', 'in', 'hi')");
    expect(() =>
      db.run("INSERT INTO message_log (wahaMessageId, phone, direction, body) VALUES ('msg1', '456', 'in', 'hello')")
    ).toThrow();
  });

  it("enforces unique token on rsvp_tokens", () => {
    // Insert prerequisite rows to satisfy foreign key constraints
    db.run("INSERT INTO players (id, name) VALUES (1, 'Alice')");
    db.run("INSERT INTO players (id, name) VALUES (2, 'Bob')");
    db.run("INSERT INTO events (id, type, title, date) VALUES (1, 'training', 'Training', '2099-01-01')");
    db.run("INSERT INTO events (id, type, title, date) VALUES (2, 'training', 'Training 2', '2099-01-02')");

    db.run("INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('tok1', 1, 1, '2099-01-01')");
    expect(() =>
      db.run("INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES ('tok1', 2, 2, '2099-01-01')")
    ).toThrow();
  });
});

describe("whatsapp-session service", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it("creates a new session for unknown phone", () => {
    const session = getOrCreateSession("491234567");
    expect(session.phone).toBe("491234567");
    expect(session.state).toBe("idle");
    expect(JSON.parse(session.context)).toEqual({});
  });

  it("returns existing session for known phone", () => {
    getOrCreateSession("491234567");
    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");
  });

  it("updates session state and context", () => {
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_name", { guardianName: null });
    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_name");
    expect(JSON.parse(session.context)).toEqual({ guardianName: null });
  });

  it("resets session to idle", () => {
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_name", {});
    resetSession("491234567");
    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");
  });

  it("detects duplicate messages", () => {
    logMessage("msg-abc-123", "491234567", "in", "hello");
    expect(isDuplicate("msg-abc-123")).toBe(true);
    expect(isDuplicate("msg-xyz-789")).toBe(false);
  });

  it("logs messages with intent", () => {
    logMessage("msg-1", "491234567", "in", "Luca kommt", "attending");
    const db2 = getDB();
    const rows = db2.exec("SELECT * FROM message_log WHERE wahaMessageId = 'msg-1'");
    expect(rows[0].values).toHaveLength(1);
    expect(rows[0].values[0][5]).toBe("attending"); // intent column
  });
});
