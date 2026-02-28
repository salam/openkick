import { getDB } from "../database.js";

export interface AlertResult {
  type: "filling_up" | "full" | "low_registration";
  message: string;
}

/**
 * Check tournament registration thresholds and return an alert when a
 * threshold is crossed. Uses the tournament_alerts table for deduplication
 * so that the same alert type is not fired twice for the same event.
 */
export function checkThresholds(eventId: number): AlertResult | null {
  const db = getDB();

  // 1. Get event details
  const eventRows = db.exec(
    "SELECT type, title, maxParticipants, minParticipants, deadline FROM events WHERE id = ?",
    [eventId],
  );

  if (!eventRows.length || !eventRows[0].values.length) {
    return null;
  }

  const [type, title, maxParticipants, _minParticipants, _deadline] =
    eventRows[0].values[0] as [string, string, number | null, number | null, string | null];

  // 2. Only tournament events with a maxParticipants cap
  if (type !== "tournament" || maxParticipants === null) {
    return null;
  }

  // 3. Count attending players
  const countRows = db.exec(
    "SELECT COUNT(*) FROM attendance WHERE eventId = ? AND status = 'attending'",
    [eventId],
  );
  const attending = (countRows[0]?.values[0]?.[0] as number) ?? 0;

  // 4. Determine which threshold is crossed
  let alertType: AlertResult["type"] | null = null;

  if (attending >= maxParticipants) {
    alertType = "full";
  } else if (attending >= maxParticipants * 0.8) {
    alertType = "filling_up";
  }

  // 5. No threshold crossed
  if (alertType === null) {
    return null;
  }

  // 6. Deduplication check
  const existingRows = db.exec(
    "SELECT lastAlertType FROM tournament_alerts WHERE eventId = ?",
    [eventId],
  );

  if (existingRows.length && existingRows[0].values.length) {
    const lastAlertType = existingRows[0].values[0][0] as string;
    if (lastAlertType === alertType) {
      return null;
    }
  }

  // 7. Upsert alert record
  db.run(
    `INSERT INTO tournament_alerts (eventId, lastAlertType)
     VALUES (?, ?)
     ON CONFLICT(eventId) DO UPDATE SET lastAlertType = ?, lastAlertAt = datetime('now')`,
    [eventId, alertType, alertType],
  );

  // 8. Build and return alert
  const message =
    alertType === "full"
      ? `${title} is now full (${attending}/${maxParticipants} spots taken).`
      : `${title} is filling up (${attending}/${maxParticipants} spots taken).`;

  return { type: alertType, message };
}
