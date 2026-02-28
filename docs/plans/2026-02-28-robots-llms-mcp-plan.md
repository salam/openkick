# robots.txt, llms.txt & MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add public-facing robots.txt, dynamic llms.txt, and a read-only MCP server for agent interoperability.

**Architecture:** Static robots.txt in `public/`, dynamic llms.txt via Express route reading from DB settings, and an MCP server using `@modelcontextprotocol/sdk` mounted at `/mcp` exposing read-only tools.

**Tech Stack:** Express, sql.js, @modelcontextprotocol/sdk, vitest

---

### Task 1: Static file serving + robots.txt

**Files:**
- Create: `public/robots.txt`
- Modify: `server/src/index.ts:14-18` (add static middleware)

**Step 1: Create robots.txt**

Create `public/robots.txt`:

```
User-agent: *
Allow: /
Allow: /llms.txt
Allow: /.well-known/

# Read-only API endpoints
Allow: /api/health
Allow: /api/events
Allow: /api/calendar
Allow: /api/players
Allow: /api/attendance

# Block data-modifying and sensitive paths
Disallow: /api/settings
Disallow: /api/whatsapp
Disallow: /api/broadcasts
Disallow: /api/teams

Sitemap: https://club.example.com/sitemap.xml
```

**Step 2: Add express.static middleware to index.ts**

In `server/src/index.ts`, add after the `app.use(express.json())` line:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(__dirname, "../../public")));
```

**Step 3: Write test for robots.txt serving**

Create `server/src/__tests__/robots.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server: Server;
let baseUrl: string;

async function createTestApp() {
  const app = express();
  app.use(express.static(path.resolve(__dirname, "../../../public")));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

describe("robots.txt", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("serves robots.txt with correct content-type", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("User-agent: *");
    expect(text).toContain("Disallow: /api/settings");
  });
});
```

**Step 4: Run tests**

Run: `cd server && npx vitest run src/__tests__/robots.test.ts`
Expected: PASS

**Step 5: Commit**

Commit `public/robots.txt`, `server/src/index.ts`, and `server/src/__tests__/robots.test.ts` with message `feat: add robots.txt and static file serving`.

---

### Task 2: Dynamic llms.txt route

**Files:**
- Create: `server/src/routes/llms.ts`
- Create: `server/src/routes/__tests__/llms.test.ts`
- Modify: `server/src/index.ts` (mount route)

**Step 1: Write the failing test**

Create `server/src/routes/__tests__/llms.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { llmsRouter } from "../llms.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/", llmsRouter);
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

