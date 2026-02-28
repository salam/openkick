# Public Feeds & Subscriptions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add RSS 2.0, Atom 1.0, ActivityPub, AT Protocol, and ICS feeds for public event data, with admin toggles, sitemap, robots.txt, and a homepage subscribe widget.

**Architecture:** Unified FeedService queries events from SQLite and returns normalized FeedItem arrays. Thin route handlers call the service and serialize to each format. Settings keys control which feeds are active. Frontend adds a collapsible SubscribeCard on the homepage and feed toggles on the settings page.

**Tech Stack:** Express.js, sql.js, Next.js 15, React 19, TailwindCSS 4, Vitest

**Design doc:** `docs/plans/2026-02-28-public-feeds-design.md`

---

### Task 1: Feed Settings Defaults

**Files:**
- Modify: `server/src/database.ts:119-123` (DEFAULT_SETTINGS)

**Step 1: Add feed setting defaults**

In `server/src/database.ts`, add these keys to `DEFAULT_SETTINGS` (line 119):

```ts
const DEFAULT_SETTINGS: Record<string, string> = {
  llm_provider: "openai",
  bot_language: "de",
  waha_url: "http://localhost:3008",
  feeds_enabled: "true",
  feed_rss_enabled: "true",
  feed_atom_enabled: "true",
  feed_activitypub_enabled: "true",
  feed_atprotocol_enabled: "true",
  feed_ics_enabled: "true",
  feed_sitemap_enabled: "true",
};
```

**Step 2: Run existing tests to verify nothing broke**

Run: `cd server && npx vitest run`
Expected: All 191+ tests pass

**Step 3: Commit**

```
git commit -m "feat: add default feed settings to database" -- server/src/database.ts
```

---

### Task 2: FeedService - Data Layer

**Files:**
- Create: `server/src/services/feeds.ts`
- Create: `server/src/services/__tests__/feeds.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/feeds.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import { getFeedItems } from "../feeds.js";
import type { Database } from "sql.js";

let db: Database;

describe("FeedService", () => {
  beforeEach(async () => {
    db = await initDB();
    db.run(
      `INSERT INTO events (type, title, description, date, startTime, location)
       VALUES ('tournament', 'Spring Cup', 'Annual spring tournament', '2026-04-15', '09:00', 'Stadium A')`
    );
    db.run(
      `INSERT INTO events (type, title, date, startTime, location)
       VALUES ('training', 'Monday Training', '2026-03-10', '18:00', 'Field B')`
    );
    db.run(
      `INSERT INTO events (type, title, date, location)
       VALUES ('match', 'League Match', '2025-11-20', 'Arena C')`
    );
  });

  afterEach(() => {
    db.close();
  });

  it("returns all events ordered by date descending", () => {
    const items = getFeedItems();
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe("Spring Cup");
    expect(items[2].title).toBe("League Match");
  });

  it("filters by event type", () => {
    const items = getFeedItems({ type: "tournament" });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Spring Cup");
  });

  it("respects limit parameter", () => {
    const items = getFeedItems({ limit: 2 });
    expect(items).toHaveLength(2);
  });

  it("caps limit at 200", () => {
    const items = getFeedItems({ limit: 999 });
    expect(items.length).toBeLessThanOrEqual(200);
  });

  it("does not expose PII fields", () => {
    const items = getFeedItems();
    for (const item of items) {
      expect(item).not.toHaveProperty("createdBy");
      expect(item).not.toHaveProperty("attachmentPath");
      expect(item).not.toHaveProperty("sourceUrl");
    }
  });

  it("includes all expected public fields", () => {
    const items = getFeedItems();
    const item = items[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("type");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("date");
    expect(item).toHaveProperty("location");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/feeds.test.ts`
Expected: FAIL - module not found

**Step 3: Write the FeedService**

Create `server/src/services/feeds.ts`:

```ts
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
}

export interface FeedQuery {
  type?: "training" | "tournament" | "match";
  limit?: number;
}

export function getFeedItems(query?: FeedQuery): FeedItem[] {
  const db = getDB();
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);

  let sql = `SELECT id, type, title, description, date, startTime, location,
             categoryRequirement, createdAt FROM events`;
  const params: unknown[] = [];

  if (query?.type) {
    sql += " WHERE type = ?";
    params.push(query.type);
  }

  sql += " ORDER BY date DESC LIMIT ?";
  params.push(limit);

  const result = db.exec(sql, params as import("sql.js").SqlValue[]);
  if (result.length === 0) return [];

  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as unknown as FeedItem;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/feeds.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```
git restore --staged :/ && git add "server/src/services/feeds.ts" "server/src/services/__tests__/feeds.test.ts" && git commit -m "feat: add FeedService for public event data" -- server/src/services/feeds.ts server/src/services/__tests__/feeds.test.ts
```

---

### Task 3: XML Escape Utility

**Files:**
- Create: `server/src/utils/xml.ts`
- Create: `server/src/utils/__tests__/xml.test.ts`

**Step 1: Write the failing test**

Create `server/src/utils/__tests__/xml.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { xmlEscape } from "../xml.js";

describe("xmlEscape", () => {
  it("escapes ampersands", () => {
    expect(xmlEscape("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(xmlEscape("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes quotes", () => {
    expect(xmlEscape('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes apostrophes", () => {
    expect(xmlEscape("it's")).toBe("it&apos;s");
  });

  it("handles empty string", () => {
    expect(xmlEscape("")).toBe("");
  });

  it("handles null/undefined gracefully", () => {
    expect(xmlEscape(null as unknown as string)).toBe("");
    expect(xmlEscape(undefined as unknown as string)).toBe("");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/utils/__tests__/xml.test.ts`
Expected: FAIL

**Step 3: Implement xmlEscape**

Create `server/src/utils/xml.ts`:

```ts
export function xmlEscape(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/utils/__tests__/xml.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```
git restore --staged :/ && git add "server/src/utils/xml.ts" "server/src/utils/__tests__/xml.test.ts" && git commit -m "feat: add xmlEscape utility" -- server/src/utils/xml.ts server/src/utils/__tests__/xml.test.ts
```

---

### Task 4: Feed Serializers

**Files:**
- Create: `server/src/services/feed-serializers.ts`
- Create: `server/src/services/__tests__/feed-serializers.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/feed-serializers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toRss,
  toAtom,
  toIcs,
  toActivityPubOutbox,
  toAtProtoFeed,
} from "../feed-serializers.js";
import type { FeedItem } from "../feeds.js";

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
  },
];

const baseUrl = "https://club.example.com";

describe("RSS serializer", () => {
  it("produces valid RSS 2.0 XML", () => {
    const xml = toRss(sampleItems, baseUrl, "OpenKick");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<rss");
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<title>OpenKick</title>");
    expect(xml).toContain("<item>");
    expect(xml).toContain("<title>Spring Cup</title>");
  });

  it("escapes special characters in XML", () => {
    const items: FeedItem[] = [{
      ...sampleItems[0],
      title: 'Match A & B <cup>',
    }];
    const xml = toRss(items, baseUrl, "OpenKick");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;cup&gt;");
  });
});

describe("Atom serializer", () => {
  it("produces valid Atom 1.0 XML", () => {
    const xml = toAtom(sampleItems, baseUrl, "OpenKick");
    expect(xml).toContain("<feed");
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain("<entry>");
    expect(xml).toContain("<title>Spring Cup</title>");
  });
});

describe("ICS serializer", () => {
  it("produces valid iCalendar output", () => {
    const ics = toIcs(sampleItems, "OpenKick");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Spring Cup");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("sets correct DTSTART for events with time", () => {
    const ics = toIcs(sampleItems, "OpenKick");
    expect(ics).toContain("DTSTART:20260415T090000");
  });

  it("sets all-day DTSTART for events without time", () => {
    const items: FeedItem[] = [{
      ...sampleItems[0],
      startTime: null,
    }];
    const ics = toIcs(items, "OpenKick");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260415");
  });
});

describe("ActivityPub outbox serializer", () => {
  it("produces OrderedCollection", () => {
    const json = toActivityPubOutbox(sampleItems, baseUrl);
    expect(json.type).toBe("OrderedCollection");
    expect(json.totalItems).toBe(2);
    expect(json.orderedItems).toHaveLength(2);
    expect(json.orderedItems[0].type).toBe("Create");
    expect(json.orderedItems[0].object.type).toBe("Note");
  });
});

describe("AT Protocol feed serializer", () => {
  it("produces feed skeleton", () => {
    const json = toAtProtoFeed(sampleItems, baseUrl);
    expect(json.feed).toHaveLength(2);
    expect(json.feed[0]).toHaveProperty("post");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/feed-serializers.test.ts`
Expected: FAIL - module not found

**Step 3: Implement all serializers**

Create `server/src/services/feed-serializers.ts`:

```ts
import { xmlEscape } from "../utils/xml.js";
import type { FeedItem } from "./feeds.js";

function toRfc822(dateStr: string, timeStr?: string | null): string {
  const d = timeStr
    ? new Date(`${dateStr}T${timeStr}:00`)
    : new Date(`${dateStr}T00:00:00`);
  return d.toUTCString();
}

function toIso(dateStr: string, timeStr?: string | null): string {
  const d = timeStr
    ? new Date(`${dateStr}T${timeStr}:00`)
    : new Date(`${dateStr}T00:00:00`);
  return d.toISOString();
}

export function toRss(items: FeedItem[], baseUrl: string, clubName: string): string {
  const itemsXml = items
    .map((item) => {
      const link = `${baseUrl}/events/${item.id}`;
      const desc = item.description || `${item.type}: ${item.title}`;
      return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(link)}</link>
      <description>${xmlEscape(desc)}</description>
      <pubDate>${toRfc822(item.date, item.startTime)}</pubDate>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(clubName)}</title>
    <link>${xmlEscape(baseUrl)}</link>
    <description>Events and results from ${xmlEscape(clubName)}</description>
    <language>de</language>
${itemsXml}
  </channel>
</rss>`;
}

export function toAtom(items: FeedItem[], baseUrl: string, clubName: string): string {
  const entriesXml = items
    .map((item) => {
      const link = `${baseUrl}/events/${item.id}`;
      const desc = item.description || `${item.type}: ${item.title}`;
      return `  <entry>
    <title>${xmlEscape(item.title)}</title>
    <link href="${xmlEscape(link)}" />
    <id>${xmlEscape(link)}</id>
    <updated>${toIso(item.date, item.startTime)}</updated>
    <summary>${xmlEscape(desc)}</summary>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xmlEscape(clubName)}</title>
  <link href="${xmlEscape(baseUrl)}" />
  <id>${xmlEscape(baseUrl)}/feeds/atom</id>
  <updated>${items.length > 0 ? toIso(items[0].date, items[0].startTime) : new Date().toISOString()}</updated>
${entriesXml}
</feed>`;
}

function icsDate(dateStr: string, timeStr?: string | null): string {
  if (!timeStr) {
    return `DTSTART;VALUE=DATE:${dateStr.replace(/-/g, "")}`;
  }
  const compact = `${dateStr.replace(/-/g, "")}T${timeStr.replace(/:/g, "")}00`;
  return `DTSTART:${compact}`;
}

function foldLine(line: string): string {
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    result.push(remaining.substring(0, 75));
    remaining = " " + remaining.substring(75);
  }
  result.push(remaining);
  return result.join("\r\n");
}

export function toIcs(items: FeedItem[], clubName: string): string {
  const events = items
    .map((item) => {
      const lines = [
        "BEGIN:VEVENT",
        `UID:event-${item.id}@openkick`,
        icsDate(item.date, item.startTime),
        foldLine(`SUMMARY:${item.title}`),
      ];
      if (item.description) {
        lines.push(foldLine(`DESCRIPTION:${item.description.replace(/\n/g, "\\n")}`));
      }
      if (item.location) {
        lines.push(foldLine(`LOCATION:${item.location}`));
      }
      lines.push("END:VEVENT");
      return lines.join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${clubName}//OpenKick//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${clubName}`,
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function toActivityPubOutbox(
  items: FeedItem[],
  baseUrl: string,
): {
  "@context": string;
  type: string;
  totalItems: number;
  orderedItems: { type: string; actor: string; published: string; object: { type: string; id: string; content: string; url: string; published: string; attributedTo: string } }[];
} {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "OrderedCollection",
    totalItems: items.length,
    orderedItems: items.map((item) => ({
      type: "Create",
      actor: `${baseUrl}/api/feeds/activitypub/actor`,
      published: toIso(item.date, item.startTime),
      object: {
        type: "Note",
        id: `${baseUrl}/events/${item.id}`,
        content: `<p><strong>${item.title}</strong></p><p>${item.description || item.type}</p>${item.location ? `<p>Location: ${item.location}</p>` : ""}`,
        url: `${baseUrl}/events/${item.id}`,
        published: toIso(item.date, item.startTime),
        attributedTo: `${baseUrl}/api/feeds/activitypub/actor`,
      },
    })),
  };
}

export function toActivityPubActor(baseUrl: string, clubName: string) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Organization",
    id: `${baseUrl}/api/feeds/activitypub/actor`,
    name: clubName,
    preferredUsername: "club",
    summary: `Events and results from ${clubName}`,
    url: baseUrl,
    outbox: `${baseUrl}/api/feeds/activitypub/outbox`,
  };
}

export function toAtProtoFeed(
  items: FeedItem[],
  baseUrl: string,
): { feed: { post: string }[] } {
  return {
    feed: items.map((item) => ({
      post: `at://${baseUrl.replace(/^https?:\/\//, "")}/app.bsky.feed.post/event-${item.id}`,
    })),
  };
}

export function toAtProtoDid(baseUrl: string) {
  const host = baseUrl.replace(/^https?:\/\//, "");
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `did:web:${host}`,
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `${baseUrl}/api/feeds/atprotocol`,
      },
    ],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/feed-serializers.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
git restore --staged :/ && git add "server/src/services/feed-serializers.ts" "server/src/services/__tests__/feed-serializers.test.ts" && git commit -m "feat: add feed serializers (RSS, Atom, ICS, ActivityPub, AT Protocol)" -- server/src/services/feed-serializers.ts server/src/services/__tests__/feed-serializers.test.ts
```

---

### Task 5: Feed Routes

**Files:**
- Create: `server/src/routes/feeds.ts`
- Create: `server/src/routes/__tests__/feeds.test.ts`
- Modify: `server/src/index.ts:19-42` (import + mount)

**Step 1: Write the failing test**

Create `server/src/routes/__tests__/feeds.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { feedsRouter } from "../feeds.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  db.run(
    `INSERT INTO events (type, title, date, startTime, location)
     VALUES ('tournament', 'Test Cup', '2026-05-01', '10:00', 'Field A')`
  );
  const app = express();
  app.use(express.json());
  app.use("/api", feedsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  db.close();
}

describe("Feed routes", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /api/feeds/rss returns RSS XML", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/rss`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const text = await res.text();
    expect(text).toContain("<rss");
    expect(text).toContain("Test Cup");
  });

  it("GET /api/feeds/atom returns Atom XML", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/atom`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/atom+xml");
    const text = await res.text();
    expect(text).toContain("<feed");
  });

  it("GET /api/feeds/calendar.ics returns ICS", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/calendar.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("Test Cup");
  });

  it("GET /api/feeds/calendar/tournaments.ics filters by type", async () => {
    db.run(
      `INSERT INTO events (type, title, date) VALUES ('training', 'Weekday Training', '2026-05-02')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/calendar/tournaments.ics`);
    const text = await res.text();
    expect(text).toContain("Test Cup");
    expect(text).not.toContain("Weekday Training");
  });

  it("GET /api/feeds/activitypub/actor returns actor JSON", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/activitypub/actor`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe("Organization");
  });

  it("GET /api/feeds/activitypub/outbox returns OrderedCollection", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/activitypub/outbox`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe("OrderedCollection");
    expect(json.totalItems).toBeGreaterThan(0);
  });

  it("GET /api/feeds/atprotocol/feed returns feed skeleton", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/atprotocol/feed`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.feed).toHaveLength(1);
  });

  it("returns 404 when feed is disabled", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('feed_rss_enabled', 'false')");
    const res = await fetch(`${baseUrl}/api/feeds/rss`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when master toggle is off", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('feeds_enabled', 'false')");
    const res = await fetch(`${baseUrl}/api/feeds/rss`);
    expect(res.status).toBe(404);
  });

  it("supports ?type query param on RSS", async () => {
    db.run(
      `INSERT INTO events (type, title, date) VALUES ('training', 'Extra Training', '2026-05-02')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/rss?type=training`);
    const text = await res.text();
    expect(text).toContain("Extra Training");
    expect(text).not.toContain("Test Cup");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/feeds.test.ts`
Expected: FAIL

**Step 3: Implement feed routes**

Create `server/src/routes/feeds.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { getFeedItems, type FeedQuery } from "../services/feeds.js";
import { xmlEscape } from "../utils/xml.js";
import {
  toRss,
  toAtom,
  toIcs,
  toActivityPubOutbox,
  toActivityPubActor,
  toAtProtoFeed,
  toAtProtoDid,
} from "../services/feed-serializers.js";

export const feedsRouter = Router();
export const wellKnownRouter = Router();

const CLUB_NAME = "OpenKick";

function getSetting(key: string): string | null {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

function isFeedEnabled(feedKey: string): boolean {
  const master = getSetting("feeds_enabled");
  if (master === "false") return false;
  const specific = getSetting(feedKey);
  return specific !== "false";
}

function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function parseQuery(req: Request): FeedQuery {
  const query: FeedQuery = {};
  const type = req.query.type as string | undefined;
  if (type && ["training", "tournament", "match"].includes(type)) {
    query.type = type as FeedQuery["type"];
  }
  const limit = parseInt(req.query.limit as string, 10);
  if (!isNaN(limit)) query.limit = limit;
  return query;
}

// RSS 2.0
feedsRouter.get("/feeds/rss", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_rss_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const xml = toRss(items, getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/rss+xml; charset=utf-8").send(xml);
});

// Atom 1.0
feedsRouter.get("/feeds/atom", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_atom_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const xml = toAtom(items, getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/atom+xml; charset=utf-8").send(xml);
});

// ICS - combined
feedsRouter.get("/feeds/calendar.ics", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_ics_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const ics = toIcs(items, CLUB_NAME);
  res.set("Content-Type", "text/calendar; charset=utf-8").send(ics);
});

// ICS - per type
for (const eventType of ["tournaments", "matches", "trainings"] as const) {
  const singular = eventType.replace(/s$/, "") as FeedQuery["type"];
  feedsRouter.get(`/feeds/calendar/${eventType}.ics`, (_req: Request, res: Response) => {
    if (!isFeedEnabled("feed_ics_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
    const items = getFeedItems({ type: singular });
    const ics = toIcs(items, CLUB_NAME);
    res.set("Content-Type", "text/calendar; charset=utf-8").send(ics);
  });
}

// ActivityPub actor
feedsRouter.get("/feeds/activitypub/actor", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_activitypub_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const actor = toActivityPubActor(getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/activity+json; charset=utf-8").json(actor);
});

// ActivityPub outbox
feedsRouter.get("/feeds/activitypub/outbox", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_activitypub_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const outbox = toActivityPubOutbox(items, getBaseUrl(req));
  res.set("Content-Type", "application/activity+json; charset=utf-8").json(outbox);
});

// AT Protocol feed
feedsRouter.get("/feeds/atprotocol/feed", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_atprotocol_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const feed = toAtProtoFeed(items, getBaseUrl(req));
  res.json(feed);
});

// Dynamic sitemap
feedsRouter.get("/sitemap.xml", (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const feedEntries: { path: string; settingKey: string }[] = [
    { path: "/api/feeds/rss", settingKey: "feed_rss_enabled" },
    { path: "/api/feeds/atom", settingKey: "feed_atom_enabled" },
    { path: "/api/feeds/calendar.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/calendar/tournaments.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/calendar/matches.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/calendar/trainings.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/activitypub/actor", settingKey: "feed_activitypub_enabled" },
    { path: "/api/feeds/activitypub/outbox", settingKey: "feed_activitypub_enabled" },
    { path: "/api/feeds/atprotocol/feed", settingKey: "feed_atprotocol_enabled" },
  ];

  const urls = feedEntries
    .filter((e) => isFeedEnabled(e.settingKey))
    .map((e) => `  <url><loc>${xmlEscape(base + e.path)}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${xmlEscape(base)}</loc></url>
${urls}
</urlset>`;

  res.set("Content-Type", "application/xml; charset=utf-8").send(xml);
});

// WebFinger (ActivityPub discovery)
wellKnownRouter.get("/.well-known/webfinger", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_activitypub_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const base = getBaseUrl(req);
  const host = req.get("host") || "localhost";
  res.json({
    subject: `acct:club@${host}`,
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `${base}/api/feeds/activitypub/actor`,
      },
    ],
  });
});

// DID document (AT Protocol discovery)
wellKnownRouter.get("/.well-known/did.json", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_atprotocol_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const did = toAtProtoDid(getBaseUrl(req));
  res.json(did);
});

// Dynamic robots.txt
wellKnownRouter.get("/robots.txt", (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const text = `User-agent: *
Allow: /api/feeds/
Allow: /api/sitemap.xml
Disallow: /api/
Disallow: /dashboard/
Disallow: /settings/

Sitemap: ${base}/api/sitemap.xml
`;
  res.set("Content-Type", "text/plain; charset=utf-8").send(text);
});
```

**Step 4: Mount routers in index.ts**

In `server/src/index.ts`, add import (after line 19):

```ts
import { feedsRouter, wellKnownRouter } from "./routes/feeds.js";
```

Add route mounts (after line 42):

```ts
app.use(wellKnownRouter);
app.use("/api", feedsRouter);
```

**Step 5: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/feeds.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```
git restore --staged :/ && git add "server/src/routes/feeds.ts" "server/src/routes/__tests__/feeds.test.ts" "server/src/index.ts" && git commit -m "feat: add feed routes, well-known endpoints, sitemap, robots.txt" -- server/src/routes/feeds.ts server/src/routes/__tests__/feeds.test.ts server/src/index.ts
```

---

### Task 6: Well-Known & Sitemap Route Tests

**Files:**
- Modify: `server/src/routes/__tests__/feeds.test.ts` (extend with well-known + sitemap tests)

**Step 1: Add additional test cases**

Append to `server/src/routes/__tests__/feeds.test.ts`. The test app setup needs to also mount `wellKnownRouter`:

Update the `createTestApp` function to also mount `wellKnownRouter`:

```ts
import { feedsRouter, wellKnownRouter } from "../feeds.js";

// In createTestApp:
app.use(wellKnownRouter);
app.use("/api", feedsRouter);
```

Add new describe blocks:

```ts
describe("Well-known endpoints", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /.well-known/webfinger returns actor link", async () => {
    const res = await fetch(
      `${baseUrl}/.well-known/webfinger?resource=acct:club@localhost`
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.links).toBeDefined();
    expect(json.links[0].type).toBe("application/activity+json");
  });

  it("GET /.well-known/did.json returns DID document", async () => {
    const res = await fetch(`${baseUrl}/.well-known/did.json`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toContain("did:web:");
  });
});

