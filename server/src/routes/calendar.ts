import { Router, type Request, type Response } from "express";
import { getDB, getLastInsertId } from "../database.js";
import {
  parseICS,
  extractHolidaysFromUrl,
  syncPresetHolidays,
  getUpcomingVacations,
} from "../services/holidays.js";
import { getPresetGroups, getPresetById } from "../services/holiday-presets.js";
import { expandSeries, type SeriesTemplate, type VacationPeriod, type MaterializedEvent } from "../services/event-series.js";

export const calendarRouter = Router();

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

// ── Helper: format date as YYYY-MM-DD ───────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Training Schedule CRUD ──────────────────────────────────────────

// POST /api/training-schedule
calendarRouter.post("/training-schedule", (req: Request, res: Response) => {
  const { dayOfWeek, startTime, endTime, location, categoryFilter, validFrom, validTo } = req.body;

  if (dayOfWeek === undefined || !startTime || !endTime) {
    res.status(400).json({ error: "dayOfWeek, startTime, and endTime are required" });
    return;
  }

  const db = getDB();
  db.run(
    `INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location, categoryFilter, validFrom, validTo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [dayOfWeek, startTime, endTime, location ?? null, categoryFilter ?? null, validFrom ?? null, validTo ?? null],
  );

  const id = getLastInsertId();
  const rows = rowsToObjects(db.exec("SELECT * FROM training_schedule WHERE id = ?", [id]));
  res.status(201).json(rows[0]);
});

// GET /api/training-schedule
calendarRouter.get("/training-schedule", (_req: Request, res: Response) => {
  const db = getDB();
  const rows = rowsToObjects(db.exec("SELECT * FROM training_schedule ORDER BY dayOfWeek ASC"));
  res.json(rows);
});

// PUT /api/training-schedule/:id
calendarRouter.put("/training-schedule/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(db.exec("SELECT * FROM training_schedule WHERE id = ?", [id]));
  if (existing.length === 0) {
    res.status(404).json({ error: "Training schedule not found" });
    return;
  }

  const current = existing[0];
  const dayOfWeek = req.body.dayOfWeek ?? current.dayOfWeek;
  const startTime = req.body.startTime ?? current.startTime;
  const endTime = req.body.endTime ?? current.endTime;
  const location = req.body.location ?? current.location;
  const categoryFilter = req.body.categoryFilter ?? current.categoryFilter;
  const validFrom = req.body.validFrom ?? current.validFrom;
  const validTo = req.body.validTo ?? current.validTo;

  db.run(
    `UPDATE training_schedule SET dayOfWeek = ?, startTime = ?, endTime = ?, location = ?,
      categoryFilter = ?, validFrom = ?, validTo = ?
     WHERE id = ?`,
    [dayOfWeek, startTime, endTime, location, categoryFilter, validFrom, validTo, id],
  );

  const rows = rowsToObjects(db.exec("SELECT * FROM training_schedule WHERE id = ?", [id]));
  res.json(rows[0]);
});

// DELETE /api/training-schedule/:id
calendarRouter.delete("/training-schedule/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(db.exec("SELECT * FROM training_schedule WHERE id = ?", [id]));
  if (existing.length === 0) {
    res.status(404).json({ error: "Training schedule not found" });
    return;
  }

  db.run("DELETE FROM training_schedule WHERE id = ?", [id]);
  res.status(204).end();
});

// ── Vacation CRUD ───────────────────────────────────────────────────

// POST /api/vacations
calendarRouter.post("/vacations", (req: Request, res: Response) => {
  const { name, startDate, endDate, source } = req.body;

  if (!name || !startDate || !endDate) {
    res.status(400).json({ error: "name, startDate, and endDate are required" });
    return;
  }

  const db = getDB();
  db.run(
    "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
    [name, startDate, endDate, source ?? "manual"],
  );

  const id = getLastInsertId();
  const rows = rowsToObjects(db.exec("SELECT * FROM vacation_periods WHERE id = ?", [id]));
  res.status(201).json(rows[0]);
});

// GET /api/vacations
calendarRouter.get("/vacations", (_req: Request, res: Response) => {
  const db = getDB();
  const rows = rowsToObjects(db.exec("SELECT MIN(id) as id, name, startDate, endDate, source, MIN(createdAt) as createdAt FROM vacation_periods GROUP BY name, startDate, endDate ORDER BY startDate ASC"));
  res.json(rows);
});

// DELETE /api/vacations/:id
calendarRouter.delete("/vacations/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(db.exec("SELECT * FROM vacation_periods WHERE id = ?", [id]));
  if (existing.length === 0) {
    res.status(404).json({ error: "Vacation period not found" });
    return;
  }

  db.run("DELETE FROM vacation_periods WHERE id = ?", [id]);
  res.status(204).end();
});

// POST /api/vacations/import-ics
calendarRouter.post("/vacations/import-ics", (req: Request, res: Response) => {
  const { icsContent } = req.body;

  if (!icsContent) {
    res.status(400).json({ error: "icsContent is required" });
    return;
  }

  const periods = parseICS(icsContent);
  const db = getDB();

  for (const p of periods) {
    db.run(
      "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
      [p.name, p.startDate, p.endDate, p.source],
    );
  }

  res.status(201).json({ imported: periods.length });
});

// POST /api/vacations/import-url
calendarRouter.post("/vacations/import-url", async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const periods = await extractHolidaysFromUrl(url);
    const db = getDB();

    for (const p of periods) {
      db.run(
        "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
        [p.name, p.startDate, p.endDate, p.source],
      );
    }

    res.status(201).json({ imported: periods.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/vacations/presets
calendarRouter.get("/vacations/presets", (_req: Request, res: Response) => {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = 'holiday_preset'");
  const selected = (result[0]?.values[0]?.[0] as string) || "";
  res.json({ groups: getPresetGroups(), selected });
});

// POST /api/vacations/sync
calendarRouter.post("/vacations/sync", (req: Request, res: Response) => {
  const { presetId, year } = req.body;

  if (!presetId) {
    res.status(400).json({ error: "presetId is required" });
    return;
  }

  if (!getPresetById(presetId)) {
    res.status(400).json({ error: `Unknown preset: ${presetId}` });
    return;
  }

  const syncYear = year ?? new Date().getFullYear();
  const result = syncPresetHolidays(presetId, syncYear);

  // Persist the selected preset for daily auto-sync
  const db = getDB();
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["holiday_preset", presetId]);

  const upcoming = getUpcomingVacations(3);
  res.json({ ...result, upcoming });
});

// ── Calendar Endpoint ───────────────────────────────────────────────

// GET /api/calendar?year=2026 or GET /api/calendar?month=2026-03
calendarRouter.get("/calendar", (req: Request, res: Response) => {
  const { year, month } = req.query;

  if (!year && !month) {
    res.status(400).json({ error: "year or month query parameter is required" });
    return;
  }

  let startDate: string;
  let endDate: string;

  if (month) {
    // month=2026-03
    const [y, m] = (month as string).split("-").map(Number);
    startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    // Last day of month
    const lastDay = new Date(y, m, 0).getDate();
    endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  } else {
    // year=2026
    const y = Number(year);
    startDate = `${y}-01-01`;
    endDate = `${y}-12-31`;
  }

  const db = getDB();

  // 1. Standalone events in the date range with attendance counts
  const events: Record<string, unknown>[] = rowsToObjects(
    db.exec(
      `SELECT e.*,
        COALESCE(SUM(CASE WHEN a.status = 'yes' THEN 1 ELSE 0 END), 0) AS attendingCount,
        COALESCE(SUM(CASE WHEN a.status = 'no' THEN 1 ELSE 0 END), 0) AS absentCount
      FROM events e
      LEFT JOIN attendance a ON a.eventId = e.id
      WHERE e.seriesId IS NULL AND e.date >= ? AND e.date <= ?
      GROUP BY e.id
      ORDER BY e.date ASC`,
      [startDate, endDate],
    ),
  );

  // Get total player count for attendance context
  const totalPlayersResult = db.exec("SELECT COUNT(*) as cnt FROM players");
  const totalPlayers = totalPlayersResult.length > 0 ? (totalPlayersResult[0].values[0][0] as number) : 0;
  for (const ev of events) {
    ev.totalPlayers = totalPlayers;
  }

  // 2. Vacation periods overlapping with the date range
  const vacations = rowsToObjects(
    db.exec(
      "SELECT MIN(id) as id, name, startDate, endDate, source, MIN(createdAt) as createdAt FROM vacation_periods WHERE endDate >= ? AND startDate <= ? GROUP BY name, startDate, endDate ORDER BY startDate ASC",
      [startDate, endDate],
    ),
  );

  // 3. Training schedules
  const schedules = rowsToObjects(db.exec("SELECT * FROM training_schedule"));

  // 4. Expand training schedules into individual training instances
  const trainings: Array<Record<string, unknown>> = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    // JavaScript: Sunday=0, Monday=1, ..., Saturday=6
    const jsDay = d.getDay();
    // Convert to ISO: Monday=1, ..., Sunday=7
    const isoDay = jsDay === 0 ? 7 : jsDay;
    const dateStr = formatDate(d);

    for (const schedule of schedules) {
      if ((schedule.dayOfWeek as number) !== isoDay) continue;

      // Check validFrom/validTo
      if (schedule.validFrom && dateStr < (schedule.validFrom as string)) continue;
      if (schedule.validTo && dateStr > (schedule.validTo as string)) continue;

      // Check if date falls in any vacation period
      const cancelled = vacations.some((v) => {
        return dateStr >= (v.startDate as string) && dateStr <= (v.endDate as string);
      });

      trainings.push({
        scheduleId: schedule.id,
        date: dateStr,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        location: schedule.location,
        categoryFilter: schedule.categoryFilter,
        cancelled,
        attendingCount: null,
        absentCount: null,
        totalPlayers: null,
      });
    }
  }

  // 5. Expand event series into individual instances for this date range
  const allSeries = rowsToObjects(
    db.exec("SELECT * FROM event_series"),
  ) as unknown as SeriesTemplate[];
  const materializedEvents = rowsToObjects(
    db.exec("SELECT * FROM events WHERE seriesId IS NOT NULL AND date >= ? AND date <= ?", [startDate, endDate]),
  ) as unknown as MaterializedEvent[];

  for (const series of allSeries) {
    const instances = expandSeries(
      series,
      startDate,
      endDate,
      vacations as unknown as VacationPeriod[],
      materializedEvents,
    );
    for (const inst of instances) {
      const rec = inst as unknown as Record<string, unknown>;
      rec.attendingCount = null;
      rec.absentCount = null;
      rec.totalPlayers = null;
      events.push(rec);
    }
  }

  // Merge attendance counts for materialized series events (those with real numeric IDs)
  const seriesEventIds = events
    .filter((e) => e.seriesId != null && typeof e.id === "number")
    .map((e) => e.id as number);
  if (seriesEventIds.length > 0) {
    const placeholders = seriesEventIds.map(() => "?").join(",");
    const attRows = rowsToObjects(
      db.exec(
        `SELECT eventId,
          COALESCE(SUM(CASE WHEN status = 'yes' THEN 1 ELSE 0 END), 0) AS attendingCount,
          COALESCE(SUM(CASE WHEN status = 'no' THEN 1 ELSE 0 END), 0) AS absentCount
        FROM attendance
        WHERE eventId IN (${placeholders})
        GROUP BY eventId`,
        seriesEventIds,
      ),
    );
    const attMap = new Map(attRows.map((r) => [r.eventId as number, r]));
    for (const ev of events) {
      if (ev.seriesId != null && typeof ev.id === "number") {
        const att = attMap.get(ev.id as number);
        ev.attendingCount = att ? (att.attendingCount as number) : 0;
        ev.absentCount = att ? (att.absentCount as number) : 0;
        ev.totalPlayers = totalPlayers;
      }
    }
  }

  // Re-sort events by date after adding series instances
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  res.json({ events, trainings, vacations });
});
