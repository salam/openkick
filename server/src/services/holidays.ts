import { getDB } from "../database.js";
import { chatCompletion } from "./llm.js";

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
 * Sync Zurich holidays for a given year into the vacation_periods table.
 */
export function syncZurichHolidays(year: number): void {
  const holidays = getZurichHolidays(year);
  const db = getDB();
  for (const h of holidays) {
    db.run(
      "INSERT OR IGNORE INTO vacation_periods (name, startDate, endDate, source) VALUES (?, ?, ?, ?)",
      [h.name, h.startDate, h.endDate, h.source],
    );
  }
}
