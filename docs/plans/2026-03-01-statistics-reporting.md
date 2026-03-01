# Statistics & Reporting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full-stack statistics module — semester-based training/attendance/tournament stats, CSV/PDF export, dashboard charts, and public homepage stats bar.

**Architecture:** Direct SQL queries against existing sql.js DB for admin endpoints; in-memory 1h-TTL cache for public homepage stats. Frontend uses chart.js + react-chartjs-2 for bar charts on a dedicated /dashboard/stats page. Public homepage gets a cached stats bar.

**Tech Stack:** Express routes (existing pattern), sql.js queries, pdfmake (PDF export), chart.js + react-chartjs-2 (charts), Vitest (tests)

---

### Task 1: Semester utilities

**Files:**
- Create: `server/src/utils/semester.ts`
- Test: `server/src/utils/__tests__/semester.test.ts`

**Step 1: Write the failing tests**

Create `server/src/utils/__tests__/semester.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getSemesterBounds, getSchoolYearBounds, parsePeriodParam } from "../semester.js";

describe("getSemesterBounds", () => {
  it("returns Spring for Feb 1", () => {
    const r = getSemesterBounds(new Date("2026-02-01"));
    expect(r).toEqual({
      start: "2026-02-01",
      end: "2026-07-31",
      label: "Spring 2026",
      type: "spring",
    });
  });

  it("returns Spring for Jul 31", () => {
    const r = getSemesterBounds(new Date("2026-07-31"));
    expect(r.type).toBe("spring");
    expect(r.label).toBe("Spring 2026");
  });

  it("returns Autumn for Aug 1", () => {
    const r = getSemesterBounds(new Date("2026-08-01"));
    expect(r).toEqual({
      start: "2026-08-01",
      end: "2027-01-31",
      label: "Autumn 2026/27",
      type: "autumn",
    });
  });

  it("returns Autumn for Jan 15 (belongs to previous Aug)", () => {
    const r = getSemesterBounds(new Date("2026-01-15"));
    expect(r).toEqual({
      start: "2025-08-01",
      end: "2026-01-31",
      label: "Autumn 2025/26",
      type: "autumn",
    });
  });

  it("returns Autumn for Dec 25", () => {
    const r = getSemesterBounds(new Date("2025-12-25"));
    expect(r.type).toBe("autumn");
    expect(r.start).toBe("2025-08-01");
  });
});

describe("getSchoolYearBounds", () => {
  it("returns 2025/26 for Mar 2026", () => {
    const r = getSchoolYearBounds(new Date("2026-03-15"));
    expect(r).toEqual({
      start: "2025-08-01",
      end: "2026-07-31",
      label: "2025/26",
      type: "school_year",
    });
  });

  it("returns 2026/27 for Aug 2026", () => {
    const r = getSchoolYearBounds(new Date("2026-08-01"));
    expect(r).toEqual({
      start: "2026-08-01",
      end: "2027-07-31",
      label: "2026/27",
      type: "school_year",
    });
  });
});

describe("parsePeriodParam", () => {
  it("parses 'spring-2026'", () => {
    const r = parsePeriodParam("spring-2026");
    expect(r.type).toBe("spring");
    expect(r.start).toBe("2026-02-01");
  });

  it("parses 'autumn-2025'", () => {
    const r = parsePeriodParam("autumn-2025");
    expect(r.type).toBe("autumn");
    expect(r.start).toBe("2025-08-01");
  });

  it("parses 'year-2025'", () => {
    const r = parsePeriodParam("year-2025");
    expect(r.type).toBe("school_year");
    expect(r.start).toBe("2025-08-01");
  });

  it("defaults to current semester for undefined", () => {
    const r = parsePeriodParam(undefined);
    expect(["spring", "autumn"]).toContain(r.type);
  });

  it("parses 'current'", () => {
    const r = parsePeriodParam("current");
    expect(["spring", "autumn"]).toContain(r.type);
  });

  it("parses 'current-year'", () => {
    const r = parsePeriodParam("current-year");
    expect(r.type).toBe("school_year");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/utils/__tests__/semester.test.ts`
Expected: FAIL — module not found

**Step 3: Implement semester utilities**

Create `server/src/utils/semester.ts`:

```ts
export interface StatsPeriod {
  start: string;
  end: string;
  label: string;
  type: "spring" | "autumn" | "school_year";
}

export function getSemesterBounds(date: Date): StatsPeriod {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  if (month >= 1 && month <= 6) {
    return {
      start: `${year}-02-01`,
      end: `${year}-07-31`,
      label: `Spring ${year}`,
      type: "spring",
    };
  }

  if (month >= 7) {
    return {
      start: `${year}-08-01`,
      end: `${year + 1}-01-31`,
      label: `Autumn ${year}/${(year + 1).toString().slice(2)}`,
      type: "autumn",
    };
  }

  // Jan (0) -> autumn semester from previous August
  return {
    start: `${year - 1}-08-01`,
    end: `${year}-01-31`,
    label: `Autumn ${year - 1}/${year.toString().slice(2)}`,
    type: "autumn",
  };
}

export function getSchoolYearBounds(date: Date): StatsPeriod {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  return {
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-07-31`,
    label: `${startYear}/${(startYear + 1).toString().slice(2)}`,
    type: "school_year",
  };
}

