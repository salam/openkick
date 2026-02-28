import * as cheerio from "cheerio";

/**
 * Represents a single match extracted from a turnieragenda.ch schedule page.
 */
export interface ExtractedMatchResult {
  /** Game label, e.g. "Game 1" */
  match: string;
  /** Home team name */
  home: string;
  /** Away team name */
  away: string;
  /** Score string, e.g. "2:1" or "pending" if not yet played */
  score: string;
  /** Kick-off time, e.g. "10:00" or "" */
  time: string;
}

const TURNIERAGENDA_HOST = "turnieragenda.ch";

/**
 * Checks whether a URL points to turnieragenda.ch.
 */
export function isTurnieragendaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === TURNIERAGENDA_HOST || parsed.hostname === `www.${TURNIERAGENDA_HOST}`;
  } catch {
    return false;
  }
}

/**
 * Extracts the numeric event ID from a turnieragenda.ch URL path.
 * Supports paths like /de/event/schedule/7918 or /event/detail/7918.
 */
export function extractTurnieragendaEventId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(\d+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Builds the schedule page URL for a given event ID.
 */
export function buildScheduleUrl(eventId: string): string {
  return `https://www.turnieragenda.ch/de/event/schedule/${eventId}`;
}

/**
 * Builds the live schedule page URL for a given event ID.
 */
export function buildLiveScheduleUrl(eventId: string): string {
  return `https://www.turnieragenda.ch/de/event/schedule-live/${eventId}`;
}

/**
 * Parses HTML from a turnieragenda.ch schedule page and extracts match results.
 *
 * Supports two table layouts:
 *
 * 1. Real turnieragenda.ch layout (class-based):
 *    Uses CSS classes like .time, .club1, .club2, .td-result on <td> elements,
 *    with team names inside <span class="js-club">.
 *
 * 2. Simple positional layout (7-column rows):
 *    matchNum | time | homeTeam | homeScore | : | awayScore | awayTeam
 *    The colon ":" is a standalone separator cell.
 */
export function parseTurnieragendaSchedule(html: string): ExtractedMatchResult[] {
  const $ = cheerio.load(html);
  const results: ExtractedMatchResult[] = [];

  // Strategy 1: class-based parsing (real turnieragenda.ch HTML)
  const classBasedRows = $("tr.js-schedule-game");
  if (classBasedRows.length > 0) {
    classBasedRows.each((_i, row) => {
      const $row = $(row);
      const nr = $row.attr("data-nr") || "";
      const time = $row.find("td.time").text().trim();
      const home = $row.find("td.club1 span.js-club").text().trim();
      const away = $row.find("td.club2 span.js-club").text().trim();
      const resultText = $row.find("td.td-result").text().trim();

      // The result cell contains something like "2:1" or just ":"
      let score: string;
      if (resultText === ":") {
        score = "pending";
      } else {
        score = resultText;
      }

      if (home || away) {
        results.push({
          match: `Game ${nr}`,
          home,
          away,
          score,
          time,
        });
      }
    });

    return results;
  }

  // Strategy 2: positional parsing (simple table layout)
  // Look for rows that contain a standalone ":" cell as the score separator
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 7) return;

    // Find the colon separator cell index
    let colonIdx = -1;
    cells.each((j, cell) => {
      const text = $(cell).text().trim();
      if (text === ":") {
        colonIdx = j;
        return false; // break
      }
    });

    if (colonIdx < 0 || colonIdx < 3) return;

    // Layout: ... | homeTeam | homeScore | : | awayScore | awayTeam
    const homeTeam = $(cells[colonIdx - 2]).text().trim();
    const homeScore = $(cells[colonIdx - 1]).text().trim();
    const awayScore = $(cells[colonIdx + 1]).text().trim();
    const awayTeam = $(cells[colonIdx + 2]).text().trim();

    // Find time: look for HH:MM pattern in cells before the home team
    let time = "";
    for (let j = 0; j < colonIdx - 2; j++) {
      const text = $(cells[j]).text().trim();
      if (/^\d{1,2}:\d{2}$/.test(text)) {
        time = text;
        break;
      }
    }

    // Find match number: look for a plain number in early cells
    let matchNum = "";
    for (let j = 0; j < colonIdx - 2; j++) {
      const text = $(cells[j]).text().trim();
      if (/^\d+$/.test(text)) {
        matchNum = text;
        break;
      }
    }

    // Determine score
    let score: string;
    if (homeScore === "" && awayScore === "") {
      score = "pending";
    } else {
      score = `${homeScore}:${awayScore}`;
    }

    results.push({
      match: matchNum ? `Game ${matchNum}` : "",
      home: homeTeam,
      away: awayTeam,
      score,
      time,
    });
  });

  return results;
}
