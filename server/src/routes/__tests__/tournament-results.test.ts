import { describe, it, expect, beforeAll } from "vitest";
import { initDB, getDB, getLastInsertId } from "../../database.js";

describe("tournament-results routes (unit)", () => {
  beforeAll(async () => {
    await initDB();
  });

  it("routes file should be importable", async () => {
    const mod = await import("../tournament-results.js");
    expect(mod.tournamentResultsRouter).toBeDefined();
  });
});

describe("trophy cabinet query", () => {
  beforeAll(async () => {
    await initDB();
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Cup A', '2026-01-15')");
    const id1 = getLastInsertId();
    db.run("INSERT INTO tournament_results (eventId, placement, totalTeams, achievements) VALUES (?, 1, 8, ?)", [id1, JSON.stringify([{ type: "1st_place", label: "1st Place" }])]);
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Cup B', '2026-03-10')");
    const id2 = getLastInsertId();
    db.run("INSERT INTO tournament_results (eventId, placement, totalTeams, summary) VALUES (?, 3, 12, 'Good effort')", [id2]);
  });

  it("getTrophyCabinet returns results ordered by date desc", async () => {
    const { getTrophyCabinet } = await import("../../services/tournament-results.js");
    const results = getTrophyCabinet();
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].eventTitle).toBe("Cup B");
    expect(results[1].eventTitle).toBe("Cup A");
  });

  it("respects limit parameter", async () => {
    const { getTrophyCabinet } = await import("../../services/tournament-results.js");
    const results = getTrophyCabinet(1);
    expect(results).toHaveLength(1);
  });
});