export function parsePeriodParam(param?: string): StatsPeriod {
  if (!param || param === "current") {
    return getSemesterBounds(new Date());
  }
  if (param === "current-year") {
    return getSchoolYearBounds(new Date());
  }

  const springMatch = param.match(/^spring-(\d{4})$/);
  if (springMatch) {
    const y = parseInt(springMatch[1], 10);
    return { start: `${y}-02-01`, end: `${y}-07-31`, label: `Spring ${y}`, type: "spring" };
  }

  const autumnMatch = param.match(/^autumn-(\d{4})$/);
  if (autumnMatch) {
    const y = parseInt(autumnMatch[1], 10);
    return {
      start: `${y}-08-01`,
      end: `${y + 1}-01-31`,
      label: `Autumn ${y}/${(y + 1).toString().slice(2)}`,
      type: "autumn",
    };
  }

  const yearMatch = param.match(/^year-(\d{4})$/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    return {
      start: `${y}-08-01`,
      end: `${y + 1}-07-31`,
      label: `${y}/${(y + 1).toString().slice(2)}`,
      type: "school_year",
    };
  }

  // Fallback: current semester
  return getSemesterBounds(new Date());
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/utils/__tests__/semester.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/utils/semester.ts server/src/utils/__tests__/semester.test.ts && git commit -m "feat(stats): add semester period utilities with tests" -- server/src/utils/semester.ts server/src/utils/__tests__/semester.test.ts
```

---

### Task 2: Statistics service — query functions

**Files:**
- Create: `server/src/services/statistics.service.ts`
- Test: `server/src/services/__tests__/statistics.service.test.ts`

**Step 1: Write the failing tests**

Create `server/src/services/__tests__/statistics.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { initDB, getDB } from "../../database.js";
import {
  getTrainingHours,
  getPersonHours,
  getCoachHours,
  getNoShows,
  getAttendanceRate,
  getTournamentParticipation,
  getHomepageStats,
  invalidateHomepageStatsCache,
} from "../statistics.service.js";
import type { StatsPeriod } from "../../utils/semester.js";

let db: Database;

const PERIOD: StatsPeriod = {
  start: "2026-02-01",
  end: "2026-07-31",
  label: "Spring 2026",
  type: "spring",
};

function seedTestData() {
  const db = getDB();

  // Create coach guardian
  db.run(
    "INSERT INTO guardians (id, phone, name, role) VALUES (1, '+41791111111', 'Coach Mike', 'coach')",
  );

  // Create players
  db.run("INSERT INTO players (id, name, yearOfBirth, category) VALUES (1, 'Luca', 2016, 'F')");
  db.run("INSERT INTO players (id, name, yearOfBirth, category) VALUES (2, 'Mia', 2015, 'E')");
  db.run("INSERT INTO players (id, name, yearOfBirth, category) VALUES (3, 'Noah', 2016, 'F')");

  // Create training schedule (Wed 18:00-19:30)
  db.run(
    "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Field A')",
  );

  // Create training events (Wed Feb 4 & Wed Feb 11 2026)
  db.run(
    "INSERT INTO events (id, type, title, date, startTime, categoryRequirement, createdBy) VALUES (1, 'training', 'Training F', '2026-02-04', '18:00', 'F', 1)",
  );
  db.run(
    "INSERT INTO events (id, type, title, date, startTime, categoryRequirement, createdBy) VALUES (2, 'training', 'Training F', '2026-02-11', '18:00', 'F', 1)",
  );

  // Create tournament event
  db.run(
    "INSERT INTO events (id, type, title, date, startTime, categoryRequirement, createdBy) VALUES (3, 'tournament', 'Spring Cup', '2026-03-15', '09:00', 'F', 1)",
  );

  // Attendance for event 1: Luca attending, Mia absent (no reason = no-show), Noah unknown
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (1, 1, 'attending')");
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (1, 2, 'absent')");
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (1, 3, 'unknown')");

  // Attendance for event 2: Luca attending, Mia attending, Noah attending
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (2, 1, 'attending')");
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (2, 2, 'attending')");
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (2, 3, 'attending')");

  // Tournament team + players
  db.run("INSERT INTO teams (id, eventId, name) VALUES (1, 3, 'Team A')");
  db.run("INSERT INTO team_players (teamId, playerId) VALUES (1, 1)");
  db.run("INSERT INTO team_players (teamId, playerId) VALUES (1, 3)");

  // Tournament result with trophy
  db.run(
    "INSERT INTO tournament_results (eventId, placement, totalTeams, achievements) VALUES (3, 1, 8, '[\"Winner\"]')",
  );

  // Game history with trophy
  db.run(
    "INSERT INTO game_history (tournamentId, tournamentName, date, placeRanking, isTrophy, trophyType) VALUES (3, 'Spring Cup', '2026-03-15', 1, 1, 'Winner')",
  );
}

describe("statistics.service", () => {
  beforeEach(async () => {
    db = await initDB();
    seedTestData();
    invalidateHomepageStatsCache();
  });

  afterEach(() => {
    db.close();
  });

  describe("getTrainingHours", () => {
    it("returns training hours grouped by team category", () => {
      const results = getTrainingHours(PERIOD);
      expect(results.length).toBeGreaterThanOrEqual(1);
      const fTeam = results.find((r) => r.teamName === "F");
      expect(fTeam).toBeDefined();
      expect(fTeam!.sessionCount).toBe(2);
      // 2 sessions * 90 min (1.5h) = 3h
      expect(fTeam!.trainingHours).toBe(3);
    });

    it("returns empty array for period with no data", () => {
      const empty: StatsPeriod = { start: "2020-02-01", end: "2020-07-31", label: "Spring 2020", type: "spring" };
      expect(getTrainingHours(empty)).toEqual([]);
    });
  });

  describe("getPersonHours", () => {
    it("returns person hours per team category", () => {
      const results = getPersonHours(PERIOD);
      const fTeam = results.find((r) => r.teamName === "F");
      expect(fTeam).toBeDefined();
      // Event 1: 1 attending * 90min, Event 2: 3 attending * 90min = (90+270)/60 = 6 person-hours
      expect(fTeam!.personHours).toBe(6);
    });
  });

  describe("getCoachHours", () => {
    it("returns hours per coach", () => {
      const results = getCoachHours(PERIOD);
      expect(results.length).toBe(1);
      expect(results[0].coachName).toBe("Coach Mike");
      expect(results[0].sessionCount).toBe(2);
      expect(results[0].coachHours).toBe(3);
    });
  });

  describe("getNoShows", () => {
    it("detects no-shows (unknown + absent without reason)", () => {
      const results = getNoShows(PERIOD);
      // Mia: 1 absent (no reason) out of 2 sessions
      const mia = results.find((r) => r.entityLabel === "Mia");
      expect(mia).toBeDefined();
      expect(mia!.noShowCount).toBeGreaterThanOrEqual(1);
      // Noah: 1 unknown out of 2 sessions
      const noah = results.find((r) => r.entityLabel === "Noah");
      expect(noah).toBeDefined();
      expect(noah!.noShowCount).toBeGreaterThanOrEqual(1);
    });

    it("returns noShowRate of 0 for player with no no-shows", () => {
      const results = getNoShows(PERIOD);
      const luca = results.find((r) => r.entityLabel === "Luca");
      expect(luca).toBeDefined();
      expect(luca!.noShowRate).toBe(0);
    });
  });

  describe("getAttendanceRate", () => {
    it("calculates correct attendance rate", () => {
      const results = getAttendanceRate(PERIOD);
      const luca = results.find((r) => r.entityLabel === "Luca");
      expect(luca).toBeDefined();
      expect(luca!.attendedCount).toBe(2);
      expect(luca!.totalSessions).toBe(2);
      expect(luca!.attendanceRate).toBe(1);
    });

    it("returns correct rate for partial attendance", () => {
      const results = getAttendanceRate(PERIOD);
      const noah = results.find((r) => r.entityLabel === "Noah");
      expect(noah).toBeDefined();
      // 1 out of 2
      expect(noah!.attendanceRate).toBe(0.5);
    });
  });

  describe("getTournamentParticipation", () => {
    it("returns tournament count per player", () => {
      const results = getTournamentParticipation(PERIOD);
      expect(results.length).toBe(2); // Luca and Noah
      const luca = results.find((r) => r.entityLabel === "Luca");
      expect(luca!.tournamentCount).toBe(1);
    });
  });

  describe("getHomepageStats", () => {
    it("returns aggregate homepage stats", () => {
      const stats = getHomepageStats();
      expect(stats.lifetimeAthletes).toBeGreaterThanOrEqual(3);
      expect(stats.tournamentsPlayed).toBeGreaterThanOrEqual(1);
      expect(stats.trophiesWon).toBeGreaterThanOrEqual(1);
      expect(stats.computedAt).toBeDefined();
    });

    it("returns cached result on second call", () => {
      const first = getHomepageStats();
      const second = getHomepageStats();
      expect(first.computedAt).toBe(second.computedAt);
    });

    it("invalidates cache", () => {
      const first = getHomepageStats();
      invalidateHomepageStatsCache();
      const second = getHomepageStats();
      expect(second.lifetimeAthletes).toBeGreaterThanOrEqual(3);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/statistics.service.test.ts`
Expected: FAIL — module not found

**Step 3: Implement statistics service**

Create `server/src/services/statistics.service.ts`. The service contains:

- `rowsToObjects()` helper (same pattern as `server/src/routes/events.ts:12-24`)
- `getTrainingHours(period, team?)` — SQL join `events` + `training_schedule` for duration, group by `categoryRequirement`
- `getPersonHours(period, team?)` — attendance count * session duration
- `getCoachHours(period, coachId?)` — events created by coaches
- `getNoShows(period, team?)` — `status = 'unknown'` OR (`status = 'absent'` AND `reason IS NULL`), only past events
- `getAttendanceRate(period, team?)` — attended / total sessions
- `getTournamentParticipation(period)` — distinct tournaments per player via `team_players`
- `getHomepageStats()` — cached aggregate: lifetime athletes, active athletes, tournaments played, trophies won (from `game_history WHERE isTrophy = 1`), training sessions this season, active coaches
- `invalidateHomepageStatsCache()` — resets cache

**Key implementation details:**
- Import `getDB` from `../database.js`, `StatsPeriod` from `../utils/semester.js`
- Duration: JOIN `training_schedule` on `dayOfWeek = CAST(strftime('%w', e.date) AS INTEGER) AND ts.startTime = e.startTime`. Fallback: 90 min.
- Duration calculated as `(strftime('%s', '2000-01-01 ' || ts.endTime) - strftime('%s', '2000-01-01 ' || ts.startTime)) / 60.0` (times are stored as HH:MM strings, not full timestamps)
- No-show: `AND e.date < date('now')` to exclude future events
- Rates: use `|| 0` to prevent NaN on division by zero
- All results include `period` field from the input `StatsPeriod`

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/statistics.service.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/statistics.service.ts server/src/services/__tests__/statistics.service.test.ts && git commit -m "feat(stats): add statistics query service with tests" -- server/src/services/statistics.service.ts server/src/services/__tests__/statistics.service.test.ts
```

---

### Task 3: Export service (CSV + PDF)

**Files:**
- Create: `server/src/services/export.service.ts`
- Test: `server/src/services/__tests__/export.service.test.ts`

**Step 1: Install pdfmake**

Run: `cd server && npm install pdfmake && npm install -D @types/pdfmake`

**Step 2: Write the failing tests**

Create `server/src/services/__tests__/export.service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateCSV, generatePDF } from "../export.service.js";

describe("generateCSV", () => {
  it("produces BOM + semicolon-separated output", () => {
    const buf = generateCSV(
      ["Name", "Hours"],
      [{ Name: "L.", Hours: 3 }, { Name: "M.", Hours: 2 }],
    );
    const text = buf.toString("utf-8");
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Name;Hours");
    expect(text).toContain("L.;3");
    expect(text).toContain("M.;2");
  });

  it("handles empty rows", () => {
    const buf = generateCSV(["A"], []);
    const text = buf.toString("utf-8");
    expect(text).toContain("A");
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1); // header only
  });
});

describe("generatePDF", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await generatePDF(
      "Test Report",
      ["Name", "Hours"],
      [{ Name: "L.", Hours: 3 }],
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    // PDF starts with %PDF
    expect(buf.toString("utf-8", 0, 5)).toContain("%PDF");
  });
});
```

**Step 3: Implement export service**

Create `server/src/services/export.service.ts`:

```ts
import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";

export function generateCSV(
  headers: string[],
  rows: Record<string, string | number>[],
): Buffer {
  const BOM = "\uFEFF";
  const lines: string[] = [headers.join(";")];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? "")).join(";"));
  }
  return Buffer.from(BOM + lines.join("\n"), "utf-8");
}

export async function generatePDF(
  title: string,
  headers: string[],
  rows: Record<string, string | number>[],
): Promise<Buffer> {
  const fonts = {
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  };

  const printer = new PdfPrinter(fonts);

  const tableBody = [
    headers.map((h) => ({ text: h, bold: true })),
    ...rows.map((row) => headers.map((h) => String(row[h] ?? ""))),
  ];

  const docDefinition: TDocumentDefinitions = {
    defaultStyle: { font: "Helvetica" },
    content: [
      { text: title, style: "header" },
      {
        table: { headerRows: 1, widths: headers.map(() => "*"), body: tableBody },
        layout: "lightHorizontalLines",
      },
    ],
    styles: {
      header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
    },
    footer: {
      text: `Generated by OpenKick - ${new Date().toISOString().split("T")[0]}. Anonymised export.`,
      alignment: "center",
      fontSize: 8,
      margin: [0, 10, 0, 0],
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
```

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/export.service.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/export.service.ts server/src/services/__tests__/export.service.test.ts server/package.json server/package-lock.json && git commit -m "feat(stats): add CSV/PDF export service with pdfmake" -- server/src/services/export.service.ts server/src/services/__tests__/export.service.test.ts server/package.json server/package-lock.json
```

---

### Task 4: Statistics routes (admin, auth-gated)

**Files:**
- Create: `server/src/routes/statistics.ts`
- Test: `server/src/routes/__tests__/statistics.routes.test.ts`

**Step 1: Write the failing tests**

Create `server/src/routes/__tests__/statistics.routes.test.ts`. Pattern: follow existing `events-import.test.ts` — create Express app, initDB, register router, use `fetch()`.

Test cases:
- `GET /api/admin/stats/training-hours` without auth -> 401
- `GET /api/admin/stats/training-hours` with parent role -> 403
- `GET /api/admin/stats/training-hours` with coach auth -> 200 + valid body
- `GET /api/admin/stats/person-hours` -> 200
- `GET /api/admin/stats/coach-hours` -> 200
- `GET /api/admin/stats/no-shows` -> 200
- `GET /api/admin/stats/attendance-rate` -> 200
- `GET /api/admin/stats/tournament-participation` -> 200
- `GET /api/admin/stats/export?format=csv&type=training-hours` -> 200 + `text/csv` content-type
- `GET /api/admin/stats/export?format=pdf&type=training-hours` -> 200 + `application/pdf` content-type
- `GET /api/admin/stats/export?format=invalid` -> 400

Auth: generate a JWT with `generateJWT({ id: 1, role: 'coach' })` from `../../auth.js`. Seed DB with coach guardian + training data (reuse seed pattern from Task 2).

**Step 2: Implement statistics routes**

Create `server/src/routes/statistics.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { authMiddleware, requireRole } from "../auth.js";
import { parsePeriodParam } from "../utils/semester.js";
import {
  getTrainingHours,
  getPersonHours,
  getCoachHours,
  getNoShows,
  getAttendanceRate,
  getTournamentParticipation,
} from "../services/statistics.service.js";
import { generateCSV, generatePDF } from "../services/export.service.js";

export const statisticsRouter = Router();

// All admin stats require auth + coach/admin role
statisticsRouter.use("/admin/stats", authMiddleware, requireRole("coach", "admin"));

statisticsRouter.get("/admin/stats/training-hours", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getTrainingHours(period, team));
});

statisticsRouter.get("/admin/stats/person-hours", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getPersonHours(period, team));
});

statisticsRouter.get("/admin/stats/coach-hours", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const coachId = req.query.coach ? parseInt(req.query.coach as string, 10) : undefined;
  res.json(getCoachHours(period, coachId));
});

statisticsRouter.get("/admin/stats/no-shows", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getNoShows(period, team));
});

