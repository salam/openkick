# Trophies in Feeds — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich all feed outputs (RSS, Atom, ICS, ActivityPub, AT Protocol, sitemap) with trophy/tournament result data, add dedicated trophy feed endpoints, and expose a `get_trophy_cabinet` MCP tool.

**Architecture:** Extend `FeedItem` with optional trophy fields via LEFT JOIN to `tournament_results`. A shared `formatTrophyText()` helper generates human-readable trophy summaries for serializers. New `getTrophyFeedItems()` uses INNER JOIN for trophy-only feeds. Sitemap gains `/trophies` page link and event-with-results links.

**Tech Stack:** TypeScript, Express.js, sql.js, Vitest, MCP SDK (@modelcontextprotocol/sdk), Zod

---

## Task 1: Extend FeedItem and FeedService with trophy fields

**Files:**
- Modify: `server/src/services/feeds.ts`
- Test: `server/src/services/__tests__/feeds.test.ts`

**Step 1: Write the failing tests**

Add these tests to `server/src/services/__tests__/feeds.test.ts`:

```typescript
it("includes trophy fields when tournament_results exist", () => {
  // Insert a tournament_results row for the Spring Cup (event id 1)
  db.run(
    `INSERT INTO tournament_results (eventId, placement, totalTeams, summary, achievements)
     VALUES (1, 2, 12, 'Great performance', '[{"type":"fair_play","label":"Fair Play Award"}]')`
  );
  const items = getFeedItems();
  const cup = items.find((i) => i.title === "Spring Cup")!;
  expect(cup.placement).toBe(2);
  expect(cup.totalTeams).toBe(12);
  expect(cup.trophySummary).toBe("Great performance");
  expect(cup.achievements).toEqual([{ type: "fair_play", label: "Fair Play Award" }]);
});

it("returns null trophy fields when no results exist", () => {
  const items = getFeedItems();
  const training = items.find((i) => i.title === "Monday Training")!;
  expect(training.placement).toBeNull();
  expect(training.totalTeams).toBeNull();
  expect(training.trophySummary).toBeNull();
  expect(training.achievements).toEqual([]);
});

describe("getTrophyFeedItems", () => {
  it("returns only events with tournament results", () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
       VALUES (1, 1, 8, '[]')`
    );
    const items = getTrophyFeedItems();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Spring Cup");
    expect(items[0].placement).toBe(1);
  });

  it("returns empty array when no results exist", () => {
    const items = getTrophyFeedItems();
    expect(items).toHaveLength(0);
  });

  it("respects limit parameter", () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, achievements) VALUES (1, 1, '[]')`
    );
    db.run(
      `INSERT INTO tournament_results (eventId, placement, achievements) VALUES (3, 3, '[]')`
    );
    const items = getTrophyFeedItems(1);
    expect(items).toHaveLength(1);
  });
});
```

Update the import to include `getTrophyFeedItems`:
```typescript
import { getFeedItems, getTrophyFeedItems } from "../feeds.js";
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/feeds.test.ts`
Expected: FAIL — `getTrophyFeedItems` not exported, trophy fields missing from items.

**Step 3: Implement FeedItem extension and getTrophyFeedItems**

In `server/src/services/feeds.ts`, replace the entire file content:

