import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDB, getDB } from "../../database.js";
import type { Database } from "sql.js";

let getZurichHolidays: typeof import("../holidays.js").getZurichHolidays;
let parseICS: typeof import("../holidays.js").parseICS;
let extractHolidaysFromUrl: typeof import("../holidays.js").extractHolidaysFromUrl;
let isVacationDay: typeof import("../holidays.js").isVacationDay;
let syncZurichHolidays: typeof import("../holidays.js").syncZurichHolidays;
let syncPresetHolidays: typeof import("../holidays.js").syncPresetHolidays;
let getUpcomingVacations: typeof import("../holidays.js").getUpcomingVacations;
let getZurichPublicHolidays: typeof import("../holidays.js").getZurichPublicHolidays;

let db: Database;

beforeEach(async () => {
  db = await initDB();
  const mod = await import("../holidays.js");
  getZurichHolidays = mod.getZurichHolidays;
  parseICS = mod.parseICS;
  extractHolidaysFromUrl = mod.extractHolidaysFromUrl;
  isVacationDay = mod.isVacationDay;
  syncZurichHolidays = mod.syncZurichHolidays;
  syncPresetHolidays = mod.syncPresetHolidays;
  getUpcomingVacations = mod.getUpcomingVacations;
  getZurichPublicHolidays = mod.getZurichPublicHolidays;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getZurichHolidays", () => {
  it("returns array of 5 vacation periods for 2026", () => {
    const holidays = getZurichHolidays(2026);
    expect(holidays).toHaveLength(5);

    const names = holidays.map((h) => h.name);
    expect(names).toContain("Sportferien");
    expect(names).toContain("Frühlingsferien");
    expect(names).toContain("Sommerferien");
    expect(names).toContain("Herbstferien");
    expect(names).toContain("Weihnachtsferien");
  });

  it("Sportferien is in weeks 7-8 (mid-February 2026)", () => {
    const holidays = getZurichHolidays(2026);
    const sport = holidays.find((h) => h.name === "Sportferien")!;

    // Week 7 of 2026 starts Monday 2026-02-09, week 8 ends Sunday 2026-02-22
    expect(sport.startDate).toBe("2026-02-09");
    expect(sport.endDate).toBe("2026-02-22");
    expect(sport.source).toBe("zurich-official");
  });

  it("all periods have valid ISO date strings and source", () => {
    const holidays = getZurichHolidays(2026);
    for (const h of holidays) {
      expect(h.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.source).toBe("zurich-official");
      expect(h.name.length).toBeGreaterThan(0);
    }
  });
});

describe("getZurichPublicHolidays", () => {
  it("returns 10 public holidays for 2026", () => {
    const holidays = getZurichPublicHolidays(2026);
    expect(holidays).toHaveLength(10);

    const names = holidays.map((h) => h.name);
    expect(names).toContain("Neujahr");
    expect(names).toContain("Berchtoldstag");
    expect(names).toContain("Karfreitag");
    expect(names).toContain("Ostermontag");
    expect(names).toContain("Tag der Arbeit");
    expect(names).toContain("Auffahrt");
    expect(names).toContain("Pfingstmontag");
    expect(names).toContain("Bundesfeier");
    expect(names).toContain("Weihnachten");
    expect(names).toContain("Stephanstag");
  });

  it("single-day holidays have startDate === endDate", () => {
    const holidays = getZurichPublicHolidays(2026);
    for (const h of holidays) {
      expect(h.startDate).toBe(h.endDate);
    }
  });

  it("Easter-based holidays are correct for 2026 (Easter = April 5)", () => {
    const holidays = getZurichPublicHolidays(2026);
    const karfreitag = holidays.find((h) => h.name === "Karfreitag")!;
    const ostermontag = holidays.find((h) => h.name === "Ostermontag")!;
    const auffahrt = holidays.find((h) => h.name === "Auffahrt")!;
    const pfingstmontag = holidays.find((h) => h.name === "Pfingstmontag")!;

    // Easter 2026 = April 5
    expect(karfreitag.startDate).toBe("2026-04-03");
    expect(ostermontag.startDate).toBe("2026-04-06");
    expect(auffahrt.startDate).toBe("2026-05-14");
    expect(pfingstmontag.startDate).toBe("2026-05-25");
  });
});

