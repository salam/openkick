import { Router, type Request, type Response } from "express";
import { getDB, getLastInsertId } from "../database.js";
import { expandSeries, type SeriesTemplate, type VacationPeriod, type MaterializedEvent } from "../services/event-series.js";
import { getResults } from "../services/tournament-results.js";
import { ensureEventChecklist } from "../services/checklist.service.js";
// tournament-import uses pdfjs-dist which requires DOM globals — lazy-import to
// avoid breaking Node.js test environments that don't polyfill DOMMatrix.

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
    teamName,
    fee,
  } = req.body;

  if (!type || !title || !date) {
    res.status(400).json({ error: "type, title, and date are required" });
    return;
  }

  const db = getDB();
  db.run(
    `INSERT INTO events (type, title, description, date, startTime, attendanceTime, deadline,
      maxParticipants, minParticipants, location, categoryRequirement, recurring, recurrenceRule, teamName, fee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      teamName ?? null,
      fee ?? null,
    ],
  );

  const id = getLastInsertId();

  ensureEventChecklist(id, type);

  const rows = rowsToObjects(db.exec("SELECT * FROM events WHERE id = ?", [id]));
  res.status(201).json(rows[0]);
});

// GET /api/events
eventsRouter.get("/events", (req: Request, res: Response) => {
  const db = getDB();
  const { type, category, upcoming } = req.query;

  // 1. Fetch standalone events (seriesId IS NULL to avoid duplicating materialized events)
  let sql = "SELECT * FROM events WHERE seriesId IS NULL";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    conditions.push("type = ?");
    params.push(type);
  }

  if (category) {
    conditions.push(
      "(categoryRequirement = ? OR categoryRequirement LIKE ? OR categoryRequirement LIKE ? OR categoryRequirement LIKE ?)"
    );
    params.push(category, `${category},%`, `%,${category}`, `%,${category},%`);
  }

  if (conditions.length > 0) {
    sql += " AND " + conditions.join(" AND ");
  }

  sql += " ORDER BY date ASC";

  const standaloneEvents = rowsToObjects(db.exec(sql, params as import("sql.js").SqlValue[]));

  // 2. Expand event series
  const allSeries = rowsToObjects(
    db.exec("SELECT * FROM event_series"),
  ) as unknown as SeriesTemplate[];
  const vacations = rowsToObjects(
    db.exec("SELECT * FROM vacation_periods"),
  ) as unknown as VacationPeriod[];
  const materializedEvents = rowsToObjects(
    db.exec("SELECT * FROM events WHERE seriesId IS NOT NULL"),
  ) as unknown as MaterializedEvent[];

  const rangeStart = "2000-01-01";
  const rangeEnd = "2099-12-31";

  const expandedEvents: Record<string, unknown>[] = [];
  for (const series of allSeries) {
    const instances = expandSeries(
      series, rangeStart, rangeEnd, vacations, materializedEvents,
    );

    for (const inst of instances) {
      if (type && inst.type !== type) continue;
      if (category) {
        const cat = category as string;
        const cr = inst.categoryRequirement ?? "";
        if (
          cr !== cat &&
          !cr.startsWith(`${cat},`) &&
          !cr.endsWith(`,${cat}`) &&
          !cr.includes(`,${cat},`)
        ) {
          continue;
        }
      }
      expandedEvents.push(inst as unknown as Record<string, unknown>);
    }
  }

  // 3. Merge and sort by date
  let allEvents = [...standaloneEvents, ...expandedEvents];
  allEvents.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // 4. Filter upcoming events (date >= today) when requested
  if (upcoming === "true") {
    const today = new Date().toISOString().slice(0, 10);
    allEvents = allEvents.filter((e) => String(e.date) >= today);
  }

  res.json(allEvents);
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

  const results = getResults(id);

  res.json({ ...event, attendanceSummary, results });
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
  const teamName = req.body.teamName ?? current.teamName;
  const fee = req.body.fee !== undefined ? req.body.fee : current.fee;

  db.run(
    `UPDATE events SET type = ?, title = ?, description = ?, date = ?, startTime = ?,
      attendanceTime = ?, deadline = ?, maxParticipants = ?, minParticipants = ?,
      location = ?, categoryRequirement = ?, recurring = ?, recurrenceRule = ?, teamName = ?, fee = ?
     WHERE id = ?`,
    [
      type, title, description, date, startTime, attendanceTime, deadline,
      maxParticipants, minParticipants, location, categoryRequirement,
      recurring, recurrenceRule, teamName, fee ?? null, id,
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

// ── Tournament Import ───────────────────────────────────────────────

// POST /api/events/import-url
eventsRouter.post("/events/import-url", async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const { extractFromUrl } = await import("../services/tournament-import.js");
    const data = await extractFromUrl(url);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/events/import-pdf
eventsRouter.post("/events/import-pdf", async (req: Request, res: Response) => {
  const body = req.body as Buffer;
  if (!body || body.length === 0) {
    res.status(400).json({ error: "PDF body is required" });
    return;
  }

  try {
    const { extractFromPdf } = await import("../services/tournament-import.js");
    const data = await extractFromPdf(Buffer.from(body));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
