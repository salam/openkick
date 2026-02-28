# Tournament Results & Trophy Cabinet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow coaches to manually track tournament wins/trophies and optionally import results from a bracket URL via LLM extraction.

**Architecture:** New `tournament_results` table (1:1 with events) + `teamName` column on events. New Express router for results CRUD + LLM import. New service for results extraction. Frontend: results form on event detail, trophy cabinet page, dashboard widget.

**Tech Stack:** sql.js (SQLite), Express, Next.js (React), existing LLM service (`chatCompletion`)

---

### Task 1: Database Migration — `tournament_results` table + `teamName` column

**Files:**
- Modify: `server/src/database.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
// server/src/services/__tests__/tournament-results.test.ts
import { initDB, getDB } from "../../database.js";

describe("tournament_results table", () => {
  beforeAll(async () => {
    await initDB(); // in-memory
  });

  it("should create tournament_results table", () => {
    const db = getDB();
    const tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tournament_results'"
    );
    expect(tables.length).toBe(1);
    expect(tables[0].values[0][0]).toBe("tournament_results");
  });

  it("should have teamName column on events table", () => {
    const db = getDB();
    const cols = db.exec("PRAGMA table_info(events)");
    const colNames = cols[0].values.map((r) => r[1]);
    expect(colNames).toContain("teamName");
  });

  it("should enforce unique eventId constraint", () => {
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Test Cup', '2026-03-01')");
    const eventId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    db.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams) VALUES (?, 1, 8)",
      [eventId]
    );
    expect(() => {
      db.run(
        "INSERT INTO tournament_results (eventId, placement, totalTeams) VALUES (?, 2, 8)",
        [eventId]
      );
    }).toThrow();
  });

  it("should cascade delete when event is deleted", () => {
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Del Cup', '2026-04-01')");
    const eventId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    db.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams, summary) VALUES (?, 1, 6, 'Great win')",
      [eventId]
    );
    db.run("DELETE FROM events WHERE id = ?", [eventId]);
    const results = db.exec("SELECT * FROM tournament_results WHERE eventId = ?", [eventId]);
    expect(results.length === 0 || results[0].values.length === 0).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/tournament-results.test.ts`
Expected: FAIL — table `tournament_results` does not exist

**Step 3: Add table to SCHEMA and migration**

In `server/src/database.ts`, add to the `SCHEMA` string (after the `broadcasts` table):

```sql
CREATE TABLE IF NOT EXISTS tournament_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  placement INTEGER,
  totalTeams INTEGER,
  summary TEXT,
  resultsUrl TEXT,
  achievements TEXT DEFAULT '[]',
  createdBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

In the migration section of `initDB()` (after the `seriesId` migration), add:

```typescript
// Migrate: add teamName to events if absent
if (!eventCols.includes('teamName')) {
  db.run("ALTER TABLE events ADD COLUMN teamName TEXT");
}
```

Note: The `eventCols` variable already exists from the `seriesId` migration above.

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/tournament-results.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/database.ts server/src/services/__tests__/tournament-results.test.ts && git commit -m "feat: add tournament_results table and teamName column"
```

---

### Task 2: Results Service — CRUD functions

**Files:**
- Create: `server/src/services/tournament-results.ts`
- Test: `server/src/services/__tests__/tournament-results.test.ts` (extend)

**Step 1: Write the failing tests**

Append to the existing test file:

```typescript
import {
  getResults,
  createResults,
  updateResults,
  deleteResults,
} from "../tournament-results.js";

describe("tournament-results service", () => {
  let testEventId: number;

  beforeAll(async () => {
    await initDB(); // in-memory
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Service Cup', '2026-05-01')");
    testEventId = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
  });

  it("getResults returns null when no results exist", () => {
    expect(getResults(testEventId)).toBeNull();
  });

  it("createResults stores and returns results", () => {
    const result = createResults(testEventId, {
      placement: 2,
      totalTeams: 10,
      summary: "Great tournament",
      resultsUrl: "https://example.com/results",
      achievements: [{ type: "2nd_place", label: "2nd Place" }],
    });
    expect(result.eventId).toBe(testEventId);
    expect(result.placement).toBe(2);
    expect(result.totalTeams).toBe(10);
    expect(result.summary).toBe("Great tournament");
    expect(result.achievements).toEqual([{ type: "2nd_place", label: "2nd Place" }]);
  });

  it("getResults returns existing results", () => {
    const result = getResults(testEventId);
    expect(result).not.toBeNull();
    expect(result!.placement).toBe(2);
  });

  it("updateResults modifies existing results", () => {
    const result = updateResults(testEventId, {
      placement: 1,
      achievements: [
        { type: "1st_place", label: "1st Place" },
        { type: "fair_play", label: "Fair Play" },
      ],
    });
    expect(result!.placement).toBe(1);
    expect(result!.achievements).toHaveLength(2);
  });

  it("deleteResults removes results", () => {
    deleteResults(testEventId);
    expect(getResults(testEventId)).toBeNull();
  });

  it("createResults rejects invalid event type", () => {
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'Practice', '2026-05-02')");
    const trainingId = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
    expect(() => createResults(trainingId, { placement: 1, totalTeams: 4 })).toThrow();
  });

  it("createResults rejects placement > totalTeams", () => {
    expect(() => createResults(testEventId, { placement: 10, totalTeams: 5 })).toThrow();
  });

  it("validates achievement types", () => {
    expect(() =>
      createResults(testEventId, {
        placement: 1,
        totalTeams: 8,
        achievements: [{ type: "invalid_type", label: "Bad" }],
      })
    ).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/tournament-results.test.ts`
Expected: FAIL — cannot import from `../tournament-results.js`

**Step 3: Implement the service**

Create `server/src/services/tournament-results.ts`:

```typescript
import { getDB, getLastInsertId } from "../database.js";

export interface Achievement {
  type: string;
  label: string;
}

export interface TournamentResult {
  id: number;
  eventId: number;
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  resultsUrl: string | null;
  achievements: Achievement[];
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResultsInput {
  placement?: number | null;
  totalTeams?: number | null;
  summary?: string | null;
  resultsUrl?: string | null;
  achievements?: Achievement[];
  createdBy?: number | null;
}

const VALID_ACHIEVEMENT_TYPES = [
  "1st_place",
  "2nd_place",
  "3rd_place",
  "fair_play",
  "best_player",
  "custom",
];

const VALID_EVENT_TYPES = ["tournament", "match", "friendly"];

function validateInput(input: CreateResultsInput): void {
  if (
    input.placement != null &&
    input.totalTeams != null &&
    input.placement > input.totalTeams
  ) {
    throw new Error("placement cannot be greater than totalTeams");
  }
  if (input.placement != null && input.placement < 1) {
    throw new Error("placement must be a positive integer");
  }
  if (input.achievements) {
    for (const a of input.achievements) {
      if (!VALID_ACHIEVEMENT_TYPES.includes(a.type)) {
        throw new Error(`Invalid achievement type: ${a.type}`);
      }
    }
  }
}

function validateEventType(eventId: number): void {
  const db = getDB();
  const rows = db.exec("SELECT type FROM events WHERE id = ?", [eventId]);
  if (rows.length === 0 || rows[0].values.length === 0) {
    throw new Error("Event not found");
  }
  const eventType = rows[0].values[0][0] as string;
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw new Error(
      `Results can only be added to ${VALID_EVENT_TYPES.join(", ")} events`
    );
  }
}

function rowToResult(row: unknown[]): TournamentResult {
  return {
    id: row[0] as number,
    eventId: row[1] as number,
    placement: row[2] as number | null,
    totalTeams: row[3] as number | null,
    summary: row[4] as string | null,
    resultsUrl: row[5] as string | null,
    achievements: JSON.parse((row[6] as string) || "[]"),
    createdBy: row[7] as number | null,
    createdAt: row[8] as string,
    updatedAt: row[9] as string,
  };
}

export function getResults(eventId: number): TournamentResult | null {
  const db = getDB();
  const rows = db.exec(
    "SELECT * FROM tournament_results WHERE eventId = ?",
    [eventId]
  );
  if (rows.length === 0 || rows[0].values.length === 0) return null;
  return rowToResult(rows[0].values[0]);
}

export function createResults(
  eventId: number,
  input: CreateResultsInput
): TournamentResult {
  validateEventType(eventId);
  validateInput(input);

  const db = getDB();
  db.run(
    `INSERT INTO tournament_results (eventId, placement, totalTeams, summary, resultsUrl, achievements, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      input.placement ?? null,
      input.totalTeams ?? null,
      input.summary ?? null,
      input.resultsUrl ?? null,
      JSON.stringify(input.achievements ?? []),
      input.createdBy ?? null,
    ]
  );

  return getResults(eventId)!;
}