statisticsRouter.get("/admin/stats/attendance-rate", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getAttendanceRate(period, team));
});

statisticsRouter.get("/admin/stats/tournament-participation", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  res.json(getTournamentParticipation(period));
});

// Export endpoint
statisticsRouter.get("/admin/stats/export", async (req: Request, res: Response) => {
  const format = req.query.format as string;
  const type = req.query.type as string;
  const period = parsePeriodParam(req.query.period as string | undefined);

  if (!format || !["csv", "pdf"].includes(format)) {
    res.status(400).json({ error: "format must be 'csv' or 'pdf'" });
    return;
  }

  const validTypes = [
    "training-hours", "person-hours", "coach-hours",
    "no-shows", "attendance-rate", "tournament-participation",
  ];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  // Get data + headers based on type
  const { headers, rows } = getExportData(type, period);

  const filename = `openkick-${type}-${period.label.toLowerCase().replace(/[\s/]+/g, "-")}.${format}`;

  if (format === "csv") {
    const buf = generateCSV(headers, rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } else {
    const buf = await generatePDF(
      `${type.replace(/-/g, " ")} - ${period.label}`,
      headers,
      rows,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  }
});
```

The `getExportData(type, period)` helper maps each stat type to headers + rows with initials (using `computeInitials` from `../services/player-initials.js`) for player names in export.

**Step 3: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/statistics.routes.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git restore --staged :/ && git add server/src/routes/statistics.ts server/src/routes/__tests__/statistics.routes.test.ts && git commit -m "feat(stats): add admin statistics routes with auth and export" -- server/src/routes/statistics.ts server/src/routes/__tests__/statistics.routes.test.ts
```

---

### Task 5: Homepage stats public route + settings

**Files:**
- Create: `server/src/routes/public/homepage-stats.ts` (create `public/` dir under routes)
- Test: `server/src/routes/__tests__/homepage-stats.routes.test.ts`
- Modify: `server/src/routes/settings.ts` — add homepage stats settings GET/PUT with inline auth
- Modify: `server/src/database.ts` — add `homepage_stats_settings` default

**Step 1: Write the failing tests**

`server/src/routes/__tests__/homepage-stats.routes.test.ts`:

Test cases:
- `GET /api/public/homepage-stats` -> 200, no auth required, returns `HomepageStats` shape
- Returns `null` for disabled fields when settings hide them
- Second request returns same `computedAt` (cache test)
- Settings: `GET /api/admin/settings/homepage-stats` -> 200 with admin auth
- Settings: `PUT /api/admin/settings/homepage-stats` -> 200, updates visibility

**Step 2: Implement homepage stats route**

Create `server/src/routes/public/homepage-stats.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { getDB } from "../../database.js";
import { getHomepageStats } from "../../services/statistics.service.js";

export const homepageStatsRouter = Router();

const DEFAULT_SETTINGS = {
  lifetimeAthletes: true,
  activeAthletes: true,
  tournamentsPlayed: true,
  trophiesWon: true,
  trainingSessionsThisSeason: true,
  activeCoaches: true,
};

homepageStatsRouter.get("/public/homepage-stats", (_req: Request, res: Response) => {
  const db = getDB();
  const row = db.exec("SELECT value FROM settings WHERE key = 'homepage_stats_settings'");
  const settings = row.length > 0 && row[0].values.length > 0
    ? JSON.parse(row[0].values[0][0] as string)
    : DEFAULT_SETTINGS;

  const stats = getHomepageStats();

  // Filter: set hidden fields to null
  const filtered: Record<string, unknown> = { computedAt: stats.computedAt };
  for (const [key, visible] of Object.entries(settings)) {
    filtered[key] = visible ? (stats as Record<string, unknown>)[key] : null;
  }

  res.json(filtered);
});
```

**Step 3: Add settings endpoints to `server/src/routes/settings.ts`**

Add before the final export (with inline auth middleware):

```ts
import { authMiddleware, requireRole } from "../auth.js";
import { invalidateHomepageStatsCache } from "../services/statistics.service.js";

// GET /api/admin/settings/homepage-stats
settingsRouter.get(
  "/admin/settings/homepage-stats",
  authMiddleware,
  requireRole("admin"),
  (_req: Request, res: Response) => {
    const db = getDB();
    const defaults = { lifetimeAthletes: true, activeAthletes: true, tournamentsPlayed: true, trophiesWon: true, trainingSessionsThisSeason: true, activeCoaches: true };
    const row = db.exec("SELECT value FROM settings WHERE key = 'homepage_stats_settings'");
    const settings = row.length > 0 && row[0].values.length > 0
      ? JSON.parse(row[0].values[0][0] as string)
      : defaults;
    res.json(settings);
  },
);

// PUT /api/admin/settings/homepage-stats
settingsRouter.put(
  "/admin/settings/homepage-stats",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const db = getDB();
    const defaults = { lifetimeAthletes: true, activeAthletes: true, tournamentsPlayed: true, trophiesWon: true, trainingSessionsThisSeason: true, activeCoaches: true };
    const row = db.exec("SELECT value FROM settings WHERE key = 'homepage_stats_settings'");
    const current = row.length > 0 && row[0].values.length > 0
      ? JSON.parse(row[0].values[0][0] as string)
      : defaults;

    const merged = { ...current, ...req.body };
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "homepage_stats_settings",
      JSON.stringify(merged),
    ]);

    invalidateHomepageStatsCache();
    res.json(merged);
  },
);
```

**Step 4: Add default setting to `server/src/database.ts`**

Add to `DEFAULT_SETTINGS` object (around line 273-305):

```ts
homepage_stats_settings: JSON.stringify({
  lifetimeAthletes: true,
  activeAthletes: true,
  tournamentsPlayed: true,
  trophiesWon: true,
  trainingSessionsThisSeason: true,
  activeCoaches: true,
}),
```

**Step 5: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/homepage-stats.routes.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/routes/public/homepage-stats.ts server/src/routes/__tests__/homepage-stats.routes.test.ts server/src/routes/settings.ts server/src/database.ts && git commit -m "feat(stats): add public homepage stats endpoint with cache and settings" -- server/src/routes/public/homepage-stats.ts server/src/routes/__tests__/homepage-stats.routes.test.ts server/src/routes/settings.ts server/src/database.ts
```

---

### Task 6: Register routers in index.ts

**Files:**
- Modify: `server/src/index.ts`

**Step 1: Add imports and registration**

Add after existing imports (around line 36):

```ts
import { statisticsRouter } from "./routes/statistics.js";
import { homepageStatsRouter } from "./routes/public/homepage-stats.js";
```

Add after existing `app.use("/api", ...)` calls (around line 79):

```ts
app.use("/api", statisticsRouter);
app.use("/api", homepageStatsRouter);
```

**Step 2: Verify server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All PASS (existing + new tests)

**Step 4: Commit**

```bash
git restore --staged :/ && git add server/src/index.ts && git commit -m "feat(stats): register statistics and homepage-stats routes" -- server/src/index.ts
```

---

### Task 7: Frontend — API functions + SemesterPicker

**Files:**
- Modify: `web/src/lib/api.ts` — add stats API functions
- Create: `web/src/components/stats/SemesterPicker.tsx`

**Step 1: Add API functions to `web/src/lib/api.ts`**

Add these typed API call functions at the end of the file:

```ts
// Statistics API
export async function fetchTrainingHours(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/training-hours?${params}`);
}

export async function fetchPersonHours(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/person-hours?${params}`);
}

export async function fetchCoachHours(period?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  return apiFetch<any[]>(`/api/admin/stats/coach-hours?${params}`);
}

export async function fetchNoShows(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/no-shows?${params}`);
}

export async function fetchAttendanceRate(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/attendance-rate?${params}`);
}

