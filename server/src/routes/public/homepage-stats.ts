import { Router, type Request, type Response } from "express";
import { getDB } from "../../database.js";
import { getHomepageStats } from "../../services/statistics.service.js";

export const homepageStatsRouter = Router();

const DEFAULT_SETTINGS: Record<string, boolean> = {
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

  const filtered: Record<string, unknown> = { computedAt: stats.computedAt };
  for (const [key, visible] of Object.entries(settings)) {
    filtered[key] = visible ? (stats as Record<string, unknown>)[key] : null;
  }

  res.json(filtered);
});