describe("GET /llms.txt", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("returns plain text with default club name when no settings configured", async () => {
    const res = await fetch(`${baseUrl}/llms.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("# My Club");
    expect(text).toContain("## Public Data Available");
    expect(text).toContain("## API Endpoints");
    expect(text).toContain("## Statistics");
    expect(text).toContain("Players:");
  });

  it("uses club_name from settings when configured", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('club_name', 'FC Teststadt')");
    const res = await fetch(`${baseUrl}/llms.txt`);
    const text = await res.text();
    expect(text).toContain("# FC Teststadt");
  });

  it("includes live player count", async () => {
    db.run("INSERT INTO players (name, yearOfBirth, category) VALUES ('Player 1', 2016, 'E')");
    db.run("INSERT INTO players (name, yearOfBirth, category) VALUES ('Player 2', 2017, 'F')");
    const res = await fetch(`${baseUrl}/llms.txt`);
    const text = await res.text();
    expect(text).toContain("Players: 2");
  });

  it("includes upcoming event count", async () => {
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'Training', '2099-12-01')");
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Cup', '2099-12-15')");
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'Old', '2020-01-01')");
    const res = await fetch(`${baseUrl}/llms.txt`);
    const text = await res.text();
    expect(text).toContain("Upcoming events: 2");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/llms.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement llms.ts route**

Create `server/src/routes/llms.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";

export const llmsRouter = Router();

function getSetting(key: string, fallback: string): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (result.length === 0 || result[0].values.length === 0) return fallback;
  return result[0].values[0][0] as string;
}

function getCount(sql: string, params: unknown[] = []): number {
  const db = getDB();
  const result = db.exec(sql, params as import("sql.js").SqlValue[]);
  if (result.length === 0 || result[0].values.length === 0) return 0;
  return result[0].values[0][0] as number;
}

llmsRouter.get("/llms.txt", (_req: Request, res: Response) => {
  const clubName = getSetting("club_name", "My Club");
  const clubDescription = getSetting("club_description", "A youth football club management platform powered by OpenKick.");
  const contactInfo = getSetting("contact_info", "See /.well-known/security.txt");

  const playerCount = getCount("SELECT COUNT(*) FROM players");
  const upcomingEventCount = getCount(
    "SELECT COUNT(*) FROM events WHERE date >= date('now')"
  );

  const body = `# ${clubName}

> ${clubDescription}

## Public Data Available

- **Upcoming Events**: Trainings, tournaments, and matches
- **Attendance Statistics**: Aggregated attendance rates
- **Player Categories**: Age groups and team structure
- **Calendar**: Event feed

## API Endpoints (read-only)

- GET /api/events — List upcoming events
- GET /api/calendar — Calendar feed
- GET /api/attendance — Attendance records
- GET /api/health — Service health check

## Statistics

- Players: ${playerCount}
- Upcoming events: ${upcomingEventCount}
- Languages: de, en, fr

## Integration

For programmatic access, an MCP server is available.
See /mcp for the Model Context Protocol interface.

## Contact

${contactInfo}
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(body);
});
```

**Step 4: Mount in index.ts**

Add to `server/src/index.ts`:

```ts
import { llmsRouter } from "./routes/llms.js";
// Mount before /api routes:
app.use("/", llmsRouter);
```

**Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/llms.test.ts`
Expected: PASS

**Step 6: Commit**

Commit `server/src/routes/llms.ts`, `server/src/routes/__tests__/llms.test.ts`, and `server/src/index.ts` with message `feat: dynamic llms.txt route with live stats from DB`.

---

### Task 3: Install MCP SDK

**Files:**
- Modify: `server/package.json`

**Step 1: Install dependency**

Run: `cd server && npm install @modelcontextprotocol/sdk`

**Step 2: Verify installation succeeds**

**Step 3: Commit**

Commit `server/package.json` and `server/package-lock.json` with message `chore: add @modelcontextprotocol/sdk dependency`.

---

### Task 4: MCP server with tools

**Files:**
- Create: `server/src/mcp/server.ts`
- Create: `server/src/mcp/__tests__/server.test.ts`

**Step 1: Write the failing test**

Create `server/src/mcp/__tests__/server.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";
import { createMcpServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

let db: Database;

async function setup() {
  db = await initDB();
}

async function teardown() {
  db.close();
}

describe("MCP Server", () => {
  beforeEach(async () => { await setup(); });
  afterEach(async () => { await teardown(); });

  async function createClient() {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
    return { client, server };
  }

  it("lists all tools", async () => {
    const { client } = await createClient();
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("get_club_info");
    expect(names).toContain("list_upcoming_events");
    expect(names).toContain("get_attendance_stats");
    expect(names).toContain("get_player_categories");
  });

  it("get_club_info returns default settings", async () => {
    const { client } = await createClient();
    const result = await client.callTool({ name: "get_club_info", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.club_name).toBe("My Club");
  });

  it("get_club_info reflects updated settings", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('club_name', 'FC Teststadt')");
    const { client } = await createClient();
    const result = await client.callTool({ name: "get_club_info", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.club_name).toBe("FC Teststadt");
  });

  it("list_upcoming_events returns future events only", async () => {
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'Future', '2099-12-01')");
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'Past', '2020-01-01')");
    const { client } = await createClient();
    const result = await client.callTool({ name: "list_upcoming_events", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Future");
  });

  it("list_upcoming_events respects limit", async () => {
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'E1', '2099-01-01')");
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'E2', '2099-02-01')");
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'E3', '2099-03-01')");
    const { client } = await createClient();
    const result = await client.callTool({ name: "list_upcoming_events", arguments: { limit: 2 } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data).toHaveLength(2);
  });

  it("get_attendance_stats returns aggregated stats", async () => {
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'T1', '2099-12-01')");
    db.run("INSERT INTO players (name) VALUES ('P1')");
    db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (1, 1, 'attending')");
    const { client } = await createClient();
    const result = await client.callTool({ name: "get_attendance_stats", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.total_records).toBe(1);
    expect(data.by_status.attending).toBe(1);
  });

  it("get_player_categories returns category counts", async () => {
    db.run("INSERT INTO players (name, category) VALUES ('P1', 'E')");
    db.run("INSERT INTO players (name, category) VALUES ('P2', 'E')");
    db.run("INSERT INTO players (name, category) VALUES ('P3', 'F')");
    const { client } = await createClient();
    const result = await client.callTool({ name: "get_player_categories", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    const eCategory = data.find((c: { category: string }) => c.category === "E");
    expect(eCategory.count).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/mcp/__tests__/server.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement MCP server**

Create `server/src/mcp/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDB } from "../database.js";

function getSetting(key: string, fallback: string): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (result.length === 0 || result[0].values.length === 0) return fallback;
  return result[0].values[0][0] as string;
}

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[]
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export function createMcpServer() {
  const server = new McpServer({
    name: "openkick",
    version: "1.0.0",
  });

  server.tool(
    "get_club_info",
    "Get club name, description, languages, and contact info",
    {},
    async () => {
      const data = {
        club_name: getSetting("club_name", "My Club"),
        club_description: getSetting(
          "club_description",
          "A youth football club management platform powered by OpenKick."
        ),
        contact: getSetting("contact_info", "See /.well-known/security.txt"),
        languages: ["de", "en", "fr"],
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "list_upcoming_events",
    "List upcoming events (trainings, tournaments, matches)",
    { limit: z.number().optional().describe("Max events to return (default 20)") },
    async ({ limit }) => {
      const db = getDB();
      const maxResults = limit ?? 20;
      const result = db.exec(
        "SELECT id, type, title, date, startTime, location, categoryRequirement FROM events WHERE date >= date('now') ORDER BY date ASC LIMIT ?",
        [maxResults]
      );
      const events = rowsToObjects(result);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(events, null, 2) }],
      };
    }
  );

  server.tool(
    "get_attendance_stats",
    "Get aggregated attendance statistics",
    {},
    async () => {
      const db = getDB();
      const totalResult = db.exec("SELECT COUNT(*) FROM attendance");
      const total =
        totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;

      const byStatusResult = db.exec(
        "SELECT status, COUNT(*) as count FROM attendance GROUP BY status"
      );
      const byStatus: Record<string, number> = {};
      if (byStatusResult.length > 0) {
        for (const row of byStatusResult[0].values) {
          byStatus[row[0] as string] = row[1] as number;
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total_records: total, by_status: byStatus },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "get_player_categories",
    "Get age categories with player counts",
    {},
    async () => {
      const db = getDB();
      const result = db.exec(
        "SELECT category, COUNT(*) as count FROM players WHERE category IS NOT NULL GROUP BY category ORDER BY category"
      );
      const categories = rowsToObjects(result);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(categories, null, 2) }],
      };
    }
  );

  return server;
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/mcp/__tests__/server.test.ts`
Expected: PASS

**Step 5: Commit**

Commit `server/src/mcp/server.ts` and `server/src/mcp/__tests__/server.test.ts` with message `feat: MCP server with read-only tools`.

---

### Task 5: MCP Express integration

**Files:**
- Create: `server/src/mcp/index.ts`
- Create: `server/src/mcp/__tests__/integration.test.ts`
- Modify: `server/src/index.ts` (mount `/mcp`)

**Step 1: Write the failing test**

Create `server/src/mcp/__tests__/integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { mcpRouter } from "../index.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/mcp", mcpRouter);
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

describe("MCP HTTP integration", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("POST /mcp responds to MCP initialize", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.serverInfo.name).toBe("openkick");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/mcp/__tests__/integration.test.ts`
Expected: FAIL

**Step 3: Implement MCP Express router**

Create `server/src/mcp/index.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { createMcpServer } from "./server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

export const mcpRouter = Router();

const transports = new Map<string, StreamableHTTPServerTransport>();

mcpRouter.post("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (!isInitializeRequest(req.body)) {
    res.status(400).json({ error: "First request must be an initialize request" });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  const server = createMcpServer();

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) transports.delete(sid);
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  if (transport.sessionId) {
    transports.set(transport.sessionId, transport);
  }
});

mcpRouter.get("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

mcpRouter.delete("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
  transports.delete(sessionId);
});
```

**Step 4: Mount in index.ts**

Add to `server/src/index.ts`:

```ts
import { mcpRouter } from "./mcp/index.js";
app.use("/mcp", mcpRouter);
```

**Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/mcp/__tests__/integration.test.ts`
Expected: PASS

**Step 6: Commit**

Commit `server/src/mcp/index.ts`, `server/src/mcp/__tests__/integration.test.ts`, and `server/src/index.ts` with message `feat: MCP HTTP transport mounted at /mcp`.

---

### Task 6: Full test suite + build verification

**Step 1: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 2: Run build**

Run: `cd server && npm run build`
Expected: Build succeeds (tsc compiles, tests pass)

**Step 3: Update FEATURES.md**

Add the new features to FEATURES.md.

**Step 4: Update RELEASE_NOTES.md**

Add a new section for the robots.txt, llms.txt, and MCP server features.

**Step 5: Final commit**

Commit `FEATURES.md` and `RELEASE_NOTES.md` with message `docs: update features and release notes for robots/llms/mcp`.
