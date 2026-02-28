import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initDB, saveDB, getDB } from "../database.js";
import type { Database } from "sql.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `openkick-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

// Reset singleton between tests
let db: Database | null = null;

afterEach(() => {
  if (db) {
    db.close();
    db = null;
  }
});

describe("initDB", () => {
  it("creates all required tables", async () => {
    db = await initDB();

    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = result[0].values.map((row) => row[0] as string);

    expect(tableNames).toContain("attendance");
    expect(tableNames).toContain("broadcasts");
    expect(tableNames).toContain("events");
    expect(tableNames).toContain("guardian_players");
    expect(tableNames).toContain("guardians");
    expect(tableNames).toContain("players");
    expect(tableNames).toContain("settings");
    expect(tableNames).toContain("team_players");
    expect(tableNames).toContain("teams");
    expect(tableNames).toContain("training_schedule");
    expect(tableNames).toContain("vacation_periods");
  });

  it("is idempotent (running twice does not error)", async () => {
    db = await initDB();
    // Run the schema creation again on the same db — should not throw
    const db2 = await initDB();
    db2.close();
  });

  it("persists data across close and reopen", async () => {
    const dbFile = tmpDbPath();
    try {
      // Open, insert data, save, close
      db = await initDB(dbFile);
      db.run("INSERT INTO players (name) VALUES (?)", ["Alice"]);
      saveDB(db, dbFile);
      db.close();
      db = null;

      // Reopen and verify data
      db = await initDB(dbFile);
      const result = db.exec("SELECT name FROM players");
      expect(result[0].values[0][0]).toBe("Alice");
    } finally {
      if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    }
  });

  it("all tables have correct columns", async () => {
    db = await initDB();

    const columns = (table: string) => {
      const info = db!.exec(`PRAGMA table_info(${table})`);
      return info[0].values.map((row) => row[1] as string);
    };

    // players
    expect(columns("players")).toEqual(
      expect.arrayContaining(["id", "name", "yearOfBirth", "category", "position", "notes", "createdAt"])
    );

    // guardians
    expect(columns("guardians")).toEqual(
      expect.arrayContaining([
        "id", "phone", "name", "email", "passwordHash", "role",
        "language", "consentGiven", "accessToken", "createdAt",
      ])
    );

    // guardian_players
    expect(columns("guardian_players")).toEqual(
      expect.arrayContaining(["guardianId", "playerId"])
    );

    // events
    expect(columns("events")).toEqual(
      expect.arrayContaining([
        "id", "type", "title", "description", "date", "startTime",
        "attendanceTime", "deadline", "maxParticipants", "minParticipants",
        "location", "categoryRequirement", "attachmentPath", "sourceUrl",
        "recurring", "recurrenceRule", "createdBy", "createdAt",
      ])
    );

    // attendance
    expect(columns("attendance")).toEqual(
      expect.arrayContaining(["id", "eventId", "playerId", "status", "reason", "respondedAt", "source"])
    );

    // teams
    expect(columns("teams")).toEqual(
      expect.arrayContaining(["id", "eventId", "name"])
    );

    // team_players
    expect(columns("team_players")).toEqual(
      expect.arrayContaining(["teamId", "playerId"])
    );

    // vacation_periods
    expect(columns("vacation_periods")).toEqual(
      expect.arrayContaining(["id", "name", "startDate", "endDate", "source", "createdAt"])
    );

    // training_schedule
    expect(columns("training_schedule")).toEqual(
      expect.arrayContaining([
        "id", "dayOfWeek", "startTime", "endTime", "location",
        "categoryFilter", "validFrom", "validTo",
      ])
    );

    // settings
    expect(columns("settings")).toEqual(
      expect.arrayContaining(["key", "value"])
    );

    // broadcasts
    expect(columns("broadcasts")).toEqual(
      expect.arrayContaining([
        "id", "type", "templateKey", "message", "status",
        "scheduledFor", "sentAt", "createdBy",
      ])
    );
  });

  it("seeds default settings on first init", async () => {
    db = await initDB();

    const result = db.exec("SELECT key, value FROM settings ORDER BY key");
    const settings = Object.fromEntries(
      result[0].values.map((row) => [row[0], row[1]])
    );

    expect(settings).toHaveProperty("bot_language");
    expect(settings).toHaveProperty("llm_provider");
    expect(settings).toHaveProperty("waha_url");
  });

  it("does not duplicate default settings when run twice", async () => {
    const dbFile = tmpDbPath();
    try {
      db = await initDB(dbFile);
      saveDB(db, dbFile);
      db.close();
      db = null;

      db = await initDB(dbFile);
      const result = db.exec("SELECT COUNT(*) FROM settings WHERE key = 'bot_language'");
      expect(result[0].values[0][0]).toBe(1);
    } finally {
      if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    }
  });
});

describe("getDB", () => {
  it("returns the singleton database instance after init", async () => {
    db = await initDB();
    const singleton = getDB();
    expect(singleton).toBe(db);
  });
});