describe("parseICS", () => {
  it("extracts VEVENT entries and returns vacation periods", () => {
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260209
DTEND:20260223
SUMMARY:Sportferien
END:VEVENT
BEGIN:VEVENT
DTSTART:20260413
DTEND:20260427
SUMMARY:Frühlingsferien
END:VEVENT
END:VCALENDAR`;

    const periods = parseICS(icsContent);
    expect(periods).toHaveLength(2);

    expect(periods[0].name).toBe("Sportferien");
    expect(periods[0].startDate).toBe("2026-02-09");
    expect(periods[0].endDate).toBe("2026-02-23");
    expect(periods[0].source).toBe("ics-import");

    expect(periods[1].name).toBe("Frühlingsferien");
    expect(periods[1].startDate).toBe("2026-04-13");
    expect(periods[1].endDate).toBe("2026-04-27");
  });

  it("handles empty VCALENDAR with no events", () => {
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

    const periods = parseICS(icsContent);
    expect(periods).toHaveLength(0);
  });
});

describe("extractHolidaysFromUrl", () => {
  it("uses LLM to parse webpage content", async () => {
    // Mock fetch for the URL
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "https://example.com/holidays") {
        return new Response("<html><body>Sportferien: 9.2. - 22.2.2026</body></html>", {
          status: 200,
        });
      }
      // Mock LLM API call (OpenAI-style response)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    name: "Sportferien",
                    startDate: "2026-02-09",
                    endDate: "2026-02-22",
                  },
                ]),
              },
            },
          ],
          model: "gpt-4o",
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
        { status: 200 },
      );
    });

    const periods = await extractHolidaysFromUrl("https://example.com/holidays");
    expect(periods).toHaveLength(1);
    expect(periods[0].name).toBe("Sportferien");
    expect(periods[0].startDate).toBe("2026-02-09");
    expect(periods[0].endDate).toBe("2026-02-22");
    expect(periods[0].source).toBe("https://example.com/holidays");
  });
});

describe("isVacationDay", () => {
  beforeEach(() => {
    // Sync Zurich holidays into DB so isVacationDay can query them
    syncZurichHolidays(2026);
  });

  it("returns true for 2026-02-16 which falls within Sportferien", () => {
    expect(isVacationDay("2026-02-16")).toBe(true);
  });

  it("returns false for 2026-04-15 which is not in any vacation", () => {
    // Frühlingsferien W17-18: 2026-04-20 to 2026-05-03
    expect(isVacationDay("2026-04-15")).toBe(false);
  });

  it("returns true for first day of a vacation period", () => {
    expect(isVacationDay("2026-02-09")).toBe(true);
  });

  it("returns true for last day of a vacation period", () => {
    expect(isVacationDay("2026-02-22")).toBe(true);
  });

  it("returns true for a single-day public holiday (Bundesfeier)", () => {
    expect(isVacationDay("2026-08-01")).toBe(true);
  });
});

describe("getUpcomingVacations", () => {
  beforeEach(() => {
    syncZurichHolidays(2026);
  });

  it("returns up to 3 upcoming vacations by default", () => {
    const upcoming = getUpcomingVacations();
    expect(upcoming.length).toBeLessThanOrEqual(3);
    expect(upcoming.length).toBeGreaterThan(0);
    for (const v of upcoming) {
      expect(v.name).toBeTruthy();
      expect(v.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("respects the limit parameter", () => {
    const upcoming = getUpcomingVacations(1);
    expect(upcoming.length).toBe(1);
  });

  it("returns empty array when no vacations exist", () => {
    const db = getDB();
    db.run("DELETE FROM vacation_periods");
    expect(getUpcomingVacations()).toEqual([]);
  });

  it("returns vacations ordered by startDate ascending", () => {
    const upcoming = getUpcomingVacations(5);
    for (let i = 1; i < upcoming.length; i++) {
      expect(upcoming[i].startDate >= upcoming[i - 1].startDate).toBe(true);
    }
  });
});

describe("syncPresetHolidays", () => {
  it("syncs ch-zurich preset and inserts 5 periods", () => {
    const result = syncPresetHolidays("ch-zurich", 2026);
    expect(result.synced).toBe(5);
    expect(result.source).toBe("fallback");

    const db = getDB();
    const rows = db.exec("SELECT * FROM vacation_periods WHERE source = 'preset:ch-zurich'");
    expect(rows[0].values.length).toBe(5);
  });

  it("replaces previous entries on re-sync", () => {
    syncPresetHolidays("ch-zurich", 2026);
    syncPresetHolidays("ch-zurich", 2026);

    const db = getDB();
    const rows = db.exec("SELECT * FROM vacation_periods WHERE source = 'preset:ch-zurich'");
    expect(rows[0].values.length).toBe(5);
  });

  it("returns synced 0 for stub preset with no external URL", () => {
    const result = syncPresetHolidays("ch-bern", 2026);
    expect(result.synced).toBe(0);
    expect(result.source).toBe("fallback");
  });

  it("throws for unknown preset id", () => {
    expect(() => syncPresetHolidays("xx-unknown", 2026)).toThrow("Unknown preset");
  });
});
