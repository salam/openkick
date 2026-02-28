import { describe, it, expect, beforeEach } from "vitest";
import { initDB, getDB } from "../../database.js";

import {
  createHistoryEntry,
  addHistoryPlayers,
  addHistoryMatches,
  getHistoryEntries,
  getHistoryEntry,
  getLatestHistory,
  setTrophy,
  archiveTournament,
  deleteHistoryEntry,
} from "../game-history.service.js";

/** Helper: inserts a tournament event and returns its id */
function seedTournament(title: string, date: string): number {
  const db = getDB();
  db.run(
    "INSERT INTO events (type, title, date) VALUES ('tournament', ?, ?)",
    [title, date],
  );
  const rows = db.exec("SELECT last_insert_rowid()");
  return rows[0].values[0][0] as number;
}

/** Helper: seeds live ticker entries for a tournament */
function seedTickerEntries(tournamentId: number): void {
  const db = getDB();
  db.run(
    `INSERT INTO live_ticker_entries (tournamentId, matchLabel, homeTeam, awayTeam, score)
     VALUES (?, ?, ?, ?, ?)`,
    [tournamentId, "Group A", "FC Blue", "FC Red", "3:1"],
  );
  db.run(
    `INSERT INTO live_ticker_entries (tournamentId, matchLabel, homeTeam, awayTeam, score)
     VALUES (?, ?, ?, ?, ?)`,
    [tournamentId, "Final", "FC Blue", "FC Green", "2:0"],
  );
}

