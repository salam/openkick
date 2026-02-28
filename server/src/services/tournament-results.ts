import { getDB, getLastInsertId } from "../database.js";

// ── Types ───────────────────────────────────────────────────────────

export interface Achievement {
  type: string;
  label: string;
}

export interface TournamentResult {
  id: number;
  eventId: number;
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  resultsUrl: string | null;
  achievements: Achievement[];
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResultsInput {
  placement?: number | null;
  totalTeams?: number | null;
  summary?: string | null;
  resultsUrl?: string | null;
  achievements?: Achievement[];
  createdBy?: number | null;
}

// ── Constants ───────────────────────────────────────────────────────

const VALID_EVENT_TYPES = ["tournament", "match", "friendly"];

const VALID_ACHIEVEMENT_TYPES = [
  "1st_place",
  "2nd_place",
  "3rd_place",
  "fair_play",
  "best_player",
  "custom",
];

// ── Helpers ─────────────────────────────────────────────────────────

function rowToResult(
  columns: string[],
  row: unknown[],
): TournamentResult {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return {
    id: obj.id as number,
    eventId: obj.eventId as number,
    placement: (obj.placement as number) ?? null,
    totalTeams: (obj.totalTeams as number) ?? null,
    summary: (obj.summary as string) ?? null,
    resultsUrl: (obj.resultsUrl as string) ?? null,
    achievements: JSON.parse((obj.achievements as string) || "[]"),
    createdBy: (obj.createdBy as number) ?? null,
    createdAt: obj.createdAt as string,
    updatedAt: obj.updatedAt as string,
  };
}

function validateInput(input: CreateResultsInput): void {
  if (input.placement != null) {
    if (!Number.isInteger(input.placement) || input.placement < 1) {
      throw new Error("placement must be a positive integer");
    }
  }
  if (
    input.placement != null &&
    input.totalTeams != null &&
    input.placement > input.totalTeams
  ) {
    throw new Error("placement must be <= totalTeams");
  }
  if (input.achievements) {
    for (const a of input.achievements) {
      if (!VALID_ACHIEVEMENT_TYPES.includes(a.type)) {
        throw new Error(`Invalid achievement type: ${a.type}`);
      }
    }
  }
}

function validateEventType(eventId: number): void {
  const db = getDB();
  const result = db.exec("SELECT type FROM events WHERE id = ?", [eventId]);
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error("Event not found");
  }
  const eventType = result[0].values[0][0] as string;
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw new Error(
      `Results can only be added to events of type: ${VALID_EVENT_TYPES.join(", ")}. Got: ${eventType}`,
    );
  }
}

// ── CRUD ────────────────────────────────────────────────────────────

export function getResults(eventId: number): TournamentResult | null {
  const db = getDB();
  const result = db.exec(
    "SELECT * FROM tournament_results WHERE eventId = ?",
    [eventId],
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  return rowToResult(result[0].columns, result[0].values[0]);
}

export function createResults(
  eventId: number,
  input: CreateResultsInput,
): TournamentResult {
  validateEventType(eventId);
  validateInput(input);

  const db = getDB();
  const achievements = JSON.stringify(input.achievements ?? []);

  db.run(
    `INSERT INTO tournament_results
       (eventId, placement, totalTeams, summary, resultsUrl, achievements, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      input.placement ?? null,
      input.totalTeams ?? null,
      input.summary ?? null,
      input.resultsUrl ?? null,
      achievements,
      input.createdBy ?? null,
    ],
  );

  const id = getLastInsertId();
  const row = db.exec("SELECT * FROM tournament_results WHERE id = ?", [id]);
  return rowToResult(row[0].columns, row[0].values[0]);
}

export function updateResults(
  eventId: number,
  input: Partial<CreateResultsInput>,
): TournamentResult | null {
  const existing = getResults(eventId);
  if (!existing) return null;

  // Merge input with existing values
  const merged: CreateResultsInput = {
    placement:
      input.placement !== undefined ? input.placement : existing.placement,
    totalTeams:
      input.totalTeams !== undefined ? input.totalTeams : existing.totalTeams,
    summary: input.summary !== undefined ? input.summary : existing.summary,
    resultsUrl:
      input.resultsUrl !== undefined ? input.resultsUrl : existing.resultsUrl,
    achievements:
      input.achievements !== undefined
        ? input.achievements
        : existing.achievements,
    createdBy:
      input.createdBy !== undefined ? input.createdBy : existing.createdBy,
  };

  validateInput(merged);

  const db = getDB();
  const achievements = JSON.stringify(merged.achievements ?? []);

  db.run(
    `UPDATE tournament_results
     SET placement = ?, totalTeams = ?, summary = ?, resultsUrl = ?,
         achievements = ?, createdBy = ?, updatedAt = datetime('now')
     WHERE eventId = ?`,
    [
      merged.placement ?? null,
      merged.totalTeams ?? null,
      merged.summary ?? null,
      merged.resultsUrl ?? null,
      achievements,
      merged.createdBy ?? null,
      eventId,
    ],
  );

  return getResults(eventId);
}

export function deleteResults(eventId: number): void {
  const db = getDB();
  db.run("DELETE FROM tournament_results WHERE eventId = ?", [eventId]);
}

// ── Trophy Cabinet ──────────────────────────────────────────────────

export interface TrophyCabinetEntry {
  id: number;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  eventType: string;
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  resultsUrl: string | null;
  achievements: Achievement[];
}

export function getTrophyCabinet(limit = 50, offset = 0): TrophyCabinetEntry[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT tr.id, tr.eventId, e.title, e.date, e.type,
            tr.placement, tr.totalTeams, tr.summary, tr.resultsUrl, tr.achievements
     FROM tournament_results tr
     JOIN events e ON tr.eventId = e.id
     ORDER BY e.date DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    id: row[0] as number,
    eventId: row[1] as number,
    eventTitle: row[2] as string,
    eventDate: row[3] as string,
    eventType: row[4] as string,
    placement: row[5] as number | null,
    totalTeams: row[6] as number | null,
    summary: row[7] as string | null,
    resultsUrl: row[8] as string | null,
    achievements: JSON.parse((row[9] as string) || "[]"),
  }));
}
