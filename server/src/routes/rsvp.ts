import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { setAttendance } from "../services/attendance.js";
import { randomBytes } from "crypto";
import type { CaptchaProvider } from "../middleware/captcha.js";

export function createRsvpRouter(captchaProvider: CaptchaProvider) {
  const router = Router();

  // GET /resolve?token=X&event=Y
  router.get("/resolve", (req: Request, res: Response): void => {
    const { token, event } = req.query;
    if (!token || !event) {
      res.status(400).json({ error: "Missing token or event" });
      return;
    }

    const db = getDB();

    // Find guardian by accessToken
    const guardianRows = db.exec(
      "SELECT id, name FROM guardians WHERE accessToken = ?",
      [token as string]
    );
    if (!guardianRows.length || !guardianRows[0].values.length) {
      res.status(404).json({ error: "Invalid token" });
      return;
    }
    const guardianId = guardianRows[0].values[0][0] as number;

    // Find linked players
    const playerRows = db.exec(
      "SELECT p.id, p.name FROM players p JOIN guardian_players gp ON p.id = gp.playerId WHERE gp.guardianId = ?",
      [guardianId]
    );

    // Find event
    const eventRows = db.exec(
      "SELECT id, title, date FROM events WHERE id = ?",
      [Number(event)]
    );
    if (!eventRows.length || !eventRows[0].values.length) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const players = (playerRows[0]?.values || []).map((row) => ({
      id: row[0],
      firstName: (row[1] as string).split(" ")[0],
    }));

    const evt = {
      id: eventRows[0].values[0][0],
      title: eventRows[0].values[0][1],
      date: eventRows[0].values[0][2],
    };

    res.json({ players, event: evt });
  });

  // POST /search
  router.post(
    "/search",
    async (req: Request, res: Response): Promise<void> => {
      const { name, eventId, captcha } = req.body;

      if (!captcha) {
        res.status(400).json({ error: "Captcha required" });
        return;
      }

      const valid = await captchaProvider.verifySolution(captcha);
      if (!valid) {
        res.status(403).json({ error: "Captcha failed" });
        return;
      }

      const db = getDB();

      // Fuzzy match player by name
      const playerRows = db.exec(
        "SELECT id, name FROM players WHERE LOWER(name) LIKE LOWER('%' || ? || '%')",
        [name]
      );
      if (!playerRows.length || !playerRows[0].values.length) {
        res.status(404).json({ error: "No player found" });
        return;
      }

      const player = playerRows[0].values[0];
      const playerId = player[0] as number;
      const fullName = player[1] as string;

      // Generate initials: "Luca Mueller" -> "L. M."
      const initials = fullName
        .split(" ")
        .map((w) => w[0] + ".")
        .join(" ");

      // Generate opaque token
      const rsvpToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // +1 hour

      db.run(
        "INSERT INTO rsvp_tokens (token, playerId, eventId, expiresAt) VALUES (?, ?, ?, ?)",
        [rsvpToken, playerId, eventId, expiresAt]
      );

      // Get event info
      const eventRows = db.exec(
        "SELECT title, date FROM events WHERE id = ?",
        [eventId]
      );
      const eventTitle = eventRows[0]?.values[0]?.[0] || "";
      const eventDate = eventRows[0]?.values[0]?.[1] || "";

      res.json({ rsvpToken, playerInitials: initials, eventTitle, eventDate });
    }
  );

  // POST /confirm
  router.post("/confirm", (req: Request, res: Response): void => {
    const { accessToken, rsvpToken, playerId, eventId, status } = req.body;
    const db = getDB();

    let resolvedPlayerId: number;
    let resolvedEventId: number;

    if (rsvpToken) {
      // Validate rsvp token — use SQLite datetime comparison for consistency
      const tokenRows = db.exec(
        "SELECT playerId, eventId, used, (expiresAt < datetime('now')) AS expired FROM rsvp_tokens WHERE token = ?",
        [rsvpToken]
      );
      if (!tokenRows.length || !tokenRows[0].values.length) {
        res.status(403).json({ error: "Invalid token" });
        return;
      }

      const row = tokenRows[0].values[0];
      if (row[2] === 1) {
        res.status(403).json({ error: "Token already used" });
        return;
      }
      if (row[3] === 1) {
        res.status(403).json({ error: "Token expired" });
        return;
      }

      resolvedPlayerId = row[0] as number;
      resolvedEventId = row[1] as number;

      // Mark as used
      db.run("UPDATE rsvp_tokens SET used = 1 WHERE token = ?", [rsvpToken]);
    } else if (accessToken) {
      // Validate guardian accessToken
      const guardianRows = db.exec(
        "SELECT id FROM guardians WHERE accessToken = ?",
        [accessToken]
      );
      if (!guardianRows.length || !guardianRows[0].values.length) {
        res.status(403).json({ error: "Invalid token" });
        return;
      }

      const guardianId = guardianRows[0].values[0][0] as number;

      // Verify playerId belongs to guardian
      const linkRows = db.exec(
        "SELECT playerId FROM guardian_players WHERE guardianId = ? AND playerId = ?",
        [guardianId, playerId]
      );
      if (!linkRows.length || !linkRows[0].values.length) {
        res.status(403).json({ error: "Player not linked" });
        return;
      }

      resolvedPlayerId = playerId;
      resolvedEventId = eventId;
    } else {
      res.status(400).json({ error: "Token required" });
      return;
    }

    const result = setAttendance(
      resolvedEventId,
      resolvedPlayerId,
      status,
      "web"
    );
    res.json({ finalStatus: result.finalStatus });
  });

  return router;
}