describe("Sitemap and robots.txt", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /api/sitemap.xml returns XML sitemap", async () => {
    const res = await fetch(`${baseUrl}/api/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const text = await res.text();
    expect(text).toContain("<urlset");
    expect(text).toContain("/api/feeds/rss");
  });

  it("sitemap omits disabled feeds", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('feed_rss_enabled', 'false')");
    const res = await fetch(`${baseUrl}/api/sitemap.xml`);
    const text = await res.text();
    expect(text).not.toContain("/api/feeds/rss");
    expect(text).toContain("/api/feeds/atom");
  });

  it("GET /robots.txt returns robots file", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Sitemap:");
  });
});
```

**Step 2: Run all feed tests**

Run: `cd server && npx vitest run src/routes/__tests__/feeds.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```
git commit -m "test: add well-known and sitemap route tests" -- server/src/routes/__tests__/feeds.test.ts
```

---

### Task 7: Frontend - SubscribeCard Component

**Files:**
- Create: `web/src/components/SubscribeCard.tsx`
- Modify: `web/src/app/page.tsx`

**Step 1: Create the component**

Create `web/src/components/SubscribeCard.tsx`:

```tsx
'use client';

import { useState } from 'react';

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function FeedUrl({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="ml-2 text-xs text-gray-400 break-all">{url}</span>
      </div>
      <CopyButton url={url} />
    </div>
  );
}

export default function SubscribeCard() {
  const [open, setOpen] = useState(false);
  const base = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          Subscribe to updates
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-5 border-t border-gray-100 px-5 pb-5 pt-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Calendar
            </h3>
            <div className="space-y-2">
              <FeedUrl label="All events" url={`${base}/api/feeds/calendar.ics`} />
              <FeedUrl label="Tournaments" url={`${base}/api/feeds/calendar/tournaments.ics`} />
              <FeedUrl label="Matches" url={`${base}/api/feeds/calendar/matches.ics`} />
              <FeedUrl label="Trainings" url={`${base}/api/feeds/calendar/trainings.ics`} />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Copy a URL and paste it as a calendar subscription in Google Calendar, Apple Calendar, or Outlook.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              RSS / Atom
            </h3>
            <div className="space-y-2">
              <FeedUrl label="RSS 2.0" url={`${base}/api/feeds/rss`} />
              <FeedUrl label="Atom" url={`${base}/api/feeds/atom`} />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Use with any RSS reader (Feedly, Thunderbird, NetNewsWire, etc.).
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Social
            </h3>
            <div className="space-y-2">
              <div className="rounded border border-gray-200 px-3 py-2">
                <span className="text-sm font-medium text-gray-700">Mastodon / Fediverse</span>
                <span className="ml-2 text-xs text-gray-400">
                  Search for @club@{typeof window !== 'undefined' ? window.location.hostname : 'your-domain'}
                </span>
              </div>
              <div className="rounded border border-gray-200 px-3 py-2">
                <span className="text-sm font-medium text-gray-700">Bluesky</span>
                <span className="ml-2 text-xs text-gray-400">
                  Feed available via AT Protocol
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add SubscribeCard to homepage**

Replace `web/src/app/page.tsx` with:

```tsx
import Link from 'next/link';
import SubscribeCard from '@/components/SubscribeCard';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">OpenKick</h1>
      <p className="text-lg text-gray-600">Youth Football Management</p>

      <div className="flex gap-4">
        <Link
          href="/login/"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Login
        </Link>
        <Link
          href="/dashboard/"
          className="rounded-lg border border-gray-300 px-6 py-3 hover:bg-gray-50"
        >
          Dashboard
        </Link>
      </div>

      <SubscribeCard />
    </main>
  );
}
```

**Step 3: Verify build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```
git restore --staged :/ && git add "web/src/components/SubscribeCard.tsx" "web/src/app/page.tsx" && git commit -m "feat: add subscribe card widget on homepage" -- web/src/components/SubscribeCard.tsx web/src/app/page.tsx
```

---

### Task 8: Frontend - Feed Toggles on Settings Page

**Files:**
- Modify: `web/src/app/settings/page.tsx`

**Step 1: Extend SETTING_KEYS array**

In `web/src/app/settings/page.tsx`, update `SETTING_KEYS` (line 24):

```ts
const SETTING_KEYS = [
  'llm_provider',
  'llm_model',
  'llm_api_key',
  'llm_product_id',
  'bot_language',
  'waha_url',
  'feeds_enabled',
  'feed_rss_enabled',
  'feed_atom_enabled',
  'feed_activitypub_enabled',
  'feed_atprotocol_enabled',
  'feed_ics_enabled',
  'feed_sitemap_enabled',
] as const;
```

**Step 2: Add Public Feeds card section**

Insert before the `{/* Save */}` comment (before line 406):

```tsx
{/* Public Feeds */}
<div className={cardClass}>
  <h2 className="mb-4 text-lg font-semibold text-gray-900">
    Public Feeds
  </h2>
  <p className="mb-3 text-sm text-gray-500">
    Control which public feeds are available. Disabling the master toggle turns off all feeds.
  </p>
  <div className="space-y-3">
    {[
      { key: 'feeds_enabled', label: 'All Feeds (Master Toggle)' },
      { key: 'feed_rss_enabled', label: 'RSS 2.0' },
      { key: 'feed_atom_enabled', label: 'Atom 1.0' },
      { key: 'feed_ics_enabled', label: 'Calendar (ICS)' },
      { key: 'feed_activitypub_enabled', label: 'ActivityPub (Mastodon)' },
      { key: 'feed_atprotocol_enabled', label: 'AT Protocol (Bluesky)' },
      { key: 'feed_sitemap_enabled', label: 'Include in Sitemap' },
    ].map(({ key, label }) => (
      <label key={key} className="flex items-center justify-between cursor-pointer">
        <span className={`text-sm ${key === 'feeds_enabled' ? 'font-semibold' : ''} text-gray-700`}>
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={settings[key] !== 'false'}
          onClick={() => update(key, settings[key] === 'false' ? 'true' : 'false')}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings[key] === 'false' ? 'bg-gray-300' : 'bg-emerald-500'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings[key] === 'false' ? 'translate-x-1' : 'translate-x-6'
            }`}
          />
        </button>
      </label>
    ))}
  </div>
