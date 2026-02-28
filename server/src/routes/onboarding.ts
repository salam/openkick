import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";

export const onboardingRouter = Router();

function getSetting(key: string): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (result.length === 0 || result[0].values.length === 0) return "";
  return (result[0].values[0][0] as string) ?? "";
}

function queryCount(sql: string, params?: (string | number | null)[]): number {
  const db = getDB();
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return 0;
  return (result[0].values[0][0] as number) ?? 0;
}

function buildFullStatus() {
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
    hasHolidays: queryCount("SELECT COUNT(*) FROM vacation_periods") > 0,
    hasTrainings: queryCount("SELECT COUNT(*) FROM event_series") > 0,
    hasPlayers: queryCount("SELECT COUNT(*) FROM players") > 0,
    hasGuardians: queryCount("SELECT COUNT(*) FROM guardians WHERE role = ?", ["parent"]) > 0,
    hasTournaments: queryCount("SELECT COUNT(*) FROM events WHERE type = ?", ["tournament"]) > 0,
    // Feeds are enabled by default in DEFAULT_SETTINGS; always true
    hasFeedsConfigured: true,
  };

  return { steps, checklist };
}

// Public endpoint — returns only onboardingCompleted flag to unauthenticated callers,
// full status (steps + checklist) to authenticated callers.
onboardingRouter.get("/onboarding/status", (req: Request, res: Response) => {
  const onboardingCompleted = getSetting("onboarding_completed") === "true";

  // Check if request has a valid auth token (optional)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const { steps, checklist } = buildFullStatus();
    res.json({ onboardingCompleted, steps, checklist });
  } else {
    res.json({ onboardingCompleted });
  }
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