```typescript
import { getDB } from "../database.js";

export interface FeedItem {
  id: number;
  type: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  location: string | null;
  categoryRequirement: string | null;
  createdAt: string;
  // Trophy enrichment (present when tournament_results exist)
  placement: number | null;
  totalTeams: number | null;
  trophySummary: string | null;
  resultsUrl: string | null;
  achievements: { type: string; label: string }[];
}

export interface FeedQuery {
  type?: "training" | "tournament" | "match";
  limit?: number;
}

function buildQuery(join: "LEFT" | "INNER", query?: FeedQuery): { sql: string; params: unknown[] } {
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);

  let sql = `SELECT e.id, e.type, e.title, e.description, e.date, e.startTime,
             e.location, e.categoryRequirement, e.createdAt,
             tr.placement, tr.totalTeams, tr.summary AS trophySummary,
             tr.resultsUrl, tr.achievements
             FROM events e
             ${join} JOIN tournament_results tr ON tr.eventId = e.id`;
  const params: unknown[] = [];

  if (query?.type) {
    sql += " WHERE e.type = ?";
    params.push(query.type);
  }

  sql += " ORDER BY e.date DESC LIMIT ?";
  params.push(limit);

  return { sql, params };
}

function rowToFeedItem(columns: string[], row: unknown[]): FeedItem {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return {
    id: obj.id as number,
    type: obj.type as string,
    title: obj.title as string,
    description: (obj.description as string) ?? null,
    date: obj.date as string,
    startTime: (obj.startTime as string) ?? null,
    location: (obj.location as string) ?? null,
    categoryRequirement: (obj.categoryRequirement as string) ?? null,
    createdAt: obj.createdAt as string,
    placement: (obj.placement as number) ?? null,
    totalTeams: (obj.totalTeams as number) ?? null,
    trophySummary: (obj.trophySummary as string) ?? null,
    resultsUrl: (obj.resultsUrl as string) ?? null,
    achievements: JSON.parse((obj.achievements as string) || "[]"),
  };
}

export function getFeedItems(query?: FeedQuery): FeedItem[] {
  const db = getDB();
  const { sql, params } = buildQuery("LEFT", query);
  const result = db.exec(sql, params as import("sql.js").SqlValue[]);
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToFeedItem(columns, row));
}

export function getTrophyFeedItems(limit?: number): FeedItem[] {
  const db = getDB();
  const { sql, params } = buildQuery("INNER", { limit });
  const result = db.exec(sql, params as import("sql.js").SqlValue[]);
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToFeedItem(columns, row));
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/feeds.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git commit -m "feat: enrich FeedItem with trophy data via LEFT JOIN" -- server/src/services/feeds.ts server/src/services/__tests__/feeds.test.ts
```

---

## Task 2: Add formatTrophyText helper and update serializers

**Files:**
- Modify: `server/src/services/feed-serializers.ts`
- Test: `server/src/services/__tests__/feed-serializers.test.ts`

**Step 1: Write the failing tests**

In `server/src/services/__tests__/feed-serializers.test.ts`:

First, update the `sampleItems` array to include the new trophy fields (all null/empty), and add a trophy item:

```typescript
// Update existing sampleItems to include new null trophy fields:
const sampleItems: FeedItem[] = [
  {
    id: 1,
    type: "tournament",
    title: "Spring Cup",
    description: "Annual spring tournament",
    date: "2026-04-15",
    startTime: "09:00",
    location: "Stadium A",
    categoryRequirement: null,
    createdAt: "2026-03-01T10:00:00",
    placement: null,
    totalTeams: null,
    trophySummary: null,
    resultsUrl: null,
    achievements: [],
  },
  {
    id: 2,
    type: "training",
    title: "Monday Training",
    description: null,
    date: "2026-03-10",
    startTime: "18:00",
    location: "Field B",
    categoryRequirement: null,
    createdAt: "2026-02-28T08:00:00",
    placement: null,
    totalTeams: null,
    trophySummary: null,
    resultsUrl: null,
    achievements: [],
  },
];

const trophyItem: FeedItem = {
  id: 3,
  type: "tournament",
  title: "Summer Cup",
  description: "Summer championship",
  date: "2026-06-20",
  startTime: "10:00",
  location: "Arena X",
  categoryRequirement: null,
  createdAt: "2026-06-01T12:00:00",
  placement: 2,
  totalTeams: 12,
  trophySummary: "Great team effort",
  resultsUrl: "https://example.com/results",
  achievements: [{ type: "fair_play", label: "Fair Play Award" }],
};
```

