import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import {
  assignTeams,
  clearTeams,
  getTeamsForEvent,
  setTeamPlayers,
} from "../services/team-assignment.js";

export const teamsRouter = Router();

// POST /api/events/:eventId/teams — auto-assign teams
teamsRouter.post("/events/:eventId/teams", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  const { teamCount } = req.body;

  if (!teamCount || typeof teamCount !== "number" || teamCount < 1) {
    res.status(400).json({ error: "teamCount is required and must be a positive number" });
    return;
  }

  const result = assignTeams(eventId, teamCount);
  res.json(result);
});

// GET /api/events/:eventId/teams — get team compositions
teamsRouter.get("/events/:eventId/teams", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  const teams = getTeamsForEvent(eventId);
  res.json(teams);
});

// PUT /api/teams/:teamId/players — manual team adjustment
teamsRouter.put("/teams/:teamId/players", (req: Request, res: Response) => {
  const teamId = Number(req.params.teamId);
  const { playerIds } = req.body;

  if (!Array.isArray(playerIds)) {
    res.status(400).json({ error: "playerIds must be an array" });
    return;
  }

  // Check if team exists
  const db = getDB();
  const teamRows = db.exec("SELECT id, name FROM teams WHERE id = ?", [teamId]);
  if (teamRows.length === 0 || teamRows[0].values.length === 0) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  setTeamPlayers(teamId, playerIds);

  // Return updated team with players
  const teamName = teamRows[0].values[0][1] as string;
  const players = db.exec(
    `SELECT p.id, p.name, p.category
     FROM players p
     JOIN team_players tp ON p.id = tp.playerId
     WHERE tp.teamId = ?
     ORDER BY p.name ASC`,
    [teamId],
  );

  const playerList = players.length > 0
    ? players[0].values.map((row) => ({
        id: row[0] as number,
        name: row[1] as string,
        category: row[2] as string,
      }))
    : [];

  res.json({ id: teamId, name: teamName, players: playerList });
});

// DELETE /api/events/:eventId/teams — clear all teams
teamsRouter.delete("/events/:eventId/teams", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  clearTeams(eventId);
  res.status(204).end();
});
