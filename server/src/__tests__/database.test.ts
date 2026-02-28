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
    expect(tableNames).toContain("event_series");
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

    const KNOWN_TABLES = [
      "players", "guardians", "guardian_players", "event_series",
      "events", "attendance", "teams", "team_players",
      "vacation_periods", "training_schedule", "settings", "broadcasts",
    ] as const;

    const columns = (table: typeof KNOWN_TABLES[number]) => {
      if (!KNOWN_TABLES.includes(table)) {
        throw new Error(`Unknown table: ${table}`);
      }
      // Use pragma_table_info() table-valued function for safe parameterised access
      const info = db!.exec("SELECT * FROM pragma_table_info(?)", [table]);
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
        "language", "consentGiven", "accessToken", "resetToken",
        "resetTokenExpiry", "createdAt",
      ])
    );

    // guardian_players
    expect(columns("guardian_players")).toEqual(
      expect.arrayContaining(["guardianId", "playerId"])
    );

    // event_series
    expect(columns("event_series")).toEqual(
      expect.arrayContaining([
        "id", "type", "title", "description", "startTime", "attendanceTime",
        "location", "categoryRequirement", "maxParticipants", "minParticipants",
        "recurrenceDay", "startDate", "endDate", "customDates", "excludedDates",
        "deadlineOffsetHours", "createdBy", "createdAt",
      ])
    );

    // events
    expect(columns("events")).toEqual(
      expect.arrayContaining([
        "id", "type", "title", "description", "date", "startTime",
        "attendanceTime", "deadline", "maxParticipants", "minParticipants",
        "location", "categoryRequirement", "attachmentPath", "sourceUrl",
        "recurring", "recurrenceRule", "seriesId", "createdBy", "createdAt",
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

  it("creates event_series table with expected columns", async () => {
    db = await initDB();
    const info = db.exec("PRAGMA table_info(event_series)");
    const cols = info[0]?.values.map((r) => r[1]) ?? [];
    expect(cols).toContain("id");
    expect(cols).toContain("type");
    expect(cols).toContain("title");
    expect(cols).toContain("recurrenceDay");
    expect(cols).toContain("startDate");
    expect(cols).toContain("endDate");
    expect(cols).toContain("customDates");
    expect(cols).toContain("excludedDates");
    expect(cols).toContain("deadlineOffsetHours");
  });

  it("events table has seriesId column", async () => {
    db = await initDB();
    const info = db.exec("PRAGMA table_info(events)");
    const cols = info[0]?.values.map((r) => r[1]) ?? [];
    expect(cols).toContain("seriesId");
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

// BUG2: Setup shown even when admin exists (auto-persist)
describe("auto-persist after db.run", () => {
  it("persists admin creation across restart when dbPath is set", async () => {
    const dbFile = tmpDbPath();
    try {
      db = await initDB(dbFile);

      // Simulate POST /api/setup creating an admin
      db.run(
        "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, 'admin')",
        ["admin@test.com", "Admin", "admin@test.com", "hash"],
      );

      // Close without manually calling saveDB — auto-persist should have handled it
      db.close();
      db = null;

      // Reopen (simulating server restart)
      db = await initDB(dbFile);
      const result = db.exec(
        "SELECT COUNT(*) FROM guardians WHERE role IN ('admin', 'coach')",
      );
      const count = (result[0]?.values[0]?.[0] as number) ?? 0;
      expect(count).toBe(1);
    } finally {
      if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    }
  });

  it("does not auto-persist when no dbPath is given (in-memory only)", async () => {
    db = await initDB(); // no path — in-memory
    db.run(
      "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, 'admin')",
      ["admin@test.com", "Admin", "admin@test.com", "hash"],
    );

    // Data exists in-memory
    const result = db.exec(
      "SELECT COUNT(*) FROM guardians WHERE role IN ('admin', 'coach')",
    );
    expect((result[0]?.values[0]?.[0] as number) ?? 0).toBe(1);
  });
});

describe("getDB", () => {
  it("returns the singleton database instance after init", async () => {
    db = await initDB();
    const singleton = getDB();
    expect(singleton).toBe(db);
  });
});
