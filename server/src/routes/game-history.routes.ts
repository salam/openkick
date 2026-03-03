import { Router } from "express";
import { authMiddleware, requireRole } from "../auth.js";
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
  type TrophyType,
} from "../services/game-history.service.js";

export const gameHistoryRouter = Router();

// GET /game-history — list all history entries (public)
gameHistoryRouter.get("/game-history", (_req, res) => {
  const entries = getHistoryEntries();
  res.json(entries);
});

// GET /game-history/latest — most recent entry (public, for homepage widget)
// IMPORTANT: must be defined BEFORE /:id to avoid "latest" matching as an id
gameHistoryRouter.get("/game-history/latest", (_req, res) => {
  const entry = getLatestHistory();
  res.json(entry ?? null);
});

// GET /game-history/:id — single entry with players + matches (public)
gameHistoryRouter.get("/game-history/:id", (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const entry = getHistoryEntry(id);
  if (!entry) {
    res.status(404).json({ error: "History entry not found" });
    return;
  }
  res.json(entry);
});

// POST /game-history — create new entry (coach)
gameHistoryRouter.post("/game-history", authMiddleware, requireRole("admin", "coach"), (req, res) => {
  const { tournamentName, date, teamName, placeRanking, notes, players, matches } = req.body;

  if (!tournamentName || !date) {
    res.status(400).json({ error: "tournamentName and date are required" });
    return;
  }

  const id = createHistoryEntry({
    tournamentName,
    date,
    teamName: teamName ?? undefined,
    placeRanking: placeRanking ?? undefined,
    notes: notes ?? undefined,
  });

  if (Array.isArray(players) && players.length > 0) {
    addHistoryPlayers(id, players);
  }

  if (Array.isArray(matches) && matches.length > 0) {
    addHistoryMatches(id, matches);
  }

  res.status(201).json({ id });
});

// PUT /game-history/:id/trophy — set/unset trophy (coach)
gameHistoryRouter.put("/game-history/:id/trophy", authMiddleware, requireRole("admin", "coach"), (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { trophyType } = req.body;
  setTrophy(id, (trophyType as TrophyType) ?? null);
  res.json({ success: true });
});

// POST /game-history/archive/:tournamentId — archive tournament from live ticker (coach)
gameHistoryRouter.post("/game-history/archive/:tournamentId", authMiddleware, requireRole("admin", "coach"), (req, res) => {
  const tournamentId = Number(req.params.tournamentId);
  if (isNaN(tournamentId)) {
    res.status(400).json({ error: "Invalid tournamentId" });
    return;
  }

  try {
    const id = archiveTournament(tournamentId);
    res.json({ id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: message });
  }
});

// DELETE /game-history/:id — delete entry (coach)
gameHistoryRouter.delete("/game-history/:id", authMiddleware, requireRole("admin", "coach"), (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  deleteHistoryEntry(id);
  res.json({ success: true });
});