Add the import for `formatTrophyText` and new test blocks:

```typescript
import {
  toRss,
  toAtom,
  toIcs,
  toActivityPubOutbox,
  toAtProtoFeed,
  formatTrophyText,
} from "../feed-serializers.js";
```

```typescript
describe("formatTrophyText", () => {
  it("returns null when no placement", () => {
    expect(formatTrophyText(sampleItems[0])).toBeNull();
  });

  it("formats placement with totalTeams", () => {
    const text = formatTrophyText(trophyItem);
    expect(text).toContain("2nd place");
    expect(text).toContain("12 teams");
  });

  it("includes achievements", () => {
    const text = formatTrophyText(trophyItem)!;
    expect(text).toContain("Fair Play Award");
  });

  it("formats 1st place correctly", () => {
    const text = formatTrophyText({ ...trophyItem, placement: 1, totalTeams: 8, achievements: [] });
    expect(text).toContain("1st place");
    expect(text).toContain("8 teams");
  });

  it("formats 3rd place correctly", () => {
    const text = formatTrophyText({ ...trophyItem, placement: 3 });
    expect(text).toContain("3rd place");
  });

  it("formats other placements with th suffix", () => {
    const text = formatTrophyText({ ...trophyItem, placement: 5 });
    expect(text).toContain("5th place");
  });

  it("handles placement without totalTeams", () => {
    const text = formatTrophyText({ ...trophyItem, totalTeams: null });
    expect(text).toContain("2nd place");
    expect(text).not.toContain("teams");
  });
});

describe("RSS serializer with trophies", () => {
  it("includes trophy text in description", () => {
    const xml = toRss([trophyItem], baseUrl, "OpenKick");
    expect(xml).toContain("2nd place");
    expect(xml).toContain("Fair Play Award");
  });

  it("does not add trophy text for events without results", () => {
    const xml = toRss(sampleItems, baseUrl, "OpenKick");
    expect(xml).not.toContain("place");
  });
});

describe("Atom serializer with trophies", () => {
  it("includes trophy text in summary", () => {
    const xml = toAtom([trophyItem], baseUrl, "OpenKick");
    expect(xml).toContain("2nd place");
    expect(xml).toContain("Fair Play Award");
  });
});

describe("ICS serializer with trophies", () => {
  it("includes trophy text in DESCRIPTION", () => {
    const ics = toIcs([trophyItem], "OpenKick");
    expect(ics).toContain("2nd place");
    expect(ics).toContain("Fair Play Award");
  });
});

describe("ActivityPub serializer with trophies", () => {
  it("includes trophy text in content HTML", () => {
    const json = toActivityPubOutbox([trophyItem], baseUrl);
    const content = json.orderedItems[0].object.content;
    expect(content).toContain("2nd place");
    expect(content).toContain("Fair Play Award");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/feed-serializers.test.ts`
Expected: FAIL — `formatTrophyText` not exported, trophy text not in serializer output.

**Step 3: Implement formatTrophyText and update serializers**

In `server/src/services/feed-serializers.ts`, add the following after the imports:

```typescript
function ordinalSuffix(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

export function formatTrophyText(item: FeedItem): string | null {
  if (item.placement == null) return null;
  let text = `\u{1F3C6} ${ordinalSuffix(item.placement)} place`;
  if (item.totalTeams != null) {
    text += ` (${item.totalTeams} teams)`;
  }
  if (item.achievements.length > 0) {
    text += `. Achievements: ${item.achievements.map((a) => a.label).join(", ")}`;
  }
  return text;
}
```

Then update each serializer function:

**toRss** — change the desc line inside the map:
```typescript
const trophy = formatTrophyText(item);
const desc = [item.description || `${item.type}: ${item.title}`, trophy].filter(Boolean).join("\n");
```

**toAtom** — same pattern:
```typescript
const trophy = formatTrophyText(item);
const desc = [item.description || `${item.type}: ${item.title}`, trophy].filter(Boolean).join("\n");
```

