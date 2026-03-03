import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDB, getDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

// Seed helpers
function seedCoach(): number {
  db.run(
    "INSERT INTO guardians (phone, name, role) VALUES (?, ?, ?)",
    ["+41791234567", "Coach Mike", "coach"],
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
  // Wednesday = dayOfWeek 3, 18:00–19:30 (90 min)
  db.run(
    "INSERT INTO training_schedule (dayOfWeek, startTime, endTime) VALUES (?, ?, ?)",
    [3, "18:00", "19:30"],
  );
}

function seedTrainingEvent(
  date: string,
  coachId: number,
  category = "F",
): number {
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

function seedAttendance(
  eventId: number,
  playerId: number,
  status: string,
  reason?: string,
): void {
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, reason) VALUES (?, ?, ?, ?)",
    [eventId, playerId, status, reason ?? null],
  );
}

function seedTeamWithPlayers(
  eventId: number,
  playerIds: number[],
): number {
  db.run("INSERT INTO teams (eventId, name) VALUES (?, ?)", [
    eventId,
    "Team A",
  ]);
  const res = db.exec("SELECT last_insert_rowid()");
  const teamId = res[0].values[0][0] as number;
  for (const pid of playerIds) {
    db.run("INSERT INTO team_players (teamId, playerId) VALUES (?, ?)", [
      teamId,
      pid,
    ]);
  }
  return teamId;
}

function seedTrophy(eventId: number): void {
  db.run(
    "INSERT INTO tournament_results (eventId, placement, totalTeams, summary) VALUES (?, ?, ?, ?)",
    [eventId, 1, 8, "Won the Spring Cup"],
  );
}

