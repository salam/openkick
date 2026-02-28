import { getDB, getLastInsertId } from "../database.js";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface GameHistoryEntry {
  id: number;
  tournamentId: number | null;
  tournamentName: string;
  teamName: string | null;
  date: string;
  placeRanking: number | null;
  isTrophy: boolean;
  trophyType: string | null;
  notes: string | null;
  createdAt: string;
  players: string[];
  matches: GameHistoryMatch[];
}

export interface GameHistoryMatch {
  id: number;
  historyId: number;
  matchLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  score: string | null;
}

export type TrophyType =
  | "first_place"
  | "second_place"
  | "third_place"
  | "fair_play"
  | "best_scorer"
  | "other";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlayersForHistory(historyId: number): string[] {
  const db = getDB();
  const stmt = db.prepare(
    "SELECT playerInitial FROM game_history_players WHERE historyId = ?",
  );
  stmt.bind([historyId]);
  const players: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { playerInitial: string };
    players.push(row.playerInitial);
  }
  stmt.free();
  return players;
}

function getMatchesForHistory(historyId: number): GameHistoryMatch[] {
  const db = getDB();
  const stmt = db.prepare(
    "SELECT id, historyId, matchLabel, homeTeam, awayTeam, score FROM game_history_matches WHERE historyId = ?",
  );
  stmt.bind([historyId]);
  const matches: GameHistoryMatch[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      historyId: number;
      matchLabel: string | null;
      homeTeam: string;
      awayTeam: string;
      score: string | null;
    };
    matches.push(row);
  }
  stmt.free();
  return matches;
}

function rowToEntry(row: Record<string, unknown>): GameHistoryEntry {
  const id = row.id as number;
  return {
    id,
    tournamentId: (row.tournamentId as number) ?? null,
    tournamentName: row.tournamentName as string,
    teamName: (row.teamName as string) ?? null,
    date: row.date as string,
    placeRanking: (row.placeRanking as number) ?? null,
    isTrophy: (row.isTrophy as number) === 1,
    trophyType: (row.trophyType as string) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: row.createdAt as string,
    players: getPlayersForHistory(id),
    matches: getMatchesForHistory(id),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new game history entry. Returns the new row id.
 */
export function createHistoryEntry(data: {
  tournamentName: string;
  date: string;
  tournamentId?: number;
  teamName?: string;
  placeRanking?: number;
  notes?: string;
}): number {
  const db = getDB();
  db.run(
    `INSERT INTO game_history (tournamentName, date, tournamentId, teamName, placeRanking, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.tournamentName,
      data.date,
      data.tournamentId ?? null,
      data.teamName ?? null,
      data.placeRanking ?? null,
      data.notes ?? null,
    ],
  );
  return getLastInsertId();
}

/**
 * Bulk-inserts player initials for a history entry.
 */
export function addHistoryPlayers(
  historyId: number,
  initials: string[],
): void {
  const db = getDB();
  for (const initial of initials) {
    db.run(
      "INSERT INTO game_history_players (historyId, playerInitial) VALUES (?, ?)",
      [historyId, initial],
    );
  }
}

/**
 * Bulk-inserts matches for a history entry.
 */
export function addHistoryMatches(
  historyId: number,
  matches: {
    matchLabel?: string;
    homeTeam: string;
    awayTeam: string;
    score?: string;
  }[],
): void {
  const db = getDB();
  for (const m of matches) {
    db.run(
      `INSERT INTO game_history_matches (historyId, matchLabel, homeTeam, awayTeam, score)
       VALUES (?, ?, ?, ?, ?)`,
      [
        historyId,
        m.matchLabel ?? null,
        m.homeTeam,
        m.awayTeam,
        m.score ?? null,
      ],
    );
  }
}

/**
 * Returns all history entries with players and matches, ordered by date DESC.
 */
export function getHistoryEntries(): GameHistoryEntry[] {
  const db = getDB();
  const stmt = db.prepare(
    "SELECT * FROM game_history ORDER BY date DESC",
  );
  const entries: GameHistoryEntry[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    entries.push(rowToEntry(row));
  }
  stmt.free();
  return entries;
}

/**
 * Returns a single history entry with players and matches, or null if not found.
 */
export function getHistoryEntry(id: number): GameHistoryEntry | null {
  const db = getDB();
  const stmt = db.prepare("SELECT * FROM game_history WHERE id = ?");
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as Record<string, unknown>;
  stmt.free();
  return rowToEntry(row);
}

/**
 * Returns the most recent history entry (by date), or null if none exist.
 */
export function getLatestHistory(): GameHistoryEntry | null {
  const db = getDB();
  const stmt = db.prepare(
    "SELECT * FROM game_history ORDER BY date DESC LIMIT 1",
  );
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as Record<string, unknown>;
  stmt.free();
  return rowToEntry(row);
}

/**
 * Sets or unsets the trophy status on a history entry.
 * Pass null to unmark as trophy.
 */
export function setTrophy(id: number, trophyType: TrophyType | null): void {
  const db = getDB();
  if (trophyType === null) {
    db.run(
      "UPDATE game_history SET isTrophy = 0, trophyType = NULL WHERE id = ?",
      [id],
    );
  } else {
    db.run(
      "UPDATE game_history SET isTrophy = 1, trophyType = ? WHERE id = ?",
      [trophyType, id],
    );
  }
}

/**
 * Archives a tournament from the live ticker into game history.
 * Copies all live_ticker_entries into game_history_matches.
 * Returns the new history id.
 */
export function archiveTournament(tournamentId: number): number {
  const db = getDB();

  // Get tournament info from events table
  const stmt = db.prepare(
    "SELECT title, date FROM events WHERE id = ?",
  );
  stmt.bind([tournamentId]);
  if (!stmt.step()) {
    stmt.free();
    throw new Error(`Tournament with id ${tournamentId} not found`);
  }
  const tournament = stmt.getAsObject() as { title: string; date: string };
  stmt.free();

  // Create the history entry
  const historyId = createHistoryEntry({
    tournamentName: tournament.title,
    date: tournament.date,
    tournamentId,
  });

  // Copy ticker entries into history matches
  const tickerStmt = db.prepare(
    "SELECT matchLabel, homeTeam, awayTeam, score FROM live_ticker_entries WHERE tournamentId = ?",
  );
  tickerStmt.bind([tournamentId]);
  const matches: { matchLabel?: string; homeTeam: string; awayTeam: string; score?: string }[] = [];
  while (tickerStmt.step()) {
    const row = tickerStmt.getAsObject() as {
      matchLabel: string | null;
      homeTeam: string;
      awayTeam: string;
      score: string | null;
    };
    matches.push({
      matchLabel: row.matchLabel ?? undefined,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      score: row.score ?? undefined,
    });
  }
  tickerStmt.free();

  if (matches.length > 0) {
    addHistoryMatches(historyId, matches);
  }

  return historyId;
}

/**
 * Deletes a history entry. Cascade will handle players and matches.
 */
export function deleteHistoryEntry(id: number): void {
  const db = getDB();
  db.run("DELETE FROM game_history WHERE id = ?", [id]);
}