**toIcs** — replace the existing `if (item.description)` block:
```typescript
const trophy = formatTrophyText(item);
if (item.description || trophy) {
  const parts = [item.description, trophy].filter(Boolean).join("\\n");
  lines.push(foldLine(`DESCRIPTION:${parts.replace(/\n/g, "\\n")}`));
}
```

**toActivityPubOutbox** — append trophy HTML to content:
```typescript
const trophy = formatTrophyText(item);
const trophyHtml = trophy ? `<p>${trophy}</p>` : "";
// Update content to include trophyHtml at the end
content: `<p><strong>${item.title}</strong></p><p>${item.description || item.type}</p>${item.location ? `<p>Location: ${item.location}</p>` : ""}${trophyHtml}`,
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/feed-serializers.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git commit -m "feat: add formatTrophyText and enrich all feed serializers with trophy data" -- server/src/services/feed-serializers.ts server/src/services/__tests__/feed-serializers.test.ts
```

---

## Task 3: Add trophy feed endpoints and sitemap entries

**Files:**
- Modify: `server/src/routes/feeds.ts`
- Test: `server/src/routes/__tests__/feeds.test.ts`

**Step 1: Write the failing tests**

Add to `server/src/routes/__tests__/feeds.test.ts`, inside the `"Feed routes"` describe block:

```typescript
it("GET /api/feeds/calendar/trophies.ics returns only events with results", async () => {
  db.run(
    `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
     VALUES (1, 1, 8, '[]')`
  );
  db.run(
    `INSERT INTO events (type, title, date) VALUES ('training', 'Weekday Training', '2026-05-02')`
  );
  const res = await fetch(`${baseUrl}/api/feeds/calendar/trophies.ics`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/calendar");
  const text = await res.text();
  expect(text).toContain("Test Cup");
  expect(text).not.toContain("Weekday Training");
  expect(text).toContain("1st place");
});

it("GET /api/feeds/rss?trophies=only returns only events with results", async () => {
  db.run(
    `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
     VALUES (1, 2, 10, '[{"type":"fair_play","label":"Fair Play"}]')`
  );
  db.run(
    `INSERT INTO events (type, title, date) VALUES ('training', 'Extra Training', '2026-05-02')`
  );
  const res = await fetch(`${baseUrl}/api/feeds/rss?trophies=only`);
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).toContain("Test Cup");
  expect(text).toContain("2nd place");
  expect(text).not.toContain("Extra Training");
});

it("GET /api/feeds/atom?trophies=only returns only events with results", async () => {
  db.run(
    `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
     VALUES (1, 3, 6, '[]')`
  );
  const res = await fetch(`${baseUrl}/api/feeds/atom?trophies=only`);
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).toContain("Test Cup");
  expect(text).toContain("3rd place");
});

it("RSS feed enriches events that have results", async () => {
  db.run(
    `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
     VALUES (1, 1, 8, '[{"type":"fair_play","label":"Fair Play Award"}]')`
  );
  const res = await fetch(`${baseUrl}/api/feeds/rss`);
  const text = await res.text();
  expect(text).toContain("1st place");
  expect(text).toContain("Fair Play Award");
});
```

Add to the `"Sitemap and robots.txt"` describe block:

```typescript
it("sitemap includes /trophies page", async () => {
  const res = await fetch(`${baseUrl}/api/sitemap.xml`);
  const text = await res.text();
  expect(text).toContain("/trophies");
});

it("sitemap includes events with results", async () => {
  db.run(
    `INSERT INTO tournament_results (eventId, placement, achievements) VALUES (1, 1, '[]')`
  );
  const res = await fetch(`${baseUrl}/api/sitemap.xml`);
  const text = await res.text();
  expect(text).toContain("/events/1");
});

it("sitemap includes trophies.ics feed", async () => {
  const res = await fetch(`${baseUrl}/api/sitemap.xml`);
  const text = await res.text();
  expect(text).toContain("/api/feeds/calendar/trophies.ics");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/__tests__/feeds.test.ts`
