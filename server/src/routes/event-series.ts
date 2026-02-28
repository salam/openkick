import { Router, type Request, type Response } from "express";
import { getDB, getLastInsertId } from "../database.js";
import {
  expandSeries,
  type SeriesTemplate,
  type VacationPeriod,
  type MaterializedEvent,
} from "../services/event-series.js";

export const eventSeriesRouter = Router();

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

// ── Helper: compute deadline ────────────────────────────────────────

function computeDeadline(
  date: string,
  startTime: string | null,
  offsetHours: number | null,
): string | null {
  if (offsetHours == null || offsetHours <= 0 || !startTime) return null;

  const eventDateTime = new Date(`${date}T${startTime}:00`);
  eventDateTime.setHours(eventDateTime.getHours() - offsetHours);

  const y = eventDateTime.getFullYear();
  const mo = String(eventDateTime.getMonth() + 1).padStart(2, "0");
  const d = String(eventDateTime.getDate()).padStart(2, "0");
  const h = String(eventDateTime.getHours()).padStart(2, "0");
  const mi = String(eventDateTime.getMinutes()).padStart(2, "0");
  const s = String(eventDateTime.getSeconds()).padStart(2, "0");

  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

// ── Event Series CRUD ───────────────────────────────────────────────

// POST /api/event-series
eventSeriesRouter.post("/event-series", (req: Request, res: Response) => {
  const {
    type,
    title,
    description,
    startTime,
    attendanceTime,
    location,
    categoryRequirement,
    maxParticipants,
    minParticipants,
    recurrenceDay,
    startDate,
    endDate,
    customDates,
    excludedDates,
    deadlineOffsetHours,
  } = req.body;

  if (!title || recurrenceDay == null || !startDate || !endDate) {
    res.status(400).json({
      error: "title, recurrenceDay, startDate, and endDate are required",
    });
    return;
  }

  if (!Number.isInteger(recurrenceDay) || recurrenceDay < 1 || recurrenceDay > 7) {
    res.status(400).json({
      error: "recurrenceDay must be an integer between 1 (Mon) and 7 (Sun)",
    });
    return;
  }

  if (startDate > endDate) {
    res.status(400).json({ error: "startDate must be before or equal to endDate" });
    return;
  }

  const db = getDB();
  db.run(
    `INSERT INTO event_series (type, title, description, startTime, attendanceTime,
      location, categoryRequirement, maxParticipants, minParticipants,
      recurrenceDay, startDate, endDate, customDates, excludedDates, deadlineOffsetHours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      type ?? "training",
      title,
      description ?? null,
      startTime ?? null,
      attendanceTime ?? null,
      location ?? null,
      categoryRequirement ?? null,
      maxParticipants ?? null,
      minParticipants ?? null,
      recurrenceDay,
      startDate,
      endDate,
      customDates ? JSON.stringify(customDates) : null,
      excludedDates ? JSON.stringify(excludedDates) : null,
      deadlineOffsetHours ?? null,
    ],
  );

  const id = getLastInsertId();
  const rows = rowsToObjects(
    db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
  );
  res.status(201).json(rows[0]);
});

// GET /api/event-series
eventSeriesRouter.get("/event-series", (_req: Request, res: Response) => {
  const db = getDB();
  const rows = rowsToObjects(
    db.exec("SELECT * FROM event_series ORDER BY startDate ASC"),
  );
  res.json(rows);
});

// GET /api/event-series/:id
eventSeriesRouter.get("/event-series/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const rows = rowsToObjects(
    db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Event series not found" });
    return;
  }

  const series = rows[0] as unknown as SeriesTemplate;

  // Fetch vacation periods
  const vacationRows = rowsToObjects(
    db.exec("SELECT * FROM vacation_periods"),
  );
  const vacations: VacationPeriod[] = vacationRows.map((v) => ({
    startDate: v.startDate as string,
    endDate: v.endDate as string,
  }));

  // Fetch materialized events for this series
  const materializedRows = rowsToObjects(
    db.exec("SELECT * FROM events WHERE seriesId = ?", [id]),
  );
  const materialized: MaterializedEvent[] = materializedRows.map((e) => ({
    id: e.id as number,
    seriesId: e.seriesId as number,
    date: e.date as string,
    title: e.title as string,
    type: e.type as string,
    startTime: e.startTime as string,
    attendanceTime: e.attendanceTime as string | null,
    location: e.location as string | null,
    categoryRequirement: e.categoryRequirement as string | null,
    maxParticipants: e.maxParticipants as number | null,
    minParticipants: e.minParticipants as number | null,
  }));

  // Expand the series for its full date range
  const instances = expandSeries(
    series,
    series.startDate,
    series.endDate,
    vacations,
    materialized,
  );

  res.json({ series, instances });
});

// PUT /api/event-series/:id
eventSeriesRouter.put("/event-series/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(
    db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
  );
  if (existing.length === 0) {
    res.status(404).json({ error: "Event series not found" });
    return;
  }

  const current = existing[0];
  const type = req.body.type ?? current.type;
  const title = req.body.title ?? current.title;
  const description = req.body.description ?? current.description;
  const startTime = req.body.startTime ?? current.startTime;
  const attendanceTime = req.body.attendanceTime ?? current.attendanceTime;
  const location = req.body.location ?? current.location;
  const categoryRequirement =
    req.body.categoryRequirement ?? current.categoryRequirement;
  const maxParticipants =
    req.body.maxParticipants ?? current.maxParticipants;
  const minParticipants =
    req.body.minParticipants ?? current.minParticipants;
  const recurrenceDay = req.body.recurrenceDay ?? current.recurrenceDay;
  const startDate = req.body.startDate ?? current.startDate;
  const endDate = req.body.endDate ?? current.endDate;
  const customDates = req.body.customDates !== undefined
    ? JSON.stringify(req.body.customDates)
    : current.customDates;
  const excludedDates = req.body.excludedDates !== undefined
    ? JSON.stringify(req.body.excludedDates)
    : current.excludedDates;
  const deadlineOffsetHours =
    req.body.deadlineOffsetHours ?? current.deadlineOffsetHours;

  db.run(
    `UPDATE event_series SET type = ?, title = ?, description = ?, startTime = ?,
      attendanceTime = ?, location = ?, categoryRequirement = ?,
      maxParticipants = ?, minParticipants = ?, recurrenceDay = ?,
      startDate = ?, endDate = ?, customDates = ?, excludedDates = ?,
      deadlineOffsetHours = ?
     WHERE id = ?`,
    [
      type, title, description, startTime, attendanceTime, location,
      categoryRequirement, maxParticipants, minParticipants, recurrenceDay,
      startDate, endDate, customDates, excludedDates, deadlineOffsetHours,
      id,
    ],
  );

  const rows = rowsToObjects(
    db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
  );
  res.json(rows[0]);
});

// DELETE /api/event-series/:id
eventSeriesRouter.delete("/event-series/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(
    db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
  );
  if (existing.length === 0) {
    res.status(404).json({ error: "Event series not found" });
    return;
  }

  // Delete attendance records for materialized events, then events, then series
  const materializedIds = rowsToObjects(
    db.exec("SELECT id FROM events WHERE seriesId = ?", [id]),
  ).map((r) => r.id as number);
  for (const eid of materializedIds) {
    db.run("DELETE FROM attendance WHERE eventId = ?", [eid]);
  }
  db.run("DELETE FROM events WHERE seriesId = ?", [id]);
  db.run("DELETE FROM event_series WHERE id = ?", [id]);
  res.status(204).end();
});

// POST /api/event-series/:id/exclude
eventSeriesRouter.post(
  "/event-series/:id/exclude",
  (req: Request, res: Response) => {
    const db = getDB();
    const id = Number(req.params.id);
    const { date } = req.body;

    if (!date) {
      res.status(400).json({ error: "date is required" });
      return;
    }

    const rows = rowsToObjects(
      db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Event series not found" });
      return;
    }

    const series = rows[0];
    const existingRaw = series.excludedDates as string | null;
    let excluded: string[] = [];
    if (existingRaw) {
      try {
        excluded = JSON.parse(existingRaw);
      } catch {
        excluded = [];
      }
    }

    if (!excluded.includes(date)) {
      excluded.push(date);
    }

    db.run("UPDATE event_series SET excludedDates = ? WHERE id = ?", [
      JSON.stringify(excluded),
      id,
    ]);

    const updated = rowsToObjects(
      db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
    );
    res.json(updated[0]);
  },
);

// POST /api/event-series/:id/materialize
eventSeriesRouter.post(
  "/event-series/:id/materialize",
  (req: Request, res: Response) => {
    const db = getDB();
    const id = Number(req.params.id);
    const { date } = req.body;

    if (!date) {
      res.status(400).json({ error: "date is required" });
      return;
    }

    const rows = rowsToObjects(
      db.exec("SELECT * FROM event_series WHERE id = ?", [id]),
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Event series not found" });
      return;
    }

    // Check if already materialized for this series + date
    const existingEvent = rowsToObjects(
      db.exec(
        "SELECT * FROM events WHERE seriesId = ? AND date = ?",
        [id, date],
      ),
    );
    if (existingEvent.length > 0) {
      res.status(409).json({ error: "Event already materialized for this date" });
      return;
    }

    const series = rows[0];

    // Compute deadline from deadlineOffsetHours
    const deadline = computeDeadline(
      date,
      series.startTime as string | null,
      series.deadlineOffsetHours as number | null,
    );

    db.run(
      `INSERT INTO events (type, title, description, date, startTime, attendanceTime,
        deadline, maxParticipants, minParticipants, location, categoryRequirement, seriesId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        series.type,
        series.title,
        series.description ?? null,
        date,
        series.startTime ?? null,
        series.attendanceTime ?? null,
        deadline,
        series.maxParticipants ?? null,
        series.minParticipants ?? null,
        series.location ?? null,
        series.categoryRequirement ?? null,
        id,
      ],
    );

    const eventId = getLastInsertId();
    const eventRows = rowsToObjects(
      db.exec("SELECT * FROM events WHERE id = ?", [eventId]),
    );
    res.status(201).json(eventRows[0]);
  },
);