export async function fetchTournamentParticipation(period?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  return apiFetch<any[]>(`/api/admin/stats/tournament-participation?${params}`);
}

export function getStatsExportUrl(format: "csv" | "pdf", type: string, period?: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const params = new URLSearchParams({ format, type });
  if (period) params.set("period", period);
  return `${base}/api/admin/stats/export?${params}`;
}

export async function fetchHomepageStats() {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const res = await fetch(`${base}/api/public/homepage-stats`);
  return res.json();
}

export async function fetchHomepageStatsSettings() {
  return apiFetch<Record<string, boolean>>("/api/admin/settings/homepage-stats");
}

export async function updateHomepageStatsSettings(settings: Record<string, boolean>) {
  return apiFetch<Record<string, boolean>>("/api/admin/settings/homepage-stats", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
```

**Step 2: Create SemesterPicker**

Create `web/src/components/stats/SemesterPicker.tsx`:

A `'use client'` component with a `<select>` dropdown. Props: `value: string`, `onChange: (period: string) => void`. Generates options for the last 4 semesters + current + last 2 school years using client-side date math. Each option has a value like `spring-2026` and a label like `Spring 2026`.

**Step 3: Commit**

```bash
git restore --staged :/ && git add web/src/lib/api.ts web/src/components/stats/SemesterPicker.tsx && git commit -m "feat(stats): add frontend stats API functions and SemesterPicker" -- web/src/lib/api.ts web/src/components/stats/SemesterPicker.tsx
```

---

### Task 8: Frontend — Install chart.js and create chart components

**Files:**
- Install: `chart.js`, `react-chartjs-2` in `web/`
- Create: `web/src/components/stats/TrainingHoursChart.tsx`
- Create: `web/src/components/stats/PersonHoursChart.tsx`
- Create: `web/src/components/stats/AttendanceRateChart.tsx`

**Step 1: Install chart.js**

Run: `cd web && npm install chart.js react-chartjs-2`

**Step 2: Create chart components**

Each chart component:
- Is a `'use client'` component
- Accepts `data` as prop (array of stat results from API)
- Registers required chart.js components (`Chart.register(...)`)
- Renders a `<Bar>` chart from `react-chartjs-2`
- Uses emerald/green color palette consistent with existing Tailwind theme

`TrainingHoursChart.tsx`: Bar chart showing x-axis: team categories, y-axis: training hours.

`PersonHoursChart.tsx`: Bar chart showing x-axis: team categories, y-axis: person-hours.

`AttendanceRateChart.tsx`: Horizontal bar chart showing x-axis: player names, y-axis: attendance rate (0-100%). Bars colored green (>80%), yellow (50-80%), red (<50%).

**Step 3: Commit**

```bash
git restore --staged :/ && git add web/package.json web/package-lock.json web/src/components/stats/TrainingHoursChart.tsx web/src/components/stats/PersonHoursChart.tsx web/src/components/stats/AttendanceRateChart.tsx && git commit -m "feat(stats): add chart.js bar chart components for stats dashboard" -- web/package.json web/package-lock.json web/src/components/stats/TrainingHoursChart.tsx web/src/components/stats/PersonHoursChart.tsx web/src/components/stats/AttendanceRateChart.tsx
```

---

### Task 9: Frontend — Card and table components

**Files:**
- Create: `web/src/components/stats/CoachHoursCard.tsx`
- Create: `web/src/components/stats/NoShowsTable.tsx`
- Create: `web/src/components/stats/TournamentStatsCard.tsx`
- Create: `web/src/components/stats/StatsExportButton.tsx`

**Step 1: Create components**

`CoachHoursCard.tsx`: Card with a table inside showing coach name, sessions, hours. Uses existing card styling (rounded-xl, shadow, p-6).

`NoShowsTable.tsx`: Table with columns: Player, No-Shows, Registered, Rate. Sorted by rate descending. Rate cell shows red/yellow color coding.

`TournamentStatsCard.tsx`: Card showing total tournaments in period, player breakdown list.

`StatsExportButton.tsx`: Dropdown button with two options (CSV, PDF). On click, triggers download via `getStatsExportUrl()`. Uses `fetch` with auth token to get the blob, then creates a temporary download link.

**Step 2: Commit**

```bash
git restore --staged :/ && git add web/src/components/stats/CoachHoursCard.tsx web/src/components/stats/NoShowsTable.tsx web/src/components/stats/TournamentStatsCard.tsx web/src/components/stats/StatsExportButton.tsx && git commit -m "feat(stats): add stats card, table, and export button components" -- web/src/components/stats/CoachHoursCard.tsx web/src/components/stats/NoShowsTable.tsx web/src/components/stats/TournamentStatsCard.tsx web/src/components/stats/StatsExportButton.tsx
```

---

### Task 10: Frontend — Stats dashboard page

**Files:**
- Create: `web/src/app/dashboard/stats/page.tsx`
- Modify: `web/src/app/dashboard/page.tsx` — add stats highlights widget

**Step 1: Create stats page**

`web/src/app/dashboard/stats/page.tsx`:

- `'use client'` component
- State: `period` (string, default 'current'), loading flag, data arrays for each stat type
- On mount + period change: fetch all 6 stat endpoints in parallel via `Promise.all`
- Layout:
  - Top bar: `<SemesterPicker>` + `<StatsExportButton>`
  - Row 1 (`grid grid-cols-1 md:grid-cols-3 gap-4`): 3 summary cards (Training Hours total, Person-Hours total, Active Coaches count)
  - Row 2 (`grid grid-cols-1 lg:grid-cols-2 gap-4`): `<AttendanceRateChart>` + `<NoShowsTable>`
  - Row 3 (`grid grid-cols-1 lg:grid-cols-2 gap-4`): `<CoachHoursCard>` + `<TournamentStatsCard>`
  - Full width: `<TrainingHoursChart>` + `<PersonHoursChart>`

**Step 2: Add stats link to dashboard**

In `web/src/app/dashboard/page.tsx`, add a "Statistics" link card after existing widgets. Uses a `<Link>` to `/dashboard/stats/` with a chart icon.

**Step 3: Verify frontend compiles**

Run: `cd web && npx next build`
Expected: Successful build

**Step 4: Commit**

```bash
git restore --staged :/ && git add web/src/app/dashboard/stats/page.tsx web/src/app/dashboard/page.tsx && git commit -m "feat(stats): add statistics dashboard page with charts and export" -- web/src/app/dashboard/stats/page.tsx web/src/app/dashboard/page.tsx
```

---

### Task 11: Frontend — Homepage stats bar + settings toggle

**Files:**
- Create: `web/src/components/HomepageStatsBar.tsx`
- Modify: `web/src/app/page.tsx` — add stats bar

**Step 1: Create HomepageStatsBar**

`web/src/components/HomepageStatsBar.tsx`:

- `'use client'` component
- Fetches `/api/public/homepage-stats` on mount (no auth needed)
- Renders a horizontal flex row of metric badges/pills
- Each metric: icon + number + label (e.g., "42 Athletes")
- Hidden metrics (null values) are not rendered
- Styled with existing Tailwind patterns (rounded, shadow, emerald accents)

**Step 2: Add to homepage**

In `web/src/app/page.tsx`, add `<HomepageStatsBar />` between the description and the action buttons (around line 19).

**Step 3: Add settings toggle**

In the admin settings page (or create a section within existing settings), add a "Homepage Statistics" panel with toggle switches for each stat field. Uses `fetchHomepageStatsSettings()` and `updateHomepageStatsSettings()`.

**Step 4: Verify build**

Run: `cd web && npx next build`
Expected: Successful build

**Step 5: Commit**

```bash
git restore --staged :/ && git add web/src/components/HomepageStatsBar.tsx web/src/app/page.tsx && git commit -m "feat(stats): add public homepage stats bar and settings toggles" -- web/src/components/HomepageStatsBar.tsx web/src/app/page.tsx
```

---

### Task 12: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md` — check off all Statistics & Reporting items
- Modify: `RELEASE_NOTES.md` — add release entry

**Step 1: Update FEATURES.md**

Change all `- [ ]` under "Statistics & Reporting (PRD 4.5.9)" to `- [x]`.

**Step 2: Update RELEASE_NOTES.md**

Add new release section with bullet points:
- Semester-based statistics (Spring: Feb-Jul, Autumn: Aug-Jan)
- Training hours and person-hours tracking per team
- Coach hours tracking (sessions led per coach)
- No-show detection and rates per player
- Attendance rate metrics per player
- Tournament participation stats (per player and team)
- Statistics dashboard with bar charts and summary cards
- CSV and PDF export for club board reporting
- Public homepage stats bar (lifetime athletes, tournaments, trophies, sessions)
- Admin toggles for homepage stats visibility

**Step 3: Commit**

```bash
git restore --staged :/ && git add FEATURES.md RELEASE_NOTES.md && git commit -m "docs: update features and release notes for statistics module" -- FEATURES.md RELEASE_NOTES.md
```

---

### Task 13: Full test suite + build verification

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All PASS (existing + new)

**Step 2: Run frontend build**

Run: `cd web && npx next build`
Expected: Successful build

**Step 3: Fix any issues discovered**

If any test fails or build errors occur, fix and re-run.

**Step 4: Final commit if any fixes needed**

Commit fixes with descriptive message.