</div>
```

**Step 3: Verify build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```
git commit -m "feat: add feed toggle switches to settings page" -- web/src/app/settings/page.tsx
```

---

### Task 9: Update FEATURES.md, RELEASE_NOTES.md, and User Docs

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`
- Modify: `docs/FAQ.md`

**Step 1: Add feature entries to FEATURES.md**

```md
- [x] RSS 2.0 feed for public events
- [x] Atom 1.0 feed for public events
- [x] ActivityPub read-only publisher (Mastodon/Fediverse)
- [x] AT Protocol feed generator (Bluesky)
- [x] ICS calendar subscriptions (combined + per-type)
- [x] Dynamic sitemap with feed URLs
- [x] robots.txt with sitemap reference
- [x] Homepage subscribe widget
- [x] Admin toggles for each feed type
```

**Step 2: Add release notes**

```md
## Release X.X (Fri, Feb 28 2026)

* Public feeds: Subscribe to events via RSS, Atom, or calendar (ICS)
* Social feeds: Follow the club on Mastodon (ActivityPub) or Bluesky (AT Protocol)
* Homepage widget: New "Subscribe to updates" card with copy-to-clipboard URLs
* Admin controls: Toggle each feed type on/off from the settings page
* SEO: Dynamic sitemap and robots.txt for search engine discovery
```

