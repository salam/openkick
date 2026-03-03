import { Router, type Request, type Response } from "express";
import { authMiddleware, requireRole } from "../auth.js";
import { getDB, getLastInsertId } from "../database.js";
import {
  composeTrainingHeadsup,
  composeRainAlert,
  composeHolidayAnnouncement,
  sendBroadcast,
} from "../services/broadcasts.js";
import { getWeatherForecast } from "../services/weather.js";

export const broadcastsRouter = Router();

// ── Helper: row objects from sql.js result ──────────────────────────

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
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

// ── POST /api/broadcasts — create draft broadcast ───────────────────

broadcastsRouter.post("/broadcasts", authMiddleware, requireRole("admin", "coach"), (req: Request, res: Response) => {
  const { type, message, scheduledFor, templateKey } = req.body;

  if (!type) {
    res.status(400).json({ error: "type is required" });
    return;
  }

  const db = getDB();
  db.run(
    "INSERT INTO broadcasts (type, templateKey, message, status, scheduledFor) VALUES (?, ?, ?, 'draft', ?)",
    [type, templateKey ?? null, message ?? null, scheduledFor ?? null],
  );

  const id = getLastInsertId();

  const rows = rowsToObjects(
    db.exec("SELECT * FROM broadcasts WHERE id = ?", [id]),
  );
  res.status(201).json(rows[0]);
});

// ── GET /api/broadcasts — list all broadcasts ───────────────────────

broadcastsRouter.get("/broadcasts", authMiddleware, requireRole("admin", "coach"), (_req: Request, res: Response) => {
  const db = getDB();
  const rows = rowsToObjects(
    db.exec("SELECT * FROM broadcasts ORDER BY id DESC"),
  );
  res.json(rows);
});

// ── PUT /api/broadcasts/:id — update broadcast before sending ───────

broadcastsRouter.put("/broadcasts/:id", authMiddleware, requireRole("admin", "coach"), (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(
    db.exec("SELECT * FROM broadcasts WHERE id = ?", [id]),
  );
  if (existing.length === 0) {
    res.status(404).json({ error: "Broadcast not found" });
    return;
  }

  const current = existing[0];
  const message = req.body.message ?? current.message;
  const scheduledFor = req.body.scheduledFor ?? current.scheduledFor;
  const templateKey = req.body.templateKey ?? current.templateKey;

  db.run(
    "UPDATE broadcasts SET message = ?, scheduledFor = ?, templateKey = ? WHERE id = ?",
    [message, scheduledFor, templateKey, id],
  );

  const rows = rowsToObjects(
    db.exec("SELECT * FROM broadcasts WHERE id = ?", [id]),
  );
  res.json(rows[0]);
});

// ── POST /api/broadcasts/:id/send — trigger sendBroadcast ──────────

broadcastsRouter.post(
  "/broadcasts/:id/send",
  authMiddleware,
  requireRole("admin", "coach"),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    try {
      const result = await sendBroadcast(id);
      res.json(result);
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      if (errMessage === "Broadcast not found") {
        res.status(404).json({ error: errMessage });
      } else {
        res.status(500).json({ error: errMessage });
      }
    }
  },
);

// ── POST /api/broadcasts/compose — preview a composed message ───────

broadcastsRouter.post(
  "/broadcasts/compose",
  authMiddleware,
  requireRole("admin", "coach"),
  async (req: Request, res: Response) => {
    const { template, eventId, vacationName, startDate, endDate } = req.body;

    try {
      if (template === "training_headsup") {
        if (!eventId) {
          res.status(400).json({ error: "eventId is required for training_headsup" });
          return;
        }

        const db = getDB();
        const eventRows = rowsToObjects(
          db.exec("SELECT * FROM events WHERE id = ?", [eventId]),
        );
        if (eventRows.length === 0) {
          res.status(404).json({ error: "Event not found" });
          return;
        }

        const event = eventRows[0];

        // Get weather forecast (use default Zurich coords if no settings)
        const settingsResult = db.exec(
          "SELECT key, value FROM settings WHERE key IN ('latitude', 'longitude')",
        );
        const settingsMap: Record<string, string> = {};
        if (settingsResult.length > 0) {
          for (const row of settingsResult[0].values) {
            settingsMap[row[0] as string] = row[1] as string;
          }
        }
        const lat = parseFloat(settingsMap.latitude ?? "47.3769");
        const lng = parseFloat(settingsMap.longitude ?? "8.5417");

        const weather = await getWeatherForecast(
          lat,
          lng,
          event.date as string,
          (event.startTime as string) ?? "18:00",
        );

        const composedMessage = await composeTrainingHeadsup(
          {
            title: event.title as string,
            date: event.date as string,
            startTime: (event.startTime as string) ?? "18:00",
            location: (event.location as string) ?? "",
          },
          { temperature: weather.temperature, description: weather.description },
        );

        res.json({ message: composedMessage });
      } else if (template === "rain_alert") {
        if (!eventId) {
          res.status(400).json({ error: "eventId is required for rain_alert" });
          return;
        }

        const db = getDB();
        const eventRows = rowsToObjects(
          db.exec("SELECT * FROM events WHERE id = ?", [eventId]),
        );
        if (eventRows.length === 0) {
          res.status(404).json({ error: "Event not found" });
          return;
        }

        const event = eventRows[0];
        const composedMessage = await composeRainAlert({
          title: event.title as string,
          date: event.date as string,
          startTime: (event.startTime as string) ?? "18:00",
        });

        res.json({ message: composedMessage });
      } else if (template === "holiday_announcement") {
        if (!vacationName || !startDate || !endDate) {
          res.status(400).json({
            error: "vacationName, startDate, and endDate are required for holiday_announcement",
          });
          return;
        }

        const composedMessage = await composeHolidayAnnouncement(
          vacationName,
          startDate,
          endDate,
        );

        res.json({ message: composedMessage });
      } else {
        res.status(400).json({ error: `Unknown template: ${template}` });
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: errMessage });
    }
  },
);