export function updateResults(
  eventId: number,
  input: Partial<CreateResultsInput>
): TournamentResult | null {
  const existing = getResults(eventId);
  if (!existing) return null;

  const merged: CreateResultsInput = {
    placement: input.placement !== undefined ? input.placement : existing.placement,
    totalTeams: input.totalTeams !== undefined ? input.totalTeams : existing.totalTeams,
    summary: input.summary !== undefined ? input.summary : existing.summary,
    resultsUrl: input.resultsUrl !== undefined ? input.resultsUrl : existing.resultsUrl,
    achievements: input.achievements !== undefined ? input.achievements : existing.achievements,
  };

  validateInput(merged);

  const db = getDB();
  db.run(
    `UPDATE tournament_results
     SET placement = ?, totalTeams = ?, summary = ?, resultsUrl = ?, achievements = ?, updatedAt = datetime('now')
     WHERE eventId = ?`,
    [
      merged.placement ?? null,
      merged.totalTeams ?? null,
      merged.summary ?? null,
      merged.resultsUrl ?? null,
      JSON.stringify(merged.achievements ?? []),
      eventId,
    ]
  );

  return getResults(eventId);
}

export function deleteResults(eventId: number): void {
  const db = getDB();
  db.run("DELETE FROM tournament_results WHERE eventId = ?", [eventId]);
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/tournament-results.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/tournament-results.ts server/src/services/__tests__/tournament-results.test.ts && git commit -m "feat: add tournament-results service with CRUD"
```

---

### Task 3: Results Import Service — LLM extraction from URL

**Files:**
- Create: `server/src/services/results-import.ts`
- Test: `server/src/services/__tests__/results-import.test.ts`

**Step 1: Write the failing test**

```typescript
// server/src/services/__tests__/results-import.test.ts
import { parseResultsResponse } from "../results-import.js";

describe("results-import", () => {
  it("parses valid LLM JSON response", () => {
    const json = JSON.stringify({
      placement: 3,
      totalTeams: 12,
      summary: "Won quarter-final, lost semi-final. Strong defense.",
      achievements: [{ type: "3rd_place", label: "3rd Place" }],
    });
    const result = parseResultsResponse(json);
    expect(result.placement).toBe(3);
    expect(result.totalTeams).toBe(12);
    expect(result.summary).toContain("quarter-final");
    expect(result.achievements).toHaveLength(1);
  });

  it("handles markdown code fences in response", () => {
    const response = '```json\n{"placement": 1, "totalTeams": 8, "summary": "Champions!", "achievements": [{"type": "1st_place", "label": "1st Place"}]}\n```';
    const result = parseResultsResponse(response);
    expect(result.placement).toBe(1);
  });

  it("returns partial result when some fields missing", () => {
    const json = JSON.stringify({ placement: 5, totalTeams: 16 });
    const result = parseResultsResponse(json);
    expect(result.placement).toBe(5);
    expect(result.summary).toBeNull();
    expect(result.achievements).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/results-import.test.ts`
Expected: FAIL — cannot import

**Step 3: Implement the service**

Create `server/src/services/results-import.ts`:

```typescript
import { chatCompletion } from "./llm.js";
import { getDB } from "../database.js";

export interface ImportedResults {
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  achievements: { type: string; label: string }[];
}

function getClubName(): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = 'club_name'");
  if (result.length === 0 || result[0].values.length === 0) return "My Club";
  return result[0].values[0][0] as string;
}

function getTeamIdentifier(eventId: number): string {
  const db = getDB();
  const rows = db.exec("SELECT teamName, title FROM events WHERE id = ?", [eventId]);
  if (rows.length === 0 || rows[0].values.length === 0) return getClubName();
  const teamName = rows[0].values[0][0] as string | null;
  return teamName || getClubName();
}

const EXTRACTION_PROMPT = `Extract tournament results from the following page content.
Look for results of the team whose name contains the search term provided.
Use wildcard / partial matching — the team name on the page may differ slightly.

Return JSON with these fields:
- placement: final ranking as integer (or null if unclear)
- totalTeams: total number of teams in the tournament as integer (or null)
- summary: 2-3 sentence summary of highlights, key match results (or null)
- achievements: array of awards/trophies won, each with "type" and "label".
  Valid types: "1st_place", "2nd_place", "3rd_place", "fair_play", "best_player", "custom".
  Use "custom" for any award not in the predefined list.

Return only the JSON object, no other text.`;

export function parseResultsResponse(content: string): ImportedResults {
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  return {
    placement: parsed.placement != null ? Number(parsed.placement) : null,
    totalTeams: parsed.totalTeams != null ? Number(parsed.totalTeams) : null,
    summary: parsed.summary ?? null,
    achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
  };
}

export async function importResultsFromUrl(
  eventId: number,
  url: string
): Promise<ImportedResults> {
  const teamName = getTeamIdentifier(eventId);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
  }

  const html = await response.text();
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const llmResponse = await chatCompletion([
    { role: "system", content: EXTRACTION_PROMPT },
    {
      role: "user",
      content: `Team to find (use partial/wildcard matching): %${teamName}%\n\nPage content:\n${text}`,
    },
  ]);

  return parseResultsResponse(llmResponse.content);
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/results-import.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/results-import.ts server/src/services/__tests__/results-import.test.ts && git commit -m "feat: add results-import service for LLM extraction"
```

---

### Task 4: Results Router — API endpoints

**Files:**
- Create: `server/src/routes/tournament-results.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/routes/__tests__/tournament-results.test.ts`

**Step 1: Write the failing test**

```typescript
// server/src/routes/__tests__/tournament-results.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { initDB, getDB } from "../../database.js";

describe("tournament-results routes (unit)", () => {
  beforeAll(async () => {
    await initDB();
  });

  it("placeholder — routes file should be importable", async () => {
    const mod = await import("../tournament-results.js");
    expect(mod.tournamentResultsRouter).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/tournament-results.test.ts`
Expected: FAIL — cannot import

**Step 3: Implement the router**

Create `server/src/routes/tournament-results.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import {
  getResults,
  createResults,
  updateResults,
  deleteResults,
  getTrophyCabinet,
} from "../services/tournament-results.js";
import { importResultsFromUrl } from "../services/results-import.js";

export const tournamentResultsRouter = Router();

// GET /api/events/:eventId/results
tournamentResultsRouter.get(
  "/events/:eventId/results",
  (req: Request, res: Response) => {
    const eventId = Number(req.params.eventId);
    const result = getResults(eventId);
    if (!result) {
      res.status(404).json({ error: "No results for this event" });
      return;
    }
    res.json(result);
  }
);

// POST /api/events/:eventId/results
tournamentResultsRouter.post(
  "/events/:eventId/results",
  (req: Request, res: Response) => {
    const eventId = Number(req.params.eventId);
    try {
      const result = createResults(eventId, req.body);
      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create results";
      res.status(400).json({ error: message });
    }
  }
);

// PUT /api/events/:eventId/results
tournamentResultsRouter.put(
  "/events/:eventId/results",
  (req: Request, res: Response) => {
    const eventId = Number(req.params.eventId);
    try {
      const result = updateResults(eventId, req.body);
      if (!result) {
        res.status(404).json({ error: "No results for this event" });
        return;
      }
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update results";
      res.status(400).json({ error: message });
    }
  }
);

// DELETE /api/events/:eventId/results
tournamentResultsRouter.delete(
  "/events/:eventId/results",
  (req: Request, res: Response) => {
    const eventId = Number(req.params.eventId);
    deleteResults(eventId);
    res.status(204).end();
  }
);

// POST /api/events/:eventId/results/import — LLM extraction (returns data, does NOT save)
tournamentResultsRouter.post(
  "/events/:eventId/results/import",
  async (req: Request, res: Response) => {
    const eventId = Number(req.params.eventId);
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }

    try {
      const imported = await importResultsFromUrl(eventId, url);
      res.json(imported);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      res.status(500).json({ error: message });
    }
  }
);

// GET /api/trophy-cabinet (public)
tournamentResultsRouter.get("/trophy-cabinet", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const entries = getTrophyCabinet(limit, offset);
  res.json(entries);
});
```

**Step 4: Register router in `server/src/index.ts`**

Add import (after the `teamsRouter` import):
```typescript
import { tournamentResultsRouter } from "./routes/tournament-results.js";
```

Add to the router registration section (after `app.use("/api", teamsRouter);`):
```typescript
app.use("/api", tournamentResultsRouter);
```

**Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/tournament-results.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/routes/tournament-results.ts server/src/routes/__tests__/tournament-results.test.ts server/src/index.ts && git commit -m "feat: add tournament results API routes"
```

---

### Task 5: Trophy Cabinet query in service

**Files:**
- Modify: `server/src/services/tournament-results.ts`
- Test: `server/src/services/__tests__/tournament-results.test.ts` (extend)

**Step 1: Write the failing test**

Add to `server/src/services/__tests__/tournament-results.test.ts`:

```typescript
import { getTrophyCabinet } from "../tournament-results.js";

describe("trophy cabinet", () => {
  beforeAll(async () => {
    await initDB();
    const db = getDB();
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Cup A', '2026-01-15')");
    const id1 = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    db.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams, achievements) VALUES (?, 1, 8, ?)",
      [id1, JSON.stringify([{ type: "1st_place", label: "1st Place" }])]
    );
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Cup B', '2026-03-10')");
    const id2 = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    db.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams, summary) VALUES (?, 3, 12, 'Good effort')",
      [id2]
    );
  });

  it("returns results ordered by date desc", () => {
    const results = getTrophyCabinet();
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].eventTitle).toBe("Cup B");
    expect(results[1].eventTitle).toBe("Cup A");
  });

  it("respects limit parameter", () => {
    const results = getTrophyCabinet(1);
    expect(results).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/tournament-results.test.ts`
Expected: FAIL — `getTrophyCabinet` not exported

**Step 3: Add `getTrophyCabinet` to service**

In `server/src/services/tournament-results.ts`, add:

```typescript
export interface TrophyCabinetEntry {
  id: number;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  eventType: string;
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  resultsUrl: string | null;
  achievements: Achievement[];
}

export function getTrophyCabinet(
  limit = 50,
  offset = 0
): TrophyCabinetEntry[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT tr.id, tr.eventId, e.title, e.date, e.type,
            tr.placement, tr.totalTeams, tr.summary, tr.resultsUrl, tr.achievements
     FROM tournament_results tr
     JOIN events e ON tr.eventId = e.id
     ORDER BY e.date DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  if (rows.length === 0) return [];

  return rows[0].values.map((row) => ({
    id: row[0] as number,
    eventId: row[1] as number,
    eventTitle: row[2] as string,
    eventDate: row[3] as string,
    eventType: row[4] as string,
    placement: row[5] as number | null,
    totalTeams: row[6] as number | null,
    summary: row[7] as string | null,
    resultsUrl: row[8] as string | null,
    achievements: JSON.parse((row[9] as string) || "[]"),
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/tournament-results.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/tournament-results.ts server/src/services/__tests__/tournament-results.test.ts && git commit -m "feat: add trophy cabinet query"
```

---

### Task 6: Update events router — include teamName in CRUD + results in GET

**Files:**
- Modify: `server/src/routes/events.ts`

**Step 1: Add teamName to POST and PUT, results to GET**

In `server/src/routes/events.ts`:

Add import at top:
```typescript
import { getResults } from "../services/tournament-results.js";
```

POST handler — add `teamName` to destructuring and INSERT:
- Add `teamName` to the destructured `req.body`
- Update INSERT SQL to include `teamName` column and `?` placeholder
- Add `teamName ?? null` to the values array

PUT handler — add `teamName`:
- Add `const teamName = req.body.teamName ?? current.teamName;`
- Update UPDATE SQL to include `teamName = ?`
- Add `teamName` to the values array (before `id`)

GET `/events/:id` handler — add results to response:
- After the `attendanceSummary` block, add: `const results = getResults(id);`
- Change response to: `res.json({ ...event, attendanceSummary, results });`

**Step 2: Run all server tests**

Run: `cd server && npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git restore --staged :/ && git add server/src/routes/events.ts && git commit -m "feat: add teamName to events CRUD and include results in detail"
```

---

### Task 7: Frontend — Results form on event detail page

**Files:**
- Create: `web/src/components/TournamentResultsForm.tsx`
- Modify: `web/src/app/events/[id]/EventDetailClient.tsx`

**Step 1: Create the TournamentResultsForm component**

Create `web/src/components/TournamentResultsForm.tsx` with:
- Props: `eventId: number; eventType: string; isCoach: boolean; initialResults: TournamentResult | null`
- View mode (when results exist and not editing): shows placement badge, summary, achievement badges, results URL link
- Edit mode (coach only): form with:
  - Placement (number input) / Total teams (number input)
  - Summary (textarea)
  - Achievements: predefined chips (1st Place, 2nd Place, 3rd Place, Fair Play, Best Player) that toggle on/off + text input with Add button for custom achievements
  - Results URL (text input) + "Import from URL" button
  - Import button calls `POST /api/events/${eventId}/results/import` with `{ url }`, shows loading spinner, pre-fills form on success, shows error on failure
  - Save button: calls `POST` (new) or `PUT` (existing) to `/api/events/${eventId}/results`
  - Delete button: calls `DELETE /api/events/${eventId}/results` with confirmation dialog
- Use emerald color scheme, rounded-lg borders, consistent with existing UI
- Placement badges: gold bg for 1st, silver for 2nd, bronze for 3rd, gray for others

**Step 2: Integrate into EventDetailClient**

In `web/src/app/events/[id]/EventDetailClient.tsx`:
- Add `results` field to the `EventDetail` interface (nullable)
- Import `TournamentResultsForm`
- After the coach attendance/teams sections, render:
  ```tsx
  {['tournament', 'match', 'friendly'].includes(event.type) && (
    <TournamentResultsForm
      eventId={event.id}
      eventType={event.type}
      isCoach={isCoach}
      initialResults={event.results ?? null}
    />
  )}
  ```

**Step 3: Build and verify**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git restore --staged :/ && git add web/src/components/TournamentResultsForm.tsx web/src/app/events/[id]/EventDetailClient.tsx && git commit -m "feat: add tournament results form to event detail page"
```

---

### Task 8: Frontend — Trophy Cabinet page

**Files:**
- Create: `web/src/app/trophies/page.tsx`
- Create: `web/src/app/trophies/layout.tsx`

**Step 1: Create the trophy cabinet page**

`web/src/app/trophies/layout.tsx`:
- Standard Next.js layout with `<h1>Trophy Cabinet</h1>` header

`web/src/app/trophies/page.tsx`:
- Client component that fetches `GET /api/trophy-cabinet` using `apiFetch`
- Loading skeleton while fetching
- Empty state: "No tournament results yet" message
- List view with each entry as a card:
  - Event title (linked to `/events/${eventId}`)
  - Date formatted nicely
  - Placement badge: gold background (#FFD700) for 1st, silver (#C0C0C0) for 2nd, bronze (#CD7F32) for 3rd, gray for others. Shows "Xth out of Y"
  - Achievement badges as colored pills
  - Summary text (first 100 chars with ellipsis if longer)
  - Results URL as external link if present
- Use existing card style: `rounded-lg border border-gray-200 p-4`

**Step 2: Build and verify**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git restore --staged :/ && git add web/src/app/trophies/page.tsx web/src/app/trophies/layout.tsx && git commit -m "feat: add trophy cabinet page"
```

---

### Task 9: Frontend — Dashboard trophy widget

**Files:**
- Create: `web/src/components/RecentTrophies.tsx`
- Modify: dashboard page (locate in `web/src/app/dashboard/page.tsx`)

**Step 1: Create the widget component**

`web/src/components/RecentTrophies.tsx`:
- Client component that fetches `GET /api/trophy-cabinet?limit=5`
- Returns `null` if no results (don't render empty widget)
- Compact card with header "Recent Trophies"
- Each entry: event title, date, mini placement badge, achievement icons
- "View all" link to `/trophies` at bottom
- Loading skeleton while fetching

**Step 2: Add widget to dashboard**

Import `RecentTrophies` and render it in the dashboard page layout.

**Step 3: Build and verify**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git restore --staged :/ && git add web/src/components/RecentTrophies.tsx web/src/app/dashboard/page.tsx && git commit -m "feat: add recent trophies widget to dashboard"
```

---

### Task 10: Full integration test + final verification

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: ALL PASS

**Step 2: Run frontend build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 3: Update RELEASE_NOTES.md and FEATURES.md**

Add to `RELEASE_NOTES.md`:
```markdown
## Version X.Y (Feb 28, 2026)

* Tournament results tracking — manually record placement, summary, and trophies after tournaments
* Import results from URL — paste a bracket/results URL and let AI pre-fill placement and summary
* Trophy cabinet — public page showing all tournament achievements chronologically
* Dashboard widget — latest trophies at a glance
* Team name field — set the official registered team name per tournament
```

**Step 4: Commit**

```bash
git restore --staged :/ && git add RELEASE_NOTES.md FEATURES.md && git commit -m "docs: update release notes and features for tournament results"
```