describe("statistics service", () => {
  let coachId: number;
  let lucaId: number;
  let miaId: number;
  let noahId: number;
  let event1Id: number;
  let event2Id: number;
  let tournamentId: number;

  beforeEach(async () => {
    db = await initDB();

    coachId = seedCoach();
    lucaId = seedPlayer("Luca");
    miaId = seedPlayer("Mia");
    noahId = seedPlayer("Noah");

    seedTrainingSchedule();

    // 2026-02-04 = Wednesday, 2026-02-11 = Wednesday
    event1Id = seedTrainingEvent("2026-02-04", coachId);
    event2Id = seedTrainingEvent("2026-02-11", coachId);

    // Attendance event 1: Luca attending, Mia absent no reason (no-show), Noah unknown (no-show)
    seedAttendance(event1Id, lucaId, "attending");
    seedAttendance(event1Id, miaId, "absent"); // no reason = no-show
    seedAttendance(event1Id, noahId, "unknown");

    // Attendance event 2: all attending
    seedAttendance(event2Id, lucaId, "attending");
    seedAttendance(event2Id, miaId, "attending");
    seedAttendance(event2Id, noahId, "attending");

    // Tournament on 2026-03-15
    tournamentId = seedTournamentEvent("2026-03-15", coachId);
    seedTeamWithPlayers(tournamentId, [lucaId, noahId]);

    // Trophy
    seedTrophy(tournamentId);
  });

  afterEach(() => {
    db.close();
  });

  const period = {
    start: "2026-02-01",
    end: "2026-07-31",
    label: "Spring 2026",
    type: "spring" as const,
  };

  describe("getTrainingHours", () => {
    it("returns correct session count and hours for F team", async () => {
      const { getTrainingHours } = await import("../statistics.service.js");
      const results = getTrainingHours(period, "F");

      expect(results).toHaveLength(1);
      expect(results[0].teamName).toBe("F");
      expect(results[0].sessionCount).toBe(2);
      expect(results[0].trainingHours).toBeCloseTo(3, 1); // 2 * 1.5h
    });

    it("returns all teams when no team filter", async () => {
      const { getTrainingHours } = await import("../statistics.service.js");
      const results = getTrainingHours(period);

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getPersonHours", () => {
    it("returns correct person-hours for F team", async () => {
      const { getPersonHours } = await import("../statistics.service.js");
      const results = getPersonHours(period, "F");

      expect(results).toHaveLength(1);
      // event1: 1 attending * 90min, event2: 3 attending * 90min = (90+270)/60 = 6
      expect(results[0].personHours).toBeCloseTo(6, 1);
    });
  });

  describe("getCoachHours", () => {
    it("returns correct hours for Coach Mike", async () => {
      const { getCoachHours } = await import("../statistics.service.js");
      const results = getCoachHours(period);

      expect(results).toHaveLength(1);
      expect(results[0].coachName).toBe("Coach Mike");
      expect(results[0].sessionCount).toBe(2);
      expect(results[0].coachHours).toBeCloseTo(3, 1);
    });

    it("filters by coachId", async () => {
      const { getCoachHours } = await import("../statistics.service.js");
      const results = getCoachHours(period, coachId);

      expect(results).toHaveLength(1);
      expect(results[0].coachId).toBe(coachId);
    });

    it("returns empty for unknown coachId", async () => {
      const { getCoachHours } = await import("../statistics.service.js");
      const results = getCoachHours(period, 9999);

      expect(results).toHaveLength(0);
    });
  });

  describe("getNoShows", () => {
    it("identifies no-shows correctly", async () => {
      const { getNoShows } = await import("../statistics.service.js");
      const results = getNoShows(period);

      const mia = results.find((r) => r.entityLabel === "Mia");
      const noah = results.find((r) => r.entityLabel === "Noah");
      const luca = results.find((r) => r.entityLabel === "Luca");

      // Mia: 1 no-show (absent no reason in event1), 2 registered
      expect(mia).toBeDefined();
      expect(mia!.noShowCount).toBe(1);

      // Noah: 1 no-show (unknown in event1), 2 registered
      expect(noah).toBeDefined();
      expect(noah!.noShowCount).toBe(1);

      // Luca: 0 no-shows
      expect(luca).toBeDefined();
      expect(luca!.noShowCount).toBe(0);
    });

    it("calculates noShowRate without NaN", async () => {
      const { getNoShows } = await import("../statistics.service.js");
      const results = getNoShows(period);

      for (const r of results) {
        expect(Number.isFinite(r.noShowRate)).toBe(true);
      }
    });
  });

  describe("getAttendanceRate", () => {
    it("returns correct rates", async () => {
      const { getAttendanceRate } = await import("../statistics.service.js");
      const results = getAttendanceRate(period);

      const luca = results.find((r) => r.entityLabel === "Luca");
      const noah = results.find((r) => r.entityLabel === "Noah");

      expect(luca).toBeDefined();
      expect(luca!.attendanceRate).toBeCloseTo(1.0, 2); // 2/2

      expect(noah).toBeDefined();
      expect(noah!.attendanceRate).toBeCloseTo(0.5, 2); // 1/2
    });
  });

  describe("getTournamentParticipation", () => {
    it("counts tournament participation", async () => {
      const { getTournamentParticipation } = await import(
        "../statistics.service.js"
      );
      const results = getTournamentParticipation(period);

      const luca = results.find((r) => r.entityLabel === "Luca");
      const noah = results.find((r) => r.entityLabel === "Noah");

      expect(luca).toBeDefined();
      expect(luca!.tournamentCount).toBe(1);

      expect(noah).toBeDefined();
      expect(noah!.tournamentCount).toBe(1);

      // Mia is not in any tournament team
      const mia = results.find((r) => r.entityLabel === "Mia");
      expect(mia).toBeUndefined();
    });
  });

  describe("getHomepageStats", () => {
    it("returns aggregated homepage stats", async () => {
      const { getHomepageStats } = await import("../statistics.service.js");
      const stats = getHomepageStats();

      expect(stats.lifetimeAthletes).toBeGreaterThanOrEqual(3);
      expect(stats.activeAthletes).toBeGreaterThanOrEqual(1);
      expect(stats.tournamentsPlayed).toBeGreaterThanOrEqual(1);
      expect(stats.trophiesWon).toBeGreaterThanOrEqual(1);
      expect(stats.trainingSessionsThisSeason).toBeGreaterThanOrEqual(1);
      expect(stats.activeCoaches).toBeGreaterThanOrEqual(1);
      expect(stats.computedAt).toBeDefined();
    });

    it("caches results on subsequent calls", async () => {
      const { getHomepageStats } = await import("../statistics.service.js");
      const stats1 = getHomepageStats();
      const stats2 = getHomepageStats();

      expect(stats1.computedAt).toBe(stats2.computedAt);
    });
  });

  describe("invalidateHomepageStatsCache", () => {
    it("forces recomputation on next call", async () => {
      const { getHomepageStats, invalidateHomepageStatsCache } = await import(
        "../statistics.service.js"
      );

      const stats1 = getHomepageStats();

      // Advance time slightly
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      invalidateHomepageStatsCache();
      const stats2 = getHomepageStats();

      // After invalidation, computedAt should be different
      expect(stats2.computedAt).not.toBe(stats1.computedAt);

      vi.useRealTimers();
    });
  });
});
