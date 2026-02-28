import { describe, it, expect, beforeEach } from "vitest";
import { initDB, getDB } from "../../database.js";

describe("live-ticker schema", () => {
  beforeEach(async () => {
    await initDB();
    // Seed a parent event so foreign-key constraints are satisfied
    const db = getDB();
    db.run(`INSERT OR IGNORE INTO events (id, type, title, date) VALUES (999, 'tournament', 'Test Tournament', '2026-03-01')`);
  });

  it("tournament_results_url table exists and accepts rows", () => {
    const db = getDB();
    db.run(`INSERT INTO tournament_results_url (tournamentId, url) VALUES (999, 'https://example.com')`);
    const rows = db.exec("SELECT * FROM tournament_results_url WHERE tournamentId = 999");
    expect(rows[0].values).toHaveLength(1);
  });

  it("live_ticker_entries table exists and accepts rows", () => {
    const db = getDB();
    db.run(`INSERT INTO live_ticker_entries (tournamentId, homeTeam, awayTeam, score) VALUES (999, 'Team A', 'Team B', '2:1')`);
    const rows = db.exec("SELECT * FROM live_ticker_entries WHERE tournamentId = 999");
    expect(rows[0].values).toHaveLength(1);
  });

  it("live_ticker_entries upserts on same match", () => {
    const db = getDB();
    db.run(`INSERT INTO live_ticker_entries (tournamentId, homeTeam, awayTeam, matchLabel, score) VALUES (999, 'Team A', 'Team B', 'Group A Game 1', '0:0')`);
    db.run(`INSERT OR REPLACE INTO live_ticker_entries (tournamentId, homeTeam, awayTeam, matchLabel, score, updatedAt) VALUES (999, 'Team A', 'Team B', 'Group A Game 1', '2:1', datetime('now'))`);
    const rows = db.exec("SELECT score FROM live_ticker_entries WHERE tournamentId = 999");
    expect(rows[0].values).toHaveLength(1);
    expect(rows[0].values[0][0]).toBe("2:1");
  });

  it("game_history tables exist", () => {
    const db = getDB();
    db.run(`INSERT INTO game_history (tournamentName, date) VALUES ('Test Cup', '2026-03-01')`);
    const rows = db.exec("SELECT * FROM game_history");
    expect(rows[0].values).toHaveLength(1);
    const historyId = rows[0].values[0][0];

    db.run(`INSERT INTO game_history_players (historyId, playerInitial) VALUES (${historyId}, 'J. M.')`);
    db.run(`INSERT INTO game_history_matches (historyId, homeTeam, awayTeam, score) VALUES (${historyId}, 'A', 'B', '1:0')`);

    const players = db.exec(`SELECT * FROM game_history_players WHERE historyId = ${historyId}`);
    expect(players[0].values).toHaveLength(1);
    const matches = db.exec(`SELECT * FROM game_history_matches WHERE historyId = ${historyId}`);
    expect(matches[0].values).toHaveLength(1);
  });
});
