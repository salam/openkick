/**
 * Unified "next upcoming event" lookup used by the WhatsApp bot.
 *
 * Checks three sources:
 *   1. Standalone events in the `events` table
 *   2. Expanded event series instances (from `event_series`)
 *   3. Training schedule instances (from `training_schedule`)
 *
 * Returns the earliest future event across all three sources.
 */

import { getDB, getLastInsertId } from "../database.js";
import {
  expandSeries,
  type SeriesTemplate,
  type VacationPeriod,
  type MaterializedEvent,
} from "./event-series.js";

export interface NextEvent {
  id: number | string; // string for virtual events, auto-materialized to number before return
  title: string;
  date: string;
  startTime: string | null;
  source: "event" | "series" | "training";
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

/**
 * Find the next upcoming event from all sources (events table, event series,
 * training schedules). Looks up to 60 days ahead for series/training expansion.
 */
export function findNextUpcomingEventAny(): NextEvent | null {
  const db = getDB();
  const today = formatDate(new Date());
  const sixtyDaysLater = formatDate(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  );

  const candidates: NextEvent[] = [];

  // 1. Standalone events from the events table
  const evtResult = db.exec(
    "SELECT id, title, date, startTime FROM events WHERE date >= ? ORDER BY date ASC, startTime ASC LIMIT 1",
    [today],
  );
  if (evtResult.length > 0 && evtResult[0].values.length > 0) {
    const row = evtResult[0].values[0];
    candidates.push({
      id: row[0] as number,
      title: row[1] as string,
      date: row[2] as string,
      startTime: row[3] as string | null,
      source: "event",
    });
  }

  // 2. Event series — expand and find the first future instance
  const allSeries = rowsToObjects(
    db.exec("SELECT * FROM event_series"),
  ) as unknown as SeriesTemplate[];

  if (allSeries.length > 0) {
    const vacations = rowsToObjects(
      db.exec(
        "SELECT id, name, startDate, endDate FROM vacation_periods WHERE endDate >= ?",
        [today],
      ),
    ) as unknown as VacationPeriod[];

    const materialized = rowsToObjects(
      db.exec(
        "SELECT * FROM events WHERE seriesId IS NOT NULL AND date >= ? AND date <= ?",
        [today, sixtyDaysLater],
      ),
    ) as unknown as MaterializedEvent[];

    for (const series of allSeries) {
      const instances = expandSeries(
        series,
        today,
        sixtyDaysLater,
        vacations,
        materialized,
      );
      if (instances.length > 0) {
        const first = instances[0];
        candidates.push({
          id: first.id,
          title: first.title,
          date: first.date,
          startTime: first.startTime,
          source: "series",
        });
      }
    }
  }

  // 3. Training schedules — find the next training day
  const schedules = rowsToObjects(
    db.exec("SELECT * FROM training_schedule"),
  );

  if (schedules.length > 0) {
    const vacations = rowsToObjects(
      db.exec(
        "SELECT startDate, endDate FROM vacation_periods WHERE endDate >= ?",
        [today],
      ),
    );

    for (const schedule of schedules) {
      const dayOfWeek = schedule.dayOfWeek as number;
      const validFrom = schedule.validFrom as string | null;
      const validTo = schedule.validTo as string | null;

      // Walk forward from today to find the next matching weekday
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);

      for (let i = 0; i < 60; i++) {
        const dateStr = formatDate(cursor);
        const jsDay = cursor.getDay();
        const isoDay = jsDay === 0 ? 7 : jsDay;

        if (isoDay === dayOfWeek) {
          // Check validity window
          if (validFrom && dateStr < validFrom) { cursor.setDate(cursor.getDate() + 1); continue; }
          if (validTo && dateStr > validTo) break;

          // Check vacation
          const inVacation = vacations.some(
            (v) => dateStr >= (v.startDate as string) && dateStr <= (v.endDate as string),
          );

          if (!inVacation) {
            candidates.push({
              id: `training-${schedule.id}-${dateStr}`,
              title: `Training (${schedule.location ?? ""})`.trim(),
              date: dateStr,
              startTime: schedule.startTime as string | null,
              source: "training",
            });
            break; // found the next one for this schedule
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Return the earliest candidate
  candidates.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });

  const best = candidates[0];

  // Auto-materialize virtual events so callers get a numeric ID usable with attendance
  if (typeof best.id === "string") {
    best.id = materializeVirtualEvent(best);
  }

  return best;
}

/**
 * Find an event on a specific date from all sources (events, series, training).
 * Auto-materializes virtual events so the returned id is always numeric.
 */
export function findEventByDate(targetDate: string): NextEvent | null {
  const db = getDB();
  const candidates: NextEvent[] = [];

  // 1. Standalone events on this date
  const evtResult = db.exec(
    "SELECT id, title, date, startTime FROM events WHERE date = ? ORDER BY startTime ASC LIMIT 1",
    [targetDate],
  );
  if (evtResult.length > 0 && evtResult[0].values.length > 0) {
    const row = evtResult[0].values[0];
    candidates.push({
      id: row[0] as number,
      title: row[1] as string,
      date: row[2] as string,
      startTime: row[3] as string | null,
      source: "event",
    });
  }

  // 2. Event series instances on this date
  const allSeries = rowsToObjects(
    db.exec("SELECT * FROM event_series"),
  ) as unknown as SeriesTemplate[];

  if (allSeries.length > 0) {
    const vacations = rowsToObjects(
      db.exec(
        "SELECT id, name, startDate, endDate FROM vacation_periods WHERE startDate <= ? AND endDate >= ?",
        [targetDate, targetDate],
      ),
    ) as unknown as VacationPeriod[];

    const materialized = rowsToObjects(
      db.exec(
        "SELECT * FROM events WHERE seriesId IS NOT NULL AND date = ?",
        [targetDate],
      ),
    ) as unknown as MaterializedEvent[];

    for (const series of allSeries) {
      const instances = expandSeries(series, targetDate, targetDate, vacations, materialized);
      if (instances.length > 0) {
        candidates.push({
          id: instances[0].id,
          title: instances[0].title,
          date: instances[0].date,
          startTime: instances[0].startTime,
          source: "series",
        });
      }
    }
  }

  // 3. Training schedule on this date
  const d = new Date(`${targetDate}T00:00:00`);
  const jsDay = d.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;

  const schedules = rowsToObjects(
    db.exec("SELECT * FROM training_schedule WHERE dayOfWeek = ?", [isoDay]),
  );

  const vacForTraining = rowsToObjects(
    db.exec(
      "SELECT startDate, endDate FROM vacation_periods WHERE startDate <= ? AND endDate >= ?",
      [targetDate, targetDate],
    ),
  );

  for (const schedule of schedules) {
    const validFrom = schedule.validFrom as string | null;
    const validTo = schedule.validTo as string | null;
    if (validFrom && targetDate < validFrom) continue;
    if (validTo && targetDate > validTo) continue;

    if (vacForTraining.length === 0) {
      candidates.push({
        id: `training-${schedule.id}-${targetDate}`,
        title: `Training (${schedule.location ?? ""})`.trim(),
        date: targetDate,
        startTime: schedule.startTime as string | null,
        source: "training",
      });
    }
  }

  if (candidates.length === 0) return null;

  const best = candidates[0];
  if (typeof best.id === "string") {
    best.id = materializeVirtualEvent(best);
  }
  return best;
}

/**
 * Insert a row into the `events` table for a virtual training/series instance
 * so that attendance can be recorded against it.
 */
function materializeVirtualEvent(evt: NextEvent): number {
  const db = getDB();

  // Check if an event with this date + title already exists (avoid duplicates)
  const existing = db.exec(
    "SELECT id FROM events WHERE date = ? AND title = ? LIMIT 1",
    [evt.date, evt.title],
  );
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number;
  }

  db.run(
    "INSERT INTO events (type, title, date, startTime) VALUES (?, ?, ?, ?)",
    [evt.source === "training" ? "training" : "event", evt.title, evt.date, evt.startTime],
  );
  return getLastInsertId();
}
