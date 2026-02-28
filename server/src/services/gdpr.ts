import { getDB, getLastInsertId } from "../database.js";

export interface GdprRequest {
  id: number;
  guardianId: number;
  type: "export" | "deletion";
  status: "pending" | "approved" | "rejected" | "completed";
  reason: string | null;
  adminNote: string | null;
  processedBy: number | null;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  resultPath: string | null;
  guardianName?: string;
  guardianPhone?: string;
}

export interface ExportData {
  guardian: {
    id: number;
    phone: string;
    name: string | null;
    email: string | null;
    role: string;
    language: string;
    consentGiven: number;
    consentGivenAt: string | null;
    consentWithdrawnAt: string | null;
    createdAt: string;
  };
  players: Array<{
    id: number;
    name: string;
    yearOfBirth: number | null;
    category: string | null;
    position: string | null;
    notes: string | null;
  }>;
  attendance: Array<{
    eventId: number;
    eventTitle: string;
    eventDate: string;
    playerId: number;
    playerName: string;
    status: string;
    reason: string | null;
    respondedAt: string | null;
    source: string;
  }>;
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

export function createGdprRequest(
  guardianId: number,
  type: "export" | "deletion",
  reason?: string
): GdprRequest {
  if (type !== "export" && type !== "deletion") {
    throw new Error(`Invalid GDPR request type: ${type}`);
  }

  const db = getDB();
  db.run(
    "INSERT INTO gdpr_requests (guardianId, type, reason) VALUES (?, ?, ?)",
    [guardianId, type, reason ?? null]
  );
  const id = getLastInsertId();
  const rows = rowsToObjects(db.exec("SELECT * FROM gdpr_requests WHERE id = ?", [id]));
  return rows[0] as unknown as GdprRequest;
}

export function listGdprRequests(status?: string): GdprRequest[] {
  const db = getDB();
  let sql = `SELECT r.*, g.name AS guardianName, g.phone AS guardianPhone
             FROM gdpr_requests r
             LEFT JOIN guardians g ON r.guardianId = g.id
             ORDER BY r.createdAt DESC`;
  const params: unknown[] = [];

  if (status) {
    sql = `SELECT r.*, g.name AS guardianName, g.phone AS guardianPhone
           FROM gdpr_requests r
           LEFT JOIN guardians g ON r.guardianId = g.id
           WHERE r.status = ?
           ORDER BY r.createdAt DESC`;
    params.push(status);
  }

  return rowsToObjects(db.exec(sql, params)) as unknown as GdprRequest[];
}

export function getGdprRequest(id: number): GdprRequest | null {
  const db = getDB();
  const rows = rowsToObjects(
    db.exec(
      `SELECT r.*, g.name AS guardianName, g.phone AS guardianPhone
       FROM gdpr_requests r
       LEFT JOIN guardians g ON r.guardianId = g.id
       WHERE r.id = ?`,
      [id]
    )
  );
  return rows.length > 0 ? (rows[0] as unknown as GdprRequest) : null;
}

export function approveRequest(requestId: number, adminId: number): GdprRequest {
  const req = getGdprRequest(requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is not pending");

  const db = getDB();
  db.run(
    "UPDATE gdpr_requests SET status = 'approved', processedBy = ?, processedAt = datetime('now') WHERE id = ?",
    [adminId, requestId]
  );
  return getGdprRequest(requestId)!;
}

export function rejectRequest(
  requestId: number,
  adminId: number,
  note?: string
): GdprRequest {
  const req = getGdprRequest(requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is not pending");

  const db = getDB();
  db.run(
    "UPDATE gdpr_requests SET status = 'rejected', processedBy = ?, processedAt = datetime('now'), adminNote = ? WHERE id = ?",
    [adminId, note ?? null, requestId]
  );
  return getGdprRequest(requestId)!;
}

export function updateConsent(guardianId: number, consent: boolean): void {
  const db = getDB();
  if (consent) {
    db.run(
      "UPDATE guardians SET consentGiven = 1, consentGivenAt = datetime('now'), consentWithdrawnAt = NULL WHERE id = ?",
      [guardianId]
    );
  } else {
    db.run(
      "UPDATE guardians SET consentGiven = 0, consentWithdrawnAt = datetime('now') WHERE id = ?",
      [guardianId]
    );
  }
}

export function executeDeletion(guardianId: number, requestId: number): void {
  const db = getDB();

  // Find all players linked to this guardian
  const playerRows = rowsToObjects(
    db.exec(
      "SELECT playerId FROM guardian_players WHERE guardianId = ?",
      [guardianId]
    )
  );

  // Anonymize each linked player (only if no other guardian is linked)
  for (const row of playerRows) {
    const playerId = row.playerId as number;
    const otherGuardians = rowsToObjects(
      db.exec(
        "SELECT guardianId FROM guardian_players WHERE playerId = ? AND guardianId != ?",
        [playerId, guardianId]
      )
    );

    if (otherGuardians.length === 0) {
      db.run(
        "UPDATE players SET name = 'Deleted Player', yearOfBirth = NULL, position = NULL, notes = NULL, category = NULL WHERE id = ?",
        [playerId]
      );
    }
  }

  // Remove guardian-player links
  db.run("DELETE FROM guardian_players WHERE guardianId = ?", [guardianId]);

  // Mark request as completed before deleting guardian
  db.run(
    "UPDATE gdpr_requests SET status = 'completed', completedAt = datetime('now') WHERE id = ?",
    [requestId]
  );

  // Delete the guardian record (temporarily disable FK checks to preserve audit trail)
  db.run("PRAGMA foreign_keys = OFF");
  db.run("DELETE FROM guardians WHERE id = ?", [guardianId]);
  db.run("PRAGMA foreign_keys = ON");
}

export function generateExport(guardianId: number): ExportData {
  const db = getDB();

  const guardianRows = rowsToObjects(
    db.exec(
      "SELECT id, phone, name, email, role, language, consentGiven, consentGivenAt, consentWithdrawnAt, createdAt FROM guardians WHERE id = ?",
      [guardianId]
    )
  );

  if (guardianRows.length === 0) {
    throw new Error("Guardian not found");
  }

  const guardian = guardianRows[0] as unknown as ExportData["guardian"];

  const players = rowsToObjects(
    db.exec(
      `SELECT p.id, p.name, p.yearOfBirth, p.category, p.position, p.notes
       FROM players p
       JOIN guardian_players gp ON p.id = gp.playerId
       WHERE gp.guardianId = ?`,
      [guardianId]
    )
  ) as unknown as ExportData["players"];

  const playerIds = players.map((p) => p.id);
  let attendance: ExportData["attendance"] = [];

  if (playerIds.length > 0) {
    const placeholders = playerIds.map(() => "?").join(",");
    attendance = rowsToObjects(
      db.exec(
        `SELECT a.eventId, e.title AS eventTitle, e.date AS eventDate,
                a.playerId, p.name AS playerName, a.status, a.reason, a.respondedAt, a.source
         FROM attendance a
         JOIN events e ON a.eventId = e.id
         JOIN players p ON a.playerId = p.id
         WHERE a.playerId IN (${placeholders})
         ORDER BY e.date DESC`,
        playerIds
      )
    ) as unknown as ExportData["attendance"];
  }

  return { guardian, players, attendance };
}
