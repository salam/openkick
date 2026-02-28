import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import {
  setAttendance,
  getAttendanceForEvent,
} from "../services/attendance.js";
import { mutationLimiter } from "../middleware/rateLimiter.js";

export const attendanceRouter = Router();

// POST /api/attendance — set attendance for a player at an event
attendanceRouter.post("/attendance", mutationLimiter, (req: Request, res: Response) => {
  const { eventId, playerId, status, source, reason } = req.body;

  if (!eventId || !playerId || !status || !source) {
    res.status(400).json({ error: "eventId, playerId, status, and source are required" });
    return;
  }

  if (status !== "attending" && status !== "absent") {
    res.status(400).json({ error: "status must be 'attending' or 'absent'" });
    return;
  }

  const result = setAttendance(eventId, playerId, status, source, reason);
  res.json(result);
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
