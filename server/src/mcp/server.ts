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
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
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
        content: [
          { type: "text" as const, text: JSON.stringify(data, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "list_upcoming_events",
    "List upcoming events (trainings, tournaments, matches)",
    {
      limit: z
        .number()
        .optional()
        .describe("Max events to return (default 20)"),
    },
    async ({ limit }) => {
      const db = getDB();
      const maxResults = limit ?? 20;
      const result = db.exec(
        "SELECT id, type, title, date, startTime, location, categoryRequirement FROM events WHERE date >= date('now') ORDER BY date ASC LIMIT ?",
        [maxResults]
      );
      const events = rowsToObjects(result);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(events, null, 2) },
        ],
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
        content: [
          { type: "text" as const, text: JSON.stringify(categories, null, 2) },
        ],
      };
    }
  );

  return server;
}
