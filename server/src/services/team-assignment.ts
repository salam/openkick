import { getDB } from "../database.js";

interface Player {
  id: number;
  name: string;
  category: string;
}

interface Team {
  id: number;
  name: string;
  players: Player[];
}

interface AssignResult {
  teams: Team[];
}

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

export function assignTeams(eventId: number, teamCount: number): AssignResult {
  const db = getDB();

  // 1. Get all attending players for this event, sorted by category for grouping
  const attendingPlayers = rowsToObjects(
    db.exec(
      `SELECT p.id, p.name, p.category
       FROM players p
       JOIN attendance a ON p.id = a.playerId
       WHERE a.eventId = ? AND a.status = 'attending'
       ORDER BY p.category ASC, p.name ASC`,
      [eventId],
    ),
  ) as unknown as Player[];

  // 2. Clear existing teams for this event
  clearTeams(eventId);

  // 3. Create N team records
  const teamIds: number[] = [];
  for (let i = 0; i < teamCount; i++) {
    const teamName = `Team ${i + 1}`;
    db.run("INSERT INTO teams (eventId, name) VALUES (?, ?)", [eventId, teamName]);
    const result = db.exec("SELECT last_insert_rowid() AS id");
    teamIds.push(result[0].values[0][0] as number);
  }

  // 4. Distribute players round-robin (already sorted by category)
  for (let i = 0; i < attendingPlayers.length; i++) {
    const teamIdx = i % teamCount;
    const teamId = teamIds[teamIdx];
    const player = attendingPlayers[i];
    db.run("INSERT INTO team_players (teamId, playerId) VALUES (?, ?)", [teamId, player.id]);
  }

  // 5. Return the team compositions
  return { teams: getTeamsForEvent(eventId) };
}

export function clearTeams(eventId: number): void {
  const db = getDB();

  // Get team IDs for this event
  const teamRows = rowsToObjects(
    db.exec("SELECT id FROM teams WHERE eventId = ?", [eventId]),
  );

  // Delete team_players for each team
  for (const row of teamRows) {
    db.run("DELETE FROM team_players WHERE teamId = ?", [row.id as number]);
  }

  // Delete teams
  db.run("DELETE FROM teams WHERE eventId = ?", [eventId]);
}

export function getTeamsForEvent(eventId: number): Team[] {
  const db = getDB();

  const teamRows = rowsToObjects(
    db.exec("SELECT id, name FROM teams WHERE eventId = ? ORDER BY id ASC", [eventId]),
  );

  return teamRows.map((row) => {
    const players = rowsToObjects(
      db.exec(
        `SELECT p.id, p.name, p.category
         FROM players p
         JOIN team_players tp ON p.id = tp.playerId
         WHERE tp.teamId = ?
         ORDER BY p.name ASC`,
        [row.id as number],
      ),
    ) as unknown as Player[];

    return {
      id: row.id as number,
      name: row.name as string,
      players,
    };
  });
}

export function setTeamPlayers(teamId: number, playerIds: number[]): void {
  const db = getDB();

  // Clear existing players for this team
  db.run("DELETE FROM team_players WHERE teamId = ?", [teamId]);

  // Insert new players
  for (const playerId of playerIds) {
    db.run("INSERT INTO team_players (teamId, playerId) VALUES (?, ?)", [teamId, playerId]);
  }
}
