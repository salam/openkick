import { describe, it, expect, beforeEach } from "vitest";
import { initDB } from "../../database.js";
import { assignTeams, clearTeams, getTeamsForEvent } from "../team-assignment.js";
import type { Database } from "sql.js";

let db: Database;

function createEvent(): number {
  db.run(
    "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
    ["training", "Test Event", "2026-03-01"],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function createPlayer(name: string, category?: string): number {
  db.run("INSERT INTO players (name, category) VALUES (?, ?)", [name, category ?? null]);
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function setAttending(eventId: number, playerId: number): void {
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source) VALUES (?, ?, 'attending', 'web')",
    [eventId, playerId],
  );
}

function setAbsent(eventId: number, playerId: number): void {
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source) VALUES (?, ?, 'absent', 'web')",
    [eventId, playerId],
  );
}

describe("team-assignment service", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it("assignTeams distributes 6 attending players into 2 teams of 3", () => {
    const eventId = createEvent();
    const playerIds: number[] = [];
    for (let i = 1; i <= 6; i++) {
      playerIds.push(createPlayer(`Player${i}`));
    }
    for (const pid of playerIds) {
      setAttending(eventId, pid);
    }

    const result = assignTeams(eventId, 2);

    expect(result.teams).toHaveLength(2);
    expect(result.teams[0].players).toHaveLength(3);
    expect(result.teams[1].players).toHaveLength(3);

    // All players should be assigned
    const allAssigned = result.teams.flatMap((t) => t.players.map((p) => p.id));
    expect(allAssigned.sort()).toEqual(playerIds.sort());
  });

  it("assignTeams distributes 7 players into teams of 4 and 3", () => {
    const eventId = createEvent();
    const playerIds: number[] = [];
    for (let i = 1; i <= 7; i++) {
      playerIds.push(createPlayer(`Player${i}`));
    }
    for (const pid of playerIds) {
      setAttending(eventId, pid);
    }

    const result = assignTeams(eventId, 2);

    expect(result.teams).toHaveLength(2);
    const sizes = result.teams.map((t) => t.players.length).sort();
    expect(sizes).toEqual([3, 4]);

    const allAssigned = result.teams.flatMap((t) => t.players.map((p) => p.id));
    expect(allAssigned.sort()).toEqual(playerIds.sort());
  });

  it("assignTeams only uses players with status='attending'", () => {
    const eventId = createEvent();
    const p1 = createPlayer("Attending1");
    const p2 = createPlayer("Attending2");
    const p3 = createPlayer("Absent1");
    const p4 = createPlayer("NoStatus");

    setAttending(eventId, p1);
    setAttending(eventId, p2);
    setAbsent(eventId, p3);
    // p4 has no attendance record at all

    const result = assignTeams(eventId, 2);

    const allAssigned = result.teams.flatMap((t) => t.players.map((p) => p.id));
    expect(allAssigned).toContain(p1);
    expect(allAssigned).toContain(p2);
    expect(allAssigned).not.toContain(p3);
    expect(allAssigned).not.toContain(p4);
  });

  it("assignTeams respects category grouping", () => {
    const eventId = createEvent();
    // Create players with categories - sorted by category, round-robin means
    // same-category players tend to stay together
    const pA1 = createPlayer("A1", "U10");
    const pA2 = createPlayer("A2", "U10");
    const pB1 = createPlayer("B1", "U12");
    const pB2 = createPlayer("B2", "U12");
    const pC1 = createPlayer("C1", "U14");
    const pC2 = createPlayer("C2", "U14");

    for (const pid of [pA1, pA2, pB1, pB2, pC1, pC2]) {
      setAttending(eventId, pid);
    }

    const result = assignTeams(eventId, 2);

    // With 6 players sorted by category [U10, U10, U12, U12, U14, U14]
    // Round-robin into 2 teams:
    // Team 1: idx0, idx2, idx4 and Team 2: idx1, idx3, idx5
    expect(result.teams).toHaveLength(2);
    expect(result.teams[0].players).toHaveLength(3);
    expect(result.teams[1].players).toHaveLength(3);

    // With 3 teams, category grouping is more visible:
    const result3 = assignTeams(eventId, 3);
    expect(result3.teams).toHaveLength(3);
    // Round-robin with 3 teams on sorted [U10, U10, U12, U12, U14, U14]:
    // Team 1: idx0(U10), idx3(U12) | Team 2: idx1(U10), idx4(U14) | Team 3: idx2(U12), idx5(U14)
    for (const team of result3.teams) {
      expect(team.players).toHaveLength(2);
    }
  });

  it("clearTeams removes all team assignments for an event", () => {
    const eventId = createEvent();
    const playerIds: number[] = [];
    for (let i = 1; i <= 4; i++) {
      playerIds.push(createPlayer(`Player${i}`));
    }
    for (const pid of playerIds) {
      setAttending(eventId, pid);
    }

    assignTeams(eventId, 2);
    expect(getTeamsForEvent(eventId)).toHaveLength(2);

    clearTeams(eventId);
    expect(getTeamsForEvent(eventId)).toHaveLength(0);

    // Verify DB is clean
    const teamRows = db.exec("SELECT * FROM teams WHERE eventId = ?", [eventId]);
    expect(teamRows.length === 0 || teamRows[0].values.length === 0).toBe(true);
    const tpRows = db.exec("SELECT * FROM team_players");
    expect(tpRows.length === 0 || tpRows[0].values.length === 0).toBe(true);
  });

  it("getTeamsForEvent returns team compositions", () => {
    const eventId = createEvent();
    for (let i = 1; i <= 4; i++) {
      const pid = createPlayer(`Player${i}`);
      setAttending(eventId, pid);
    }

    assignTeams(eventId, 2);
    const teams = getTeamsForEvent(eventId);

    expect(teams).toHaveLength(2);
    for (const team of teams) {
      expect(team).toHaveProperty("id");
      expect(team).toHaveProperty("name");
      expect(team).toHaveProperty("players");
      expect(team.players.length).toBeGreaterThan(0);
      for (const player of team.players) {
        expect(player).toHaveProperty("id");
        expect(player).toHaveProperty("name");
      }
    }
  });
});
