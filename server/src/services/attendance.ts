import { getDB } from "../database.js";

export interface AttendanceRecord {
  id: number;
  eventId: number;
  playerId: number;
  playerName: string | null;
  status: string;
  reason: string | null;
  respondedAt: string | null;
  source: string;
}

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

function getAttendingCount(eventId: number): number {
  const db = getDB();
  const result = db.exec(
    "SELECT COUNT(*) AS cnt FROM attendance WHERE eventId = ? AND status = 'attending'",
    [eventId],
  );
  return (result[0]?.values[0][0] as number) ?? 0;
}

function getMaxParticipants(eventId: number): number | null {
  const db = getDB();
  const result = db.exec(
    "SELECT maxParticipants FROM events WHERE id = ?",
    [eventId],
  );
  if (result.length === 0) return null;
  const val = result[0].values[0][0];
  return val == null ? null : (val as number);
}

function promoteFirstWaitlisted(eventId: number): void {
  const db = getDB();
  const waitlisted = rowsToObjects(
    db.exec(
      "SELECT id FROM attendance WHERE eventId = ? AND status = 'waitlist' ORDER BY respondedAt ASC LIMIT 1",
      [eventId],
    ),
  );
  if (waitlisted.length > 0) {
    const id = waitlisted[0].id as number;
    db.run(
      "UPDATE attendance SET status = 'attending', respondedAt = datetime('now') WHERE id = ?",
      [id],
    );
  }
}

export function setAttendance(
  eventId: number,
  playerId: number,
  status: "attending" | "absent",
  source: string,
  reason?: string,
): { finalStatus: string } {
  const db = getDB();

  // Check if record already exists
  const existing = rowsToObjects(
    db.exec(
      "SELECT id, status FROM attendance WHERE eventId = ? AND playerId = ?",
      [eventId, playerId],
    ),
  );

  const previousStatus = existing.length > 0 ? (existing[0].status as string) : null;

  // Determine final status
  let finalStatus: string = status;
  if (status === "attending") {
    const maxParticipants = getMaxParticipants(eventId);
    if (maxParticipants != null) {
      // Count current attending, excluding this player (in case they're updating)
      let attendingCount = getAttendingCount(eventId);
      if (previousStatus === "attending") {
        attendingCount -= 1; // Don't count themselves
      }
      if (attendingCount >= maxParticipants) {
        finalStatus = "waitlist";
      }
    }
  }

  if (existing.length > 0) {
    // Update existing record
    db.run(
      "UPDATE attendance SET status = ?, reason = ?, respondedAt = datetime('now'), source = ? WHERE eventId = ? AND playerId = ?",
      [finalStatus, reason ?? null, source, eventId, playerId],
    );
  } else {
    // Insert new record
    db.run(
      "INSERT INTO attendance (eventId, playerId, status, reason, respondedAt, source) VALUES (?, ?, ?, ?, datetime('now'), ?)",
      [eventId, playerId, finalStatus, reason ?? null, source],
    );
  }

  // If player was attending and is now absent, promote first waitlisted
  if (previousStatus === "attending" && status === "absent") {
    const maxParticipants = getMaxParticipants(eventId);
    if (maxParticipants != null) {
      const attendingCount = getAttendingCount(eventId);
      if (attendingCount < maxParticipants) {
        promoteFirstWaitlisted(eventId);
      }
    }
  }

  return { finalStatus };
}

export function getAttendanceForEvent(eventId: number): AttendanceRecord[] {
  const db = getDB();
  const rows = rowsToObjects(
    db.exec(
      "SELECT a.*, p.name AS playerName FROM attendance a LEFT JOIN players p ON p.id = a.playerId WHERE a.eventId = ? ORDER BY a.respondedAt ASC",
      [eventId],
    ),
  );
  return rows as unknown as AttendanceRecord[];
}

export function getAttendanceSummary(
  eventId: number,
): { attending: number; absent: number; waitlist: number; unknown: number } {
  const db = getDB();

  const countFor = (status: string): number => {
    const result = db.exec(
      "SELECT COUNT(*) AS cnt FROM attendance WHERE eventId = ? AND status = ?",
      [eventId, status],
    );
    return (result[0]?.values[0][0] as number) ?? 0;
  };

  return {
    attending: countFor("attending"),
    absent: countFor("absent"),
    waitlist: countFor("waitlist"),
    unknown: countFor("unknown"),
  };
}