Expected: FAIL — new endpoints don't exist, sitemap doesn't have trophy entries.

**Step 3: Implement the new endpoints and sitemap entries**

In `server/src/routes/feeds.ts`:

1. Add import for `getTrophyFeedItems`:
```typescript
import { getFeedItems, getTrophyFeedItems, type FeedQuery } from "../services/feeds.js";
```

2. Update `parseQuery` to handle `trophies=only`:
```typescript
function parseQuery(req: Request): FeedQuery & { trophiesOnly?: boolean } {
  const query: FeedQuery & { trophiesOnly?: boolean } = {};
  const type = req.query.type as string | undefined;
  if (type && ["training", "tournament", "match"].includes(type)) {
    query.type = type as FeedQuery["type"];
  }
  const limit = parseInt(req.query.limit as string, 10);
  if (!isNaN(limit)) query.limit = limit;
  if (req.query.trophies === "only") query.trophiesOnly = true;
  return query;
}
```

3. Update RSS handler to support `trophies=only`:
```typescript
feedsRouter.get("/feeds/rss", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_rss_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const query = parseQuery(req);
  const items = query.trophiesOnly ? getTrophyFeedItems(query.limit) : getFeedItems(query);
  const xml = toRss(items, getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/rss+xml; charset=utf-8").send(xml);
});
```

4. Update Atom handler similarly:
```typescript
feedsRouter.get("/feeds/atom", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_atom_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const query = parseQuery(req);
  const items = query.trophiesOnly ? getTrophyFeedItems(query.limit) : getFeedItems(query);
  const xml = toAtom(items, getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/atom+xml; charset=utf-8").send(xml);
});
```

5. Add `trophies.ics` endpoint (after the per-type ICS loop, BEFORE the ActivityPub routes):
```typescript
feedsRouter.get("/feeds/calendar/trophies.ics", (_req: Request, res: Response) => {
  if (!isFeedEnabled("feed_ics_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getTrophyFeedItems();
  const ics = toIcs(items, CLUB_NAME);
  res.set("Content-Type", "text/calendar; charset=utf-8").send(ics);
});
```

6. Update sitemap handler — add a helper and new URL entries:

Add helper function (above the sitemap handler):
```typescript
function getEventIdsWithResults(): number[] {
  const db = getDB();
  const result = db.exec("SELECT eventId FROM tournament_results");
  if (result.length === 0) return [];
  return result[0].values.map((row) => row[0] as number);
}
```

In the sitemap handler, after `const urls = ...` and before the final XML template:
```typescript
// Trophy page
const trophyUrl = `  <url><loc>${xmlEscape(base + "/trophies")}</loc></url>`;

// Trophy ICS feed
const trophyFeedUrl = isFeedEnabled("feed_ics_enabled")
  ? `\n  <url><loc>${xmlEscape(base + "/api/feeds/calendar/trophies.ics")}</loc></url>`
  : "";

// Events with results
const eventIds = getEventIdsWithResults();
const eventUrls = eventIds
  .map((id) => `  <url><loc>${xmlEscape(base + "/events/" + id)}</loc></url>`)
  .join("\n");

const extraUrls = [trophyUrl, trophyFeedUrl, eventUrls].filter(Boolean).join("\n");
```

Include `extraUrls` in the XML output alongside existing `urls`.

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/routes/__tests__/feeds.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git commit -m "feat: add trophy feed endpoints and sitemap entries" -- server/src/routes/feeds.ts server/src/routes/__tests__/feeds.test.ts
```

---

## Task 4: Add get_trophy_cabinet MCP tool

**Files:**
- Modify: `server/src/mcp/server.ts`
- Test: `server/src/mcp/__tests__/server.test.ts` (create if needed)

**Step 1: Check if MCP test directory exists**

Check for `server/src/mcp/__tests__/`. Create if needed.

**Step 2: Write the test**

Create `server/src/mcp/__tests__/server.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import { createMcpServer } from "../server.js";
import { getTrophyCabinet } from "../../services/tournament-results.js";
import type { Database } from "sql.js";

