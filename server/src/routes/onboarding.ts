import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";

export const onboardingRouter = Router();

/**
 * Helper: read a single setting value from the database.
 * Returns the value string, or an empty string if the key is missing.
 */
function getSetting(key: string): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (result.length === 0 || result[0].values.length === 0) return "";
  return (result[0].values[0][0] as string) ?? "";
}

/**
 * Helper: return the row count for a given table, with an optional WHERE clause.
 */
function countRows(table: string, where?: string): number {
  const db = getDB();
  const sql = where
    ? `SELECT COUNT(*) FROM ${table} WHERE ${where}`
    : `SELECT COUNT(*) FROM ${table}`;
  const result = db.exec(sql);
  if (result.length === 0 || result[0].values.length === 0) return 0;
  return (result[0].values[0][0] as number) ?? 0;
}

/**
 * GET /onboarding/status
 *
 * Returns the current onboarding state derived from existing data.
 * This endpoint is publicly accessible (no auth required) so the
 * frontend AuthGuard can check it before the user is logged in.
 */
onboardingRouter.get("/onboarding/status", (_req: Request, res: Response) => {
  const onboardingCompleted = getSetting("onboarding_completed") === "true";

  const clubName = getSetting("club_name");
  const smtpHost = getSetting("smtp_host");
  const llmApiKey = getSetting("llm_api_key");
  const wahaUrl = getSetting("waha_url");

  const steps = {
    clubProfile: clubName !== "My Club" && clubName !== "",
    email: smtpHost !== "",
    llm: llmApiKey !== "",
    waha: wahaUrl !== "" && wahaUrl !== "http://localhost:3008",
  };

  const checklist = {
    hasHolidays: countRows("vacation_periods") > 0,
    hasTrainings: countRows("event_series") > 0,
    hasPlayers: countRows("players") > 0,
    hasGuardians: countRows("guardians", "role = 'parent'") > 0,
    hasFeedsConfigured: true,
  };

  res.json({ onboardingCompleted, steps, checklist });
});

/**
 * POST /onboarding/complete
 *
 * Marks onboarding as completed (admin only).
 */
onboardingRouter.post(
  "/onboarding/complete",
  authMiddleware,
  requireRole("admin"),
  (_req: Request, res: Response) => {
    const db = getDB();
    db.run(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ["onboarding_completed", "true"]
    );
    res.json({ success: true });
  }
);
