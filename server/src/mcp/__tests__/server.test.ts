import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { initDB, getDB } from "../../database.js";
import { createMcpServer } from "../server.js";
import type { Database } from "sql.js";

let db: Database | null = null;

async function createClient() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

function parseToolResult(
  result: Awaited<ReturnType<Client["callTool"]>>
): unknown {
  const text = (result.content as Array<{ type: string; text: string }>)[0]
    .text;
  return JSON.parse(text);
}

beforeEach(async () => {
  db = await initDB();
});

afterEach(async () => {
  if (db) {
    db.close();
    db = null;
  }
});

describe("MCP Server", () => {
  it("lists all tools", async () => {
    const { client } = await createClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_club_info");
    expect(names).toContain("list_upcoming_events");
    expect(names).toContain("get_attendance_stats");
    expect(names).toContain("get_player_categories");
    expect(names).toContain("get_trophy_cabinet");
    await client.close();
  });

  it("get_club_info returns default settings", async () => {
    const { client } = await createClient();
    const result = await client.callTool({ name: "get_club_info", arguments: {} });
    const data = parseToolResult(result) as Record<string, unknown>;
    expect(data.club_name).toBe("My Club");
    expect(data.club_description).toBe("A youth football club.");
    expect(data.languages).toEqual(["de", "en", "fr"]);
    await client.close();
  });

  it("get_club_info reflects updated settings", async () => {
    const d = getDB();
    d.run(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('club_name', 'FC Test')"
    );
    const { client } = await createClient();
    const result = await client.callTool({ name: "get_club_info", arguments: {} });
    const data = parseToolResult(result) as Record<string, unknown>;
    expect(data.club_name).toBe("FC Test");
    await client.close();
  });

  it("list_upcoming_events returns future events only", async () => {
    const d = getDB();
    // Insert a future event
    d.run(
      "INSERT INTO events (type, title, date, startTime, location) VALUES ('training', 'Future Training', '2099-06-15', '18:00', 'Stadium A')"
    );
    // Insert a past event
    d.run(
      "INSERT INTO events (type, title, date, startTime, location) VALUES ('match', 'Past Match', '2020-01-01', '10:00', 'Stadium B')"
    );

    const { client } = await createClient();
    const result = await client.callTool({
      name: "list_upcoming_events",
      arguments: {},
    });
    const events = parseToolResult(result) as Array<Record<string, unknown>>;
    expect(events.length).toBe(1);
    expect(events[0].title).toBe("Future Training");
    await client.close();
  });

  it("list_upcoming_events respects limit", async () => {
    const d = getDB();
    d.run(
      "INSERT INTO events (type, title, date) VALUES ('training', 'Event A', '2099-01-01')"
    );
    d.run(
      "INSERT INTO events (type, title, date) VALUES ('training', 'Event B', '2099-02-01')"
    );
    d.run(
      "INSERT INTO events (type, title, date) VALUES ('training', 'Event C', '2099-03-01')"
    );

    const { client } = await createClient();
    const result = await client.callTool({
      name: "list_upcoming_events",
      arguments: { limit: 2 },
    });
    const events = parseToolResult(result) as Array<Record<string, unknown>>;
    expect(events.length).toBe(2);
    await client.close();
  });

  it("get_attendance_stats returns aggregated stats", async () => {
    const d = getDB();
    // Need an event and player first (foreign keys)
    d.run(
      "INSERT INTO events (id, type, title, date) VALUES (1, 'training', 'Test', '2099-01-01')"
    );
    d.run("INSERT INTO players (id, name) VALUES (1, 'Player A')");
    d.run(
      "INSERT INTO attendance (eventId, playerId, status) VALUES (1, 1, 'confirmed')"
    );

    const { client } = await createClient();
    const result = await client.callTool({ name: "get_attendance_stats", arguments: {} });
    const data = parseToolResult(result) as {
      total_records: number;
      by_status: Record<string, number>;
    };
    expect(data.total_records).toBe(1);
    expect(data.by_status.confirmed).toBe(1);
    await client.close();
  });

  it("get_player_categories returns category counts", async () => {
    const d = getDB();
    d.run(
      "INSERT INTO players (name, category) VALUES ('Alice', 'U12')"
    );
    d.run(
      "INSERT INTO players (name, category) VALUES ('Bob', 'U12')"
    );
    d.run(
      "INSERT INTO players (name, category) VALUES ('Charlie', 'U14')"
    );
    // Player with no category should be excluded
    d.run("INSERT INTO players (name) VALUES ('Dave')");

    const { client } = await createClient();
    const result = await client.callTool({ name: "get_player_categories", arguments: {} });
    const categories = parseToolResult(result) as Array<{
      category: string;
      count: number;
    }>;
    expect(categories.length).toBe(2);
    const u12 = categories.find((c) => c.category === "U12");
    const u14 = categories.find((c) => c.category === "U14");
    expect(u12?.count).toBe(2);
    expect(u14?.count).toBe(1);
    await client.close();
  });

  it("get_trophy_cabinet returns trophy data", async () => {
    const d = getDB();
    d.run(
      "INSERT INTO events (id, type, title, date) VALUES (1, 'tournament', 'Summer Cup', '2026-06-15')"
    );
    d.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, summary, achievements)
       VALUES (1, 2, 12, 'Well played', '[{"type":"fair_play","label":"Fair Play"}]')`
    );

    const { client } = await createClient();
    const result = await client.callTool({
      name: "get_trophy_cabinet",
      arguments: {},
    });
    const entries = parseToolResult(result) as Array<Record<string, unknown>>;
    expect(entries.length).toBe(1);
    expect(entries[0].eventTitle).toBe("Summer Cup");
    expect(entries[0].placement).toBe(2);
    expect(entries[0].totalTeams).toBe(12);
    expect(entries[0].achievements).toEqual([
      { type: "fair_play", label: "Fair Play" },
    ]);
    await client.close();
  });

  it("get_trophy_cabinet respects limit", async () => {
    const d = getDB();
    d.run(
      "INSERT INTO events (id, type, title, date) VALUES (1, 'tournament', 'Cup A', '2026-01-01')"
    );
    d.run(
      "INSERT INTO events (id, type, title, date) VALUES (2, 'tournament', 'Cup B', '2026-02-01')"
    );
    d.run(
      "INSERT INTO events (id, type, title, date) VALUES (3, 'tournament', 'Cup C', '2026-03-01')"
    );
    d.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams, achievements) VALUES (1, 1, 8, '[]')"
    );
    d.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams, achievements) VALUES (2, 3, 10, '[]')"
    );
    d.run(
      "INSERT INTO tournament_results (eventId, placement, totalTeams, achievements) VALUES (3, 2, 6, '[]')"
    );

    const { client } = await createClient();
    const result = await client.callTool({
      name: "get_trophy_cabinet",
      arguments: { limit: 2 },
    });
    const entries = parseToolResult(result) as Array<Record<string, unknown>>;
    expect(entries.length).toBe(2);
    await client.close();
  });
});
