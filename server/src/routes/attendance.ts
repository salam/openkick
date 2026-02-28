import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import {
  setAttendance,
  getAttendanceForEvent,
} from "../services/attendance.js";
import { mutationLimiter } from "../middleware/rateLimiter.js";

export const attendanceRouter = Router();

/**
 * If eventId matches the synthetic pattern `series-{id}-{YYYY-MM-DD}`,
 * materialize the series instance (create a real events row) and return the
 * real numeric event ID. If the instance was already materialized, the
 * existing ID is returned. For normal numeric IDs, the value is passed
 * through unchanged.
 */
function resolveEventId(rawEventId: string | number): number {
  if (typeof rawEventId === "number") return rawEventId;

  const match = String(rawEventId).match(/^series-(\d+)-(\d{4}-\d{2}-\d{2})$/);
  if (!match) return Number(rawEventId);

  const seriesId = Number(match[1]);
  const date = match[2];
  const db = getDB();

  // Check if already materialized
  const existing = db.exec(
    "SELECT id FROM events WHERE seriesId = ? AND date = ?",
    [seriesId, date],
  );
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number;
  }

  // Fetch the series template
  const seriesRows = db.exec("SELECT * FROM event_series WHERE id = ?", [seriesId]);
  if (seriesRows.length === 0 || seriesRows[0].values.length === 0) {
    throw new Error(`Event series ${seriesId} not found`);
  }
  const cols = seriesRows[0].columns;
  const vals = seriesRows[0].values[0];
  const series: Record<string, unknown> = {};
  cols.forEach((col, i) => { series[col] = vals[i]; });

  // Compute deadline if deadlineOffsetHours is set
  let deadline: string | null = null;
  if (series.deadlineOffsetHours != null && series.startTime) {
    const eventDateTime = new Date(`${date}T${series.startTime}:00`);
    eventDateTime.setHours(eventDateTime.getHours() - (series.deadlineOffsetHours as number));
    deadline = eventDateTime.toISOString().slice(0, 16).replace("T", " ");
  }

  db.run(
    `INSERT INTO events (type, title, description, date, startTime, attendanceTime, location, categoryRequirement, maxParticipants, minParticipants, deadline, seriesId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      series.type as string,
      series.title as string,
      (series.description as string | null) ?? null,
      date,
      (series.startTime as string | null) ?? null,
      (series.attendanceTime as string | null) ?? null,
      (series.location as string | null) ?? null,
      (series.categoryRequirement as string | null) ?? null,
      (series.maxParticipants as number | null) ?? null,
      (series.minParticipants as number | null) ?? null,
      deadline,
      seriesId,
    ],
  );

  const idResult = db.exec("SELECT last_insert_rowid() AS id");
  return idResult[0].values[0][0] as number;
}

// POST /api/attendance — set attendance for a player at an event
attendanceRouter.post("/attendance", mutationLimiter, (req: Request, res: Response) => {
  const { eventId: rawEventId, playerId, status, source, reason } = req.body;

  if (!rawEventId || !playerId || !status || !source) {
    res.status(400).json({ error: "eventId, playerId, status, and source are required" });
    return;
  }

  if (status !== "attending" && status !== "absent") {
    res.status(400).json({ error: "status must be 'attending' or 'absent'" });
    return;
  }

  let eventId: number;
  try {
    eventId = resolveEventId(rawEventId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to resolve event";
    res.status(404).json({ error: message });
    return;
  }

  const result = setAttendance(eventId, playerId, status, source, reason);
  res.json({ ...result, eventId });
});

// GET /api/events/:eventId/attendance — get all attendance for an event
attendanceRouter.get("/events/:eventId/attendance", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  const records = getAttendanceForEvent(eventId);
  res.json(records);
});

// DELETE /api/attendance/:id — remove a specific attendance record
attendanceRouter.delete("/attendance/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDB();

  const result = db.exec("SELECT id FROM attendance WHERE id = ?", [id]);
  if (result.length === 0 || result[0].values.length === 0) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }

  db.run("DELETE FROM attendance WHERE id = ?", [id]);
  res.status(204).end();
});