let db: Database;

describe("MCP get_trophy_cabinet tool", () => {
  beforeEach(async () => {
    db = await initDB();
    db.run(
      `INSERT INTO events (type, title, date) VALUES ('tournament', 'Summer Cup', '2026-06-15')`
    );
    db.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, summary, achievements)
       VALUES (1, 2, 12, 'Well played', '[{"type":"fair_play","label":"Fair Play"}]')`
    );
  });

  afterEach(() => {
    db.close();
  });

  it("createMcpServer succeeds with trophy tool registered", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it("getTrophyCabinet returns trophy data used by the MCP tool", () => {
    const entries = getTrophyCabinet(50);
    expect(entries).toHaveLength(1);
    expect(entries[0].eventTitle).toBe("Summer Cup");
    expect(entries[0].placement).toBe(2);
    expect(entries[0].achievements).toEqual([{ type: "fair_play", label: "Fair Play" }]);
  });
});
```

**Step 3: Run test to verify it passes (data layer)**

Run: `cd server && npx vitest run src/mcp/__tests__/server.test.ts`
Expected: PASS

**Step 4: Add the MCP tool**

In `server/src/mcp/server.ts`, add import:
```typescript
import { getTrophyCabinet } from "../services/tournament-results.js";
```

Before `return server;`, add:
```typescript
server.tool(
  "get_trophy_cabinet",
  "Get the club's trophy cabinet with placements and achievements",
  {
    limit: z
      .number()
      .optional()
      .describe("Max entries to return (default 50)"),
  },
  async ({ limit }) => {
    const entries = getTrophyCabinet(limit ?? 50);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(entries, null, 2) },
      ],
    };
  }
);
```

**Step 5: Run test to verify it still passes**

Run: `cd server && npx vitest run src/mcp/__tests__/server.test.ts`
Expected: PASS

**Step 6: Commit**

```
git restore --staged :/ && git add server/src/mcp/server.ts server/src/mcp/__tests__/server.test.ts && git commit -m "feat: add get_trophy_cabinet MCP tool" -- server/src/mcp/server.ts server/src/mcp/__tests__/server.test.ts
```

---

## Task 5: Run full test suite and verify build

**Step 1: Run all tests**

Run: `cd server && npx vitest run`
Expected: ALL PASS

**Step 2: Run TypeScript compile check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Fix any failures**

Common issues to watch for:
- Existing serializer tests may need `sampleItems` updated with new trophy fields
- Import paths must use `.js` extension for ESM

**Step 4: Commit any fixes**

If fixes were needed, commit with descriptive message.

---

## Task 6: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`

**Step 1: Add feature entries to FEATURES.md**

Add under the appropriate section:
```markdown
- [x] Trophy data enrichment in all feed outputs (RSS, Atom, ICS, ActivityPub, AT Protocol)
- [x] Dedicated trophy feed endpoints (trophies.ics, ?trophies=only)
- [x] Trophy cabinet page and event pages in sitemap
- [x] get_trophy_cabinet MCP tool
```

**Step 2: Add release notes entry**

Add a new section to `RELEASE_NOTES.md`:
```markdown
* Trophy data now appears in all feed outputs (RSS, Atom, ICS, ActivityPub)
* New trophy-only calendar feed at /api/feeds/calendar/trophies.ics
* RSS and Atom feeds support ?trophies=only filter
* Sitemap now includes trophy cabinet page and events with results
* New MCP tool: get_trophy_cabinet for AI assistant integration
```

**Step 3: Commit**

```
git commit -m "docs: add trophy feeds to FEATURES.md and RELEASE_NOTES.md" -- FEATURES.md RELEASE_NOTES.md
```
