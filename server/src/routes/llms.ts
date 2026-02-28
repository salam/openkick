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
