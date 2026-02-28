import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { computeInitials } from "../services/player-initials.js";

export const publicTournamentsRouter = Router();

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/**
 * GET /api/public/tournaments/:id
 *
 * Public (no auth) endpoint that returns tournament details with
 * privacy-preserving player initials (never full names).
 */
publicTournamentsRouter.get(
  "/public/tournaments/:id",
  (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const db = getDB();

    // Fetch the event — must be a tournament
    const eventRows = db.exec(
      `SELECT id, title, date, startTime, location, teamName, deadline, maxParticipants
       FROM events WHERE id = ? AND type = 'tournament'`,
      [id],
    );

    if (eventRows.length === 0 || eventRows[0].values.length === 0) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const row = eventRows[0].values[0];
    const eventId = row[0] as number;
    const title = row[1] as string;
    const date = row[2] as string;
    const startTime = (row[3] as string) ?? null;
    const location = (row[4] as string) ?? null;
    const teamName = (row[5] as string) ?? null;
    const deadline = (row[6] as string) ?? null;
    const maxParticipants = (row[7] as number) ?? null;

    // Count attending players
    const countRows = db.exec(
      "SELECT COUNT(*) FROM attendance WHERE eventId = ? AND status = 'attending'",
      [eventId],
    );
    const attendingCount =
      countRows.length > 0 ? (countRows[0].values[0][0] as number) : 0;

    // Compute status
    const status = computeStatus(deadline, maxParticipants, attendingCount);

    // Fetch teams with players
    const teamRows = db.exec(
      "SELECT id, name FROM teams WHERE eventId = ? ORDER BY name ASC",
      [eventId],
    );

    const teams: { name: string; players: { initial: string }[] }[] = [];

    if (teamRows.length > 0) {
      for (const teamRow of teamRows[0].values) {
        const teamId = teamRow[0] as number;
        const teamNameVal = teamRow[1] as string;

        const playerRows = db.exec(
          `SELECT p.id, p.name, p.lastNameInitial
           FROM players p
           JOIN team_players tp ON p.id = tp.playerId
           WHERE tp.teamId = ?
           ORDER BY p.name ASC`,
          [teamId],
        );

        let players: { initial: string }[] = [];
        if (playerRows.length > 0) {
          const playerInputs = playerRows[0].values.map((r) => ({
            id: r[0] as number,
            name: r[1] as string,
            lastNameInitial: (r[2] as string) ?? null,
          }));

          const initials = computeInitials(playerInputs);
          players = initials.map((pi) => ({ initial: pi.initial }));
        }

        teams.push({ name: teamNameVal, players });
      }
    }

    res.json({
      title,
      date,
      startTime,
      location,
      teamName,
      status,
      attendingCount,
      teams,
    });
  },
);

function computeStatus(
  deadline: string | null,
  maxParticipants: number | null,
  attendingCount: number,
): "open" | "closing_soon" | "closed" {
  const now = Date.now();

  // Check deadline passed
  if (deadline) {
    const deadlineMs = new Date(deadline).getTime();
    if (deadlineMs <= now) return "closed";
  }

  // Check max participants reached
  if (maxParticipants !== null && attendingCount >= maxParticipants) {
    return "closed";
  }

  // Check closing soon (deadline < 48h away)
  if (deadline) {
    const deadlineMs = new Date(deadline).getTime();
    if (deadlineMs - now < FORTY_EIGHT_HOURS_MS) return "closing_soon";
  }

  return "open";
}
