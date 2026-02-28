import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";

export const settingsRouter = Router();

// GET /api/settings — return all settings as { key: value } object
settingsRouter.get("/settings", (_req: Request, res: Response) => {
  const db = getDB();
  const result = db.exec("SELECT key, value FROM settings ORDER BY key");

  const settings: Record<string, string> = {};
  if (result.length > 0) {
    const { values } = result[0];
    for (const [key, value] of values) {
      settings[key as string] = value as string;
    }
  }

  res.json(settings);
});

// GET /api/settings/:key — return single setting
settingsRouter.get("/settings/:key", (req: Request, res: Response) => {
  const db = getDB();
  const { key } = req.params;

  const result = db.exec("SELECT key, value FROM settings WHERE key = ?", [key as string]);
  if (result.length === 0 || result[0].values.length === 0) {
    res.status(404).json({ error: "Setting not found" });
    return;
  }

  const [k, v] = result[0].values[0];
  res.json({ key: k, value: v });
});

// PUT /api/settings/:key — create or update a setting
settingsRouter.put("/settings/:key", (req: Request, res: Response) => {
  const db = getDB();
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined || value === null) {
    res.status(400).json({ error: "value is required" });
    return;
  }

  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key as string, String(value)]);

  res.json({ key, value: String(value) });
});
