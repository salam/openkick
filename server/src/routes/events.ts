import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";

export const eventsRouter = Router();

// ── Helper: row objects from sql.js result ──────────────────────────

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

// ── Events CRUD ─────────────────────────────────────────────────────

// POST /api/events
eventsRouter.post("/events", (req: Request, res: Response) => {
  const {
    type,
    title,
    description,
    date,
    startTime,
    attendanceTime,
    deadline,
    maxParticipants,
    minParticipants,
    location,
    categoryRequirement,
    recurring,
    recurrenceRule,
  } = req.body;

  if (!type || !title || !date) {
    res.status(400).json({ error: "type, title, and date are required" });
    return;
  }

  const db = getDB();
  db.run(
    `INSERT INTO events (type, title, description, date, startTime, attendanceTime, deadline,
      maxParticipants, minParticipants, location, categoryRequirement, recurring, recurrenceRule)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      type,
      title,
      description ?? null,
      date,
      startTime ?? null,
      attendanceTime ?? null,
      deadline ?? null,
      maxParticipants ?? null,
      minParticipants ?? null,
      location ?? null,
      categoryRequirement ?? null,
      recurring ?? 0,
      recurrenceRule ?? null,
    ],
  );

  const result = db.exec("SELECT last_insert_rowid() AS id");
  const id = result[0].values[0][0] as number;

  const rows = rowsToObjects(db.exec("SELECT * FROM events WHERE id = ?", [id]));
  res.status(201).json(rows[0]);
});

// GET /api/events
eventsRouter.get("/events", (req: Request, res: Response) => {
  const db = getDB();
  const { type, category } = req.query;

  let sql = "SELECT * FROM events";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    conditions.push("type = ?");
    params.push(type);
  }

  if (category) {
    // Filter events where the comma-separated categoryRequirement contains the category.
    // We check for: exact match, starts with "E,", ends with ",E", or contains ",E,".
    conditions.push(
      "(categoryRequirement = ? OR categoryRequirement LIKE ? OR categoryRequirement LIKE ? OR categoryRequirement LIKE ?)"
    );
    params.push(category, `${category},%`, `%,${category}`, `%,${category},%`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY date ASC";

  const rows = rowsToObjects(db.exec(sql, params as import("sql.js").SqlValue[]));
  res.json(rows);
});

// GET /api/events/:id
eventsRouter.get("/events/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const rows = rowsToObjects(db.exec("SELECT * FROM events WHERE id = ?", [id]));
  if (rows.length === 0) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const event = rows[0];

  // Attendance summary via COUNT + GROUP BY
  const summaryRows = rowsToObjects(
    db.exec(
      "SELECT status, COUNT(*) as count FROM attendance WHERE eventId = ? GROUP BY status",
      [id],
    ),
  );

  const attendanceSummary: Record<string, number> = {
    attending: 0,
    absent: 0,
    waitlist: 0,
    unknown: 0,
  };

  for (const row of summaryRows) {
    const status = row.status as string;
    const count = row.count as number;
    if (status in attendanceSummary) {
      attendanceSummary[status] = count;
    }
  }

  res.json({ ...event, attendanceSummary });
});

// PUT /api/events/:id
eventsRouter.put("/events/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(db.exec("SELECT * FROM events WHERE id = ?", [id]));
  if (existing.length === 0) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const current = existing[0];
  const type = req.body.type ?? current.type;
  const title = req.body.title ?? current.title;
  const description = req.body.description ?? current.description;
  const date = req.body.date ?? current.date;
  const startTime = req.body.startTime ?? current.startTime;
  const attendanceTime = req.body.attendanceTime ?? current.attendanceTime;
  const deadline = req.body.deadline ?? current.deadline;
  const maxParticipants = req.body.maxParticipants ?? current.maxParticipants;
  const minParticipants = req.body.minParticipants ?? current.minParticipants;
  const location = req.body.location ?? current.location;
  const categoryRequirement = req.body.categoryRequirement ?? current.categoryRequirement;
  const recurring = req.body.recurring ?? current.recurring;
  const recurrenceRule = req.body.recurrenceRule ?? current.recurrenceRule;

  db.run(
    `UPDATE events SET type = ?, title = ?, description = ?, date = ?, startTime = ?,
      attendanceTime = ?, deadline = ?, maxParticipants = ?, minParticipants = ?,
      location = ?, categoryRequirement = ?, recurring = ?, recurrenceRule = ?
     WHERE id = ?`,
    [
      type, title, description, date, startTime, attendanceTime, deadline,
      maxParticipants, minParticipants, location, categoryRequirement,
      recurring, recurrenceRule, id,
    ],
  );

  const rows = rowsToObjects(db.exec("SELECT * FROM events WHERE id = ?", [id]));
  res.json(rows[0]);
});

// DELETE /api/events/:id
eventsRouter.delete("/events/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(db.exec("SELECT * FROM events WHERE id = ?", [id]));
  if (existing.length === 0) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Cascade-delete attendance records first
  db.run("DELETE FROM attendance WHERE eventId = ?", [id]);
  db.run("DELETE FROM events WHERE id = ?", [id]);
  res.status(204).end();
});
