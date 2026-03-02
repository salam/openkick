import { getDB } from "../database.js";
import { chatCompletion } from "./llm.js";
import { getPresetById } from "./holiday-presets.js";

export interface VacationPeriod {
  name: string;
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string; // ISO date YYYY-MM-DD
  source: string;
}

/**
 * Returns the Monday of the given ISO week number for a year.
 * ISO week 1 contains January 4th.
 */
function getDateOfISOWeek(week: number, year: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Convert Sunday=0 to 7
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1); // Monday of week 1
  monday.setDate(monday.getDate() + (week - 1) * 7); // Monday of target week
  return monday;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getSundayOfWeek(week: number, year: number): Date {
  const monday = getDateOfISOWeek(week, year);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Zurich public holidays (Feiertage) for a given year.
 * Includes fixed-date and Easter-based movable holidays observed in Kanton Zurich.
 */
export function getZurichPublicHolidays(year: number): VacationPeriod[] {
  const source = "zurich-official";
  const easter = getEasterSunday(year);

  const fixed: [string, string][] = [
    ["Neujahr", `${year}-01-01`],
    ["Berchtoldstag", `${year}-01-02`],
    ["Tag der Arbeit", `${year}-05-01`],
    ["Bundesfeier", `${year}-08-01`],
    ["Weihnachten", `${year}-12-25`],
    ["Stephanstag", `${year}-12-26`],
  ];

  const movable: [string, Date][] = [
    ["Karfreitag", addDays(easter, -2)],
    ["Ostermontag", addDays(easter, 1)],
    ["Auffahrt", addDays(easter, 39)],
    ["Pfingstmontag", addDays(easter, 50)],
  ];

  const holidays: VacationPeriod[] = [];

  for (const [name, date] of fixed) {
    holidays.push({ name, startDate: date, endDate: date, source });
  }
  for (const [name, date] of movable) {
    const d = formatDate(date);
    holidays.push({ name, startDate: d, endDate: d, source });
  }

  return holidays;
}

// Zurich school holidays based on DIN week numbers
// Week numbers are consistent year-to-year for Stadt Zurich:
// Sportferien: W7-8, Frühlingsferien: W17-18, Sommerferien: W29-33, Herbstferien: W41-42
// Weihnachtsferien: ~W52-W1 (last 2 weeks of Dec + first week of Jan)
export function getZurichHolidays(year: number): VacationPeriod[] {
  const source = "zurich-official";

  return [
    {
      name: "Sportferien",
      startDate: formatDate(getDateOfISOWeek(7, year)),
      endDate: formatDate(getSundayOfWeek(8, year)),
      source,
    },
    {
      name: "Frühlingsferien",
      startDate: formatDate(getDateOfISOWeek(17, year)),
      endDate: formatDate(getSundayOfWeek(18, year)),
      source,
    },
    {
      name: "Sommerferien",
      startDate: formatDate(getDateOfISOWeek(29, year)),
      endDate: formatDate(getSundayOfWeek(33, year)),
      source,
    },
    {
      name: "Herbstferien",
      startDate: formatDate(getDateOfISOWeek(41, year)),
      endDate: formatDate(getSundayOfWeek(42, year)),
      source,
    },
    {
      name: "Weihnachtsferien",
      startDate: formatDate(getDateOfISOWeek(52, year)),
      endDate: formatDate(getSundayOfWeek(1, year + 1)),
      source,
    },
  ];
}

/**
 * Parse VCALENDAR/ICS content and extract VEVENT blocks as VacationPeriods.
 */
export function parseICS(icsContent: string): VacationPeriod[] {
  const periods: VacationPeriod[] = [];
  const eventBlocks = icsContent.split("BEGIN:VEVENT");

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split("END:VEVENT")[0];

    const summaryMatch = block.match(/SUMMARY:(.+)/);
    const startMatch = block.match(/DTSTART[^:]*:(\d{8})/);
    const endMatch = block.match(/DTEND[^:]*:(\d{8})/);

    if (summaryMatch && startMatch && endMatch) {
      const startRaw = startMatch[1];
      const endRaw = endMatch[1];

      periods.push({
        name: summaryMatch[1].trim(),
        startDate: `${startRaw.slice(0, 4)}-${startRaw.slice(4, 6)}-${startRaw.slice(6, 8)}`,
        endDate: `${endRaw.slice(0, 4)}-${endRaw.slice(4, 6)}-${endRaw.slice(6, 8)}`,
        source: "ics-import",
      });
    }
  }

  return periods;
}

