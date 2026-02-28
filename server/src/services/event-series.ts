/**
 * Event Series Expansion Service
 *
 * Pure function that expands a series template into individual event instances.
 * No database access — takes all inputs as arguments and returns a flat array.
 */

export interface SeriesTemplate {
  id: number;
  type: string;
  title: string;
  description: string | null;
  startTime: string;
  attendanceTime: string | null;
  location: string | null;
  categoryRequirement: string | null;
  maxParticipants: number | null;
  minParticipants: number | null;
  recurrenceDay: number; // ISO weekday: 1=Mon, 7=Sun
  startDate: string;     // YYYY-MM-DD
  endDate: string;       // YYYY-MM-DD
  customDates: string | null;   // JSON array of YYYY-MM-DD strings, or null
  excludedDates: string | null; // JSON array of YYYY-MM-DD strings, or null
  deadlineOffsetHours: number | null;
  createdBy: number | null;
  createdAt: string;
}

export interface VacationPeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface MaterializedEvent {
  id: number;
  seriesId: number;
  date: string;
  title: string;
  type: string;
  startTime: string;
  attendanceTime: string | null;
  location: string | null;
  categoryRequirement: string | null;
  maxParticipants: number | null;
  minParticipants: number | null;
  [key: string]: unknown;
}

export interface ExpandedEvent {
  id: number | string;
  seriesId: number;
  date: string;
  type: string;
  title: string;
  description: string | null;
  startTime: string;
  attendanceTime: string | null;
  location: string | null;
  categoryRequirement: string | null;
  maxParticipants: number | null;
  minParticipants: number | null;
  deadline: string | null;
  materialized: boolean;
}

/** Format a Date as YYYY-MM-DD (UTC-safe). */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convert JS weekday (0=Sun) to ISO weekday (1=Mon, 7=Sun). */
function isoDay(d: Date): number {
  const js = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return js === 0 ? 7 : js;
}

/** Parse a date string to a Date at midnight, avoiding timezone shifts. */
function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

/** Safely parse a JSON-encoded date array, returning [] on invalid input. */
function parseDateArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Check if a date string falls within any vacation period. */
function isInVacation(dateStr: string, vacations: VacationPeriod[]): boolean {
  for (const v of vacations) {
    if (dateStr >= v.startDate && dateStr <= v.endDate) {
      return true;
    }
  }
  return false;
}

/**
 * Expand a series template into individual event instances for a given date range.
 *
 * @param series       - The series template (recurrence rule)
 * @param rangeStart   - Start of the requested range (YYYY-MM-DD, inclusive)
 * @param rangeEnd     - End of the requested range (YYYY-MM-DD, inclusive)
 * @param vacations    - Vacation/holiday periods to skip
 * @param materialized - Already-materialized (edited) events from the DB
 * @returns Flat array of expanded event instances, sorted by date
 */
export function expandSeries(
  series: SeriesTemplate,
  rangeStart: string,
  rangeEnd: string,
  vacations: VacationPeriod[],
  materialized: MaterializedEvent[],
): ExpandedEvent[] {
  const dateSet = new Set<string>();

  // 1. Generate weekly dates matching recurrenceDay within series bounds
  const cursor = parseDate(series.startDate);
  const seriesEnd = parseDate(series.endDate);

  // Advance cursor to the first matching weekday if needed
  while (isoDay(cursor) !== series.recurrenceDay && cursor <= seriesEnd) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (cursor <= seriesEnd) {
    dateSet.add(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  // 2. Add custom dates
  for (const d of parseDateArray(series.customDates)) {
    dateSet.add(d);
  }

  // 3. Remove excluded dates
  for (const d of parseDateArray(series.excludedDates)) {
    dateSet.delete(d);
  }

  // 4. Filter out vacation periods and dates outside the requested range
  const filteredDates = Array.from(dateSet).filter((d) => {
    if (d < rangeStart || d > rangeEnd) return false;
    if (isInVacation(d, vacations)) return false;
    return true;
  });

  // 5. Sort dates chronologically
  filteredDates.sort();

  // 6. Build materialized lookup (keyed by date)
  const materializedByDate = new Map<string, MaterializedEvent>();
  for (const evt of materialized) {
    if (evt.seriesId === series.id) {
      materializedByDate.set(evt.date, evt);
    }
  }

  // 7. Map each date to an ExpandedEvent
  return filteredDates.map((date): ExpandedEvent => {
    const existing = materializedByDate.get(date);

    if (existing) {
      return {
        id: existing.id,
        seriesId: series.id,
        date,
        type: existing.type ?? series.type,
        title: existing.title ?? series.title,
        description: (existing.description as string | null) ?? series.description,
        startTime: existing.startTime ?? series.startTime,
        attendanceTime: (existing.attendanceTime as string | null) ?? series.attendanceTime,
        location: (existing.location as string | null) ?? series.location,
        categoryRequirement: (existing.categoryRequirement as string | null) ?? series.categoryRequirement,
        maxParticipants: (existing.maxParticipants as number | null) ?? series.maxParticipants,
        minParticipants: (existing.minParticipants as number | null) ?? series.minParticipants,
        deadline: computeDeadline(date, existing.startTime ?? series.startTime, series.deadlineOffsetHours),
        materialized: true,
      };
    }

    return {
      id: `series-${series.id}-${date}`,
      seriesId: series.id,
      date,
      type: series.type,
      title: series.title,
      description: series.description,
      startTime: series.startTime,
      attendanceTime: series.attendanceTime,
      location: series.location,
      categoryRequirement: series.categoryRequirement,
      maxParticipants: series.maxParticipants,
      minParticipants: series.minParticipants,
      deadline: computeDeadline(date, series.startTime, series.deadlineOffsetHours),
      materialized: false,
    };
  });
}

/**
 * Compute the attendance deadline by subtracting deadlineOffsetHours
 * from the event's date + startTime.
 *
 * @returns ISO-like datetime string (YYYY-MM-DDTHH:mm:ss) or null
 */
function computeDeadline(
  date: string,
  startTime: string,
  offsetHours: number | null,
): string | null {
  if (offsetHours == null || offsetHours <= 0) return null;

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