**Step 3: Add FAQ entry**

```md
### How do I subscribe to the club's events?

Visit the homepage and open the "Subscribe to updates" card. You can:
- **Calendar**: Copy the ICS link and add it as a subscription in Google Calendar, Apple Calendar, or Outlook
- **RSS**: Use the RSS or Atom feed URL with any feed reader
- **Social**: Follow the club on Mastodon or Bluesky
```

**Step 4: Commit**

```
git commit -m "docs: add feed feature entries, release notes, and FAQ" -- FEATURES.md RELEASE_NOTES.md docs/FAQ.md
```

---

### Task 10: Run Full Test Suite & Verify Build

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 2: Run web build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: If any issues, fix and commit**

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Feed settings defaults | `database.ts` |
| 2 | FeedService data layer | `services/feeds.ts` + test |
| 3 | XML escape utility | `utils/xml.ts` + test |
| 4 | Feed serializers | `services/feed-serializers.ts` + test |
| 5 | Feed routes + well-known + sitemap + robots | `routes/feeds.ts` + test, `index.ts` |
| 6 | Well-known & sitemap tests | `routes/__tests__/feeds.test.ts` |
| 7 | SubscribeCard component | `components/SubscribeCard.tsx`, `page.tsx` |
| 8 | Settings page toggles | `settings/page.tsx` |
| 9 | Docs + release notes | `FEATURES.md`, `RELEASE_NOTES.md`, `FAQ.md` |
| 10 | Full verification | All files |
