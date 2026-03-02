import { describe, it, expect, beforeAll } from "vitest";
import { initDB, getDB } from "../../database.js";
import {
  getResults,
  createResults,
  updateResults,
  deleteResults,
} from "../tournament-results.js";

describe("tournament_results table", () => {
  beforeAll(async () => {
    await initDB(); // in-memory
  });

  it("should create tournament_results table", () => {
    const db = getDB();
    const tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tournament_results'"
    );
    expect(tables.length).toBe(1);
    expect(tables[0].values[0][0]).toBe("tournament_results");
  });

  it("should have teamName column on events table", () => {
    const db = getDB();
    const cols = db.exec("PRAGMA table_info(events)");
    const colNames = cols[0].values.map((r) => r[1]);
    expect(colNames).toContain("teamName");
  });

  it("should enforce unique eventId constraint", () => {
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Test Cup', '2026-03-01')");
    const eventId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    db.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams) VALUES (?, 1, 8)",
      [eventId]
    );
    expect(() => {
      db.run(
        "INSERT INTO tournament_results (eventId, placement, totalTeams) VALUES (?, 2, 8)",
        [eventId]
      );
    }).toThrow();
  });

  it("should cascade delete when event is deleted", () => {
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Del Cup', '2026-04-01')");
    const eventId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    db.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams, summary) VALUES (?, 1, 6, 'Great win')",
      [eventId]
    );
    db.run("DELETE FROM events WHERE id = ?", [eventId]);
    const results = db.exec("SELECT * FROM tournament_results WHERE eventId = ?", [eventId]);
    expect(results.length === 0 || results[0].values.length === 0).toBe(true);
  });
});

describe("tournament-results service", () => {
  let testEventId: number;

  beforeAll(async () => {
    await initDB();
    const db = getDB();
    db.run(
      "INSERT INTO events (type, title, date) VALUES ('tournament', 'Service Cup', '2026-05-01')"
    );
    testEventId = db.exec("SELECT last_insert_rowid()")[0]
      .values[0][0] as number;
  });

  it("getResults returns null when no results exist", () => {
    expect(getResults(testEventId)).toBeNull();
  });

  it("createResults stores and returns results", () => {
    const result = createResults(testEventId, {
      placement: 2,
      totalTeams: 10,
      summary: "Great tournament",
      resultsUrl: "https://example.com/results",
      achievements: [{ type: "2nd_place", label: "2nd Place" }],
    });
    expect(result.eventId).toBe(testEventId);
    expect(result.placement).toBe(2);
    expect(result.totalTeams).toBe(10);
    expect(result.achievements).toEqual([
      { type: "2nd_place", label: "2nd Place" },
    ]);
  });

  it("getResults returns existing results", () => {
    const result = getResults(testEventId);
    expect(result).not.toBeNull();
    expect(result!.placement).toBe(2);
  });

  it("updateResults modifies existing results", () => {
    const result = updateResults(testEventId, {
      placement: 1,
      achievements: [
        { type: "1st_place", label: "1st Place" },
        { type: "fair_play", label: "Fair Play" },
      ],
    });
    expect(result!.placement).toBe(1);
    expect(result!.achievements).toHaveLength(2);
  });

  it("deleteResults removes results", () => {
    deleteResults(testEventId);
    expect(getResults(testEventId)).toBeNull();
  });

  it("createResults rejects invalid event type", () => {
    const db = getDB();
    db.run(
      "INSERT INTO events (type, title, date) VALUES ('training', 'Practice', '2026-05-02')"
    );
    const trainingId = db.exec("SELECT last_insert_rowid()")[0]
      .values[0][0] as number;
    expect(() =>
      createResults(trainingId, { placement: 1, totalTeams: 4 })
    ).toThrow();
  });

  it("createResults rejects placement > totalTeams", () => {
    expect(() =>
      createResults(testEventId, { placement: 10, totalTeams: 5 })
    ).toThrow();
  });

  it("validates achievement types", () => {
    expect(() =>
      createResults(testEventId, {
        placement: 1,
        totalTeams: 8,
        achievements: [{ type: "invalid_type", label: "Bad" }],
      })
    ).toThrow();
  });
});