describe("game-history service", () => {
  beforeEach(async () => {
    await initDB();
  });

  // 1. createHistoryEntry + getHistoryEntry
  it("creates and retrieves a history entry with all fields", () => {
    const id = createHistoryEntry({
      tournamentName: "Spring Cup 2026",
      date: "2026-03-15",
      teamName: "U11 Lions",
      placeRanking: 2,
      notes: "Great performance",
    });

    expect(id).toBeGreaterThan(0);

    const entry = getHistoryEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.tournamentName).toBe("Spring Cup 2026");
    expect(entry!.date).toBe("2026-03-15");
    expect(entry!.teamName).toBe("U11 Lions");
    expect(entry!.placeRanking).toBe(2);
    expect(entry!.notes).toBe("Great performance");
    expect(entry!.isTrophy).toBe(false);
    expect(entry!.trophyType).toBeNull();
    expect(entry!.players).toEqual([]);
    expect(entry!.matches).toEqual([]);
  });

  // 2. addHistoryPlayers
  it("adds player initials and they appear in getHistoryEntry", () => {
    const id = createHistoryEntry({
      tournamentName: "Cup A",
      date: "2026-04-01",
    });

    addHistoryPlayers(id, ["J.M.", "A.S.", "L.K."]);

    const entry = getHistoryEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.players).toHaveLength(3);
    expect(entry!.players).toContain("J.M.");
    expect(entry!.players).toContain("A.S.");
    expect(entry!.players).toContain("L.K.");
  });

  // 3. addHistoryMatches
  it("adds matches and they appear in getHistoryEntry", () => {
    const id = createHistoryEntry({
      tournamentName: "Cup B",
      date: "2026-04-10",
    });

    addHistoryMatches(id, [
      { matchLabel: "Group A", homeTeam: "FC Blue", awayTeam: "FC Red", score: "2:1" },
      { homeTeam: "FC Blue", awayTeam: "FC Green" },
    ]);

    const entry = getHistoryEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.matches).toHaveLength(2);
    expect(entry!.matches[0].matchLabel).toBe("Group A");
    expect(entry!.matches[0].homeTeam).toBe("FC Blue");
    expect(entry!.matches[0].awayTeam).toBe("FC Red");
    expect(entry!.matches[0].score).toBe("2:1");
    expect(entry!.matches[1].matchLabel).toBeNull();
    expect(entry!.matches[1].score).toBeNull();
  });

  // 4. getHistoryEntries — returns all entries ordered by date DESC
  it("returns all entries ordered by date DESC", () => {
    createHistoryEntry({ tournamentName: "Old Cup", date: "2025-06-01" });
    createHistoryEntry({ tournamentName: "Recent Cup", date: "2026-03-01" });
    createHistoryEntry({ tournamentName: "Middle Cup", date: "2025-12-01" });

    const entries = getHistoryEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].tournamentName).toBe("Recent Cup");
    expect(entries[1].tournamentName).toBe("Middle Cup");
    expect(entries[2].tournamentName).toBe("Old Cup");
  });

  // 5. getLatestHistory — returns the most recent entry
  it("returns the most recent entry", () => {
    createHistoryEntry({ tournamentName: "Older Cup", date: "2025-01-01" });
    createHistoryEntry({ tournamentName: "Newest Cup", date: "2026-06-01" });

    const latest = getLatestHistory();
    expect(latest).not.toBeNull();
    expect(latest!.tournamentName).toBe("Newest Cup");
  });

  it("getLatestHistory returns null when no entries exist", () => {
    const latest = getLatestHistory();
    expect(latest).toBeNull();
  });

  // 6. setTrophy — marks as trophy
  it("marks an entry as a trophy with a type", () => {
    const id = createHistoryEntry({ tournamentName: "Trophy Cup", date: "2026-05-01" });

    setTrophy(id, "first_place");

    const entry = getHistoryEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.isTrophy).toBe(true);
    expect(entry!.trophyType).toBe("first_place");
  });

  // 7. setTrophy with null — unmarks trophy
  it("unmarks a trophy when trophyType is null", () => {
    const id = createHistoryEntry({ tournamentName: "Trophy Cup 2", date: "2026-05-02" });

    setTrophy(id, "fair_play");
    let entry = getHistoryEntry(id);
    expect(entry!.isTrophy).toBe(true);

    setTrophy(id, null);
    entry = getHistoryEntry(id);
    expect(entry!.isTrophy).toBe(false);
    expect(entry!.trophyType).toBeNull();
  });

  // 8. archiveTournament — copies ticker entries into history
  it("archives a tournament from live ticker entries", () => {
    const tournamentId = seedTournament("Summer Cup 2026", "2026-07-01");
    seedTickerEntries(tournamentId);

    const historyId = archiveTournament(tournamentId);
    expect(historyId).toBeGreaterThan(0);

    const entry = getHistoryEntry(historyId);
    expect(entry).not.toBeNull();
    expect(entry!.tournamentName).toBe("Summer Cup 2026");
    expect(entry!.tournamentId).toBe(tournamentId);
    expect(entry!.date).toBe("2026-07-01");
    expect(entry!.matches).toHaveLength(2);

    const matchLabels = entry!.matches.map((m) => m.matchLabel);
    expect(matchLabels).toContain("Group A");
    expect(matchLabels).toContain("Final");
  });

  // 9. deleteHistoryEntry — cascades to players + matches
  it("deletes an entry and cascades to players and matches", () => {
    const id = createHistoryEntry({ tournamentName: "Delete Cup", date: "2026-08-01" });
    addHistoryPlayers(id, ["X.Y."]);
    addHistoryMatches(id, [{ homeTeam: "A", awayTeam: "B", score: "1:0" }]);

    // Verify they exist
    expect(getHistoryEntry(id)).not.toBeNull();

    deleteHistoryEntry(id);

    expect(getHistoryEntry(id)).toBeNull();

    // Verify cascade: no orphaned players or matches
    const db = getDB();
    const players = db.exec(`SELECT * FROM game_history_players WHERE historyId = ${id}`);
    expect(players).toHaveLength(0);
    const matches = db.exec(`SELECT * FROM game_history_matches WHERE historyId = ${id}`);
    expect(matches).toHaveLength(0);
  });
});