/**
 * Fetches a URL, sends its content to an LLM, and extracts holiday periods.
 */
export async function extractHolidaysFromUrl(
  url: string,
): Promise<VacationPeriod[]> {
  // 1. Fetch URL content
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const content = await response.text();

  // 2. Send to LLM asking it to extract holiday dates as JSON
  const llmResponse = await chatCompletion([
    {
      role: "system",
      content:
        "You extract school holiday / vacation periods from webpage content. Return a JSON array of objects with fields: name (string), startDate (ISO YYYY-MM-DD), endDate (ISO YYYY-MM-DD). Return ONLY valid JSON, no markdown or explanation.",
    },
    {
      role: "user",
      content: `Extract all school holiday / vacation periods from this content:\n\n${content}`,
    },
  ]);

  // 3. Parse LLM response into VacationPeriod[]
  const parsed = JSON.parse(llmResponse.content) as Array<{
    name: string;
    startDate: string;
    endDate: string;
  }>;

  return parsed.map((p) => ({
    name: p.name,
    startDate: p.startDate,
    endDate: p.endDate,
    source: url,
  }));
}

/**
 * Check if a given date string falls within any vacation period in the DB.
 */
export function isVacationDay(dateStr: string): boolean {
  const db = getDB();
  const result = db.exec(
    "SELECT COUNT(*) FROM vacation_periods WHERE ? BETWEEN startDate AND endDate",
    [dateStr],
  );
  return (result[0]?.values[0]?.[0] as number) > 0;
}

/**
 * Returns the next N upcoming vacation periods (endDate >= today), ordered by startDate.
 */
export function getUpcomingVacations(limit = 3): VacationPeriod[] {
  const db = getDB();
  const today = formatDate(new Date());
  const result = db.exec(
    "SELECT name, startDate, endDate, source FROM vacation_periods WHERE endDate >= ? GROUP BY name, startDate, endDate ORDER BY startDate ASC LIMIT ?",
    [today, limit],
  );
  if (!result[0]) return [];
  return result[0].values.map((row) => ({
    name: row[0] as string,
    startDate: row[1] as string,
    endDate: row[2] as string,
    source: row[3] as string,
  }));
}

/**
 * Sync Zurich holidays for a given year into the vacation_periods table.
 */
export function syncZurichHolidays(year: number): void {
  const allHolidays = [...getZurichHolidays(year), ...getZurichPublicHolidays(year)];
  const db = getDB();
  for (const h of allHolidays) {
    db.run(
      "INSERT OR IGNORE INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
      [h.name, h.startDate, h.endDate, h.source],
    );
  }
}

/**
 * Sync holidays from a named preset into the vacation_periods table.
 * Replaces any previous entries for the same preset on re-sync.
 */
export function syncPresetHolidays(
  presetId: string,
  year: number,
): { synced: number; source: "external" | "fallback" } {
  const preset = getPresetById(presetId);
  if (!preset) throw new Error(`Unknown preset: ${presetId}`);

  const db = getDB();
  const sourceTag = `preset:${presetId}`;

  // Delete previous entries for this preset
  db.run("DELETE FROM vacation_periods WHERE source = ?", [sourceTag]);

  // Fall back to hardcoded data (hybrid external fetch is a future enhancement)
  const holidays = preset.getHolidays(year);

  for (const h of holidays) {
    db.run(
      "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
      [h.name, h.startDate, h.endDate, sourceTag],
    );
  }

  return { synced: holidays.length, source: "fallback" };
}
