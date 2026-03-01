import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";

export const publicEventsRouter = Router();

/**
 * GET /api/public/events/:id
 *
 * Public (no auth) endpoint that returns event details.
 * Supports numeric IDs and synthetic series IDs (series-<id>-<date>).
 * Never exposes player names, attendance data, or other sensitive fields.
 */
publicEventsRouter.get(
  "/public/events/:id",
  (req: Request, res: Response) => {
    const rawId = req.params.id as string;
    const db = getDB();

    // Handle synthetic series IDs: series-<seriesId>-<YYYY-MM-DD>
    const seriesMatch = rawId.match(/^series-(\d+)-(\d{4}-\d{2}-\d{2})$/);
    if (seriesMatch) {
      const seriesId = Number(seriesMatch[1]);
      const date = seriesMatch[2];

      const seriesRows = db.exec(
        `SELECT id, title, type, description, startTime, attendanceTime,
                location, categoryRequirement, maxParticipants
         FROM event_series WHERE id = ?`,
        [seriesId],
      );

      if (seriesRows.length === 0 || seriesRows[0].values.length === 0) {
        res.status(404).json({ error: "Event not found" });
        return;
      }

      const row = seriesRows[0].values[0];

      res.json({
        id: rawId,
        title: (row[1] as string) ?? null,
        type: (row[2] as string) ?? null,
        date,
        description: (row[3] as string) ?? null,
        startTime: (row[4] as string) ?? null,
        attendanceTime: (row[5] as string) ?? null,
        location: (row[6] as string) ?? null,
        categoryRequirement: (row[7] as string) ?? null,
        maxParticipants: (row[8] as number) ?? null,
        deadline: null,
        attachmentUrl: null,
        seriesId,
      });
      return;
    }

    // Numeric event ID
    const id = Number(rawId);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid event ID" });
      return;
    }

    const eventRows = db.exec(
      `SELECT id, title, type, date, startTime, attendanceTime, location,
              description, categoryRequirement, deadline, maxParticipants,
              attachmentPath, seriesId
       FROM events WHERE id = ?`,
      [id],
    );

    if (eventRows.length === 0 || eventRows[0].values.length === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const row = eventRows[0].values[0];
    const attachmentPath = row[11] as string | null;

    res.json({
      id: row[0] as number,
      title: (row[1] as string) ?? null,
      type: (row[2] as string) ?? null,
      date: (row[3] as string) ?? null,
      startTime: (row[4] as string) ?? null,
      attendanceTime: (row[5] as string) ?? null,
      location: (row[6] as string) ?? null,
      description: (row[7] as string) ?? null,
      categoryRequirement: (row[8] as string) ?? null,
      deadline: (row[9] as string) ?? null,
      maxParticipants: (row[10] as number) ?? null,
      attachmentUrl: attachmentPath ? "/uploads/" + attachmentPath : null,
      seriesId: (row[12] as number) ?? null,
    });
  },
);
