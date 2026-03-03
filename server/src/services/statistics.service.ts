import type { SqlValue } from "sql.js";
import { getDB } from "../database.js";
import { getSemesterBounds, getSchoolYearBounds } from "../utils/semester.js";
import type { StatsPeriod } from "../utils/semester.js";

export type { StatsPeriod };

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TrainingHoursResult {
  teamName: string | null;
  period: StatsPeriod;
  trainingHours: number;
  sessionCount: number;
}

export interface PersonHoursResult {
  teamName: string | null;
  period: StatsPeriod;
  personHours: number;
}

export interface CoachHoursResult {
  coachId: number;
  coachName: string;
  period: StatsPeriod;
  coachHours: number;
  sessionCount: number;
}

export interface NoShowResult {
  entityType: "player";
  entityId: number;
  entityLabel: string;
  period: StatsPeriod;
  noShowCount: number;
  registeredCount: number;
  noShowRate: number;
}

export interface AttendanceRateResult {
  entityType: "player";
  entityId: number;
  entityLabel: string;
  period: StatsPeriod;
  attendedCount: number;
  totalSessions: number;
  attendanceRate: number;
}

export interface TournamentParticipationResult {
  entityType: "player";
  entityId: number;
  entityLabel: string;
  period: StatsPeriod;
  tournamentCount: number;
}

export interface HomepageStats {
  lifetimeAthletes: number;
  activeAthletes: number;
  tournamentsPlayed: number;
  trophiesWon: number;
  trainingSessionsThisSeason: number;
  activeCoaches: number;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Safe division -- returns 0 when the denominator is 0 */
function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

export function getTrainingHours(
  period: StatsPeriod,
  team?: string,
): TrainingHoursResult[] {
  const db = getDB();

  let sql = `
    SELECT
      e.categoryRequirement AS teamCategory,
      COUNT(*) AS sessionCount,
      SUM(
        CASE
          WHEN ts.startTime IS NOT NULL AND ts.endTime IS NOT NULL
          THEN (strftime('%s', '2000-01-01 ' || ts.endTime) - strftime('%s', '2000-01-01 ' || ts.startTime)) / 60.0
          ELSE 90
        END
      ) / 60.0 AS trainingHours
    FROM events e
    LEFT JOIN training_schedule ts
      ON ts.dayOfWeek = CAST(strftime('%w', e.date) AS INTEGER)
      AND ts.startTime = e.startTime
    WHERE e.type = 'training'
      AND e.date BETWEEN ? AND ?
  `;

  const params: SqlValue[] = [period.start, period.end];

  if (team) {
    sql += " AND e.categoryRequirement = ?";
    params.push(team);
  }

  sql += " GROUP BY e.categoryRequirement";

  const rows = rowsToObjects(db.exec(sql, params));

  return rows.map((r) => ({
    teamName: (r.teamCategory as string) ?? null,
    period,
    trainingHours: Number(r.trainingHours) || 0,
    sessionCount: Number(r.sessionCount) || 0,
  }));
}

export function getPersonHours(
  period: StatsPeriod,
  team?: string,
): PersonHoursResult[] {
  const db = getDB();

  let sql = `
    SELECT
      e.categoryRequirement AS teamCategory,
      SUM(
        COALESCE(att_count.cnt, 0) *
        CASE
          WHEN ts.startTime IS NOT NULL AND ts.endTime IS NOT NULL
          THEN (strftime('%s', '2000-01-01 ' || ts.endTime) - strftime('%s', '2000-01-01 ' || ts.startTime)) / 60.0
          ELSE 90
        END
      ) / 60.0 AS personHours
    FROM events e
    LEFT JOIN training_schedule ts
      ON ts.dayOfWeek = CAST(strftime('%w', e.date) AS INTEGER)
      AND ts.startTime = e.startTime
    LEFT JOIN (
      SELECT eventId, COUNT(*) AS cnt
      FROM attendance
      WHERE status = 'attending'
      GROUP BY eventId
    ) att_count ON att_count.eventId = e.id
    WHERE e.type = 'training'
      AND e.date BETWEEN ? AND ?
  `;

  const params: SqlValue[] = [period.start, period.end];

  if (team) {
    sql += " AND e.categoryRequirement = ?";
    params.push(team);
  }

  sql += " GROUP BY e.categoryRequirement";

  const rows = rowsToObjects(db.exec(sql, params));

  return rows.map((r) => ({
    teamName: (r.teamCategory as string) ?? null,
    period,
    personHours: Number(r.personHours) || 0,
  }));
}

export function getCoachHours(
  period: StatsPeriod,
  coachId?: number,
): CoachHoursResult[] {
  const db = getDB();

  let sql = `
    SELECT
      g.id AS coachId,
      g.name AS coachName,
      COUNT(*) AS sessionCount,
      SUM(
        CASE
          WHEN ts.startTime IS NOT NULL AND ts.endTime IS NOT NULL
          THEN (strftime('%s', '2000-01-01 ' || ts.endTime) - strftime('%s', '2000-01-01 ' || ts.startTime)) / 60.0
          ELSE 90
        END
      ) / 60.0 AS coachHours
    FROM events e
    JOIN guardians g ON g.id = e.createdBy
    LEFT JOIN training_schedule ts
      ON ts.dayOfWeek = CAST(strftime('%w', e.date) AS INTEGER)
      AND ts.startTime = e.startTime
    WHERE e.type = 'training'
      AND g.role IN ('coach', 'admin')
      AND e.date BETWEEN ? AND ?
  `;

  const params: SqlValue[] = [period.start, period.end];

  if (coachId !== undefined) {
    sql += " AND g.id = ?";
    params.push(coachId);
  }

  sql += " GROUP BY g.id";

  const rows = rowsToObjects(db.exec(sql, params));

  return rows.map((r) => ({
    coachId: Number(r.coachId),
    coachName: (r.coachName as string) ?? "",
    period,
    coachHours: Number(r.coachHours) || 0,
    sessionCount: Number(r.sessionCount) || 0,
  }));
}

export function getNoShows(
  period: StatsPeriod,
  team?: string,
): NoShowResult[] {
  const db = getDB();

  let sql = `
    SELECT
      a.playerId,
      p.name AS playerLabel,
      COUNT(*) AS registeredCount,
      SUM(CASE WHEN a.status = 'unknown' OR (a.status = 'absent' AND a.reason IS NULL) THEN 1 ELSE 0 END) AS noShowCount
    FROM attendance a
    JOIN players p ON p.id = a.playerId
    JOIN events e ON e.id = a.eventId
    WHERE e.type = 'training'
      AND e.date BETWEEN ? AND ?
      AND e.date < date('now')
  `;

  const params: SqlValue[] = [period.start, period.end];

  if (team) {
    sql += " AND e.categoryRequirement = ?";
    params.push(team);
  }

  sql += " GROUP BY a.playerId";

  const rows = rowsToObjects(db.exec(sql, params));

  return rows.map((r) => {
    const noShowCount = Number(r.noShowCount) || 0;
    const registeredCount = Number(r.registeredCount) || 0;
    return {
      entityType: "player" as const,
      entityId: Number(r.playerId),
      entityLabel: (r.playerLabel as string) ?? "",
      period,
      noShowCount,
      registeredCount,
      noShowRate: safeDiv(noShowCount, registeredCount),
    };
  });
}

export function getAttendanceRate(
  period: StatsPeriod,
  team?: string,
): AttendanceRateResult[] {
  const db = getDB();

  let sql = `
    SELECT
      a.playerId,
      p.name AS playerLabel,
      COUNT(*) AS totalSessions,
      SUM(CASE WHEN a.status = 'attending' THEN 1 ELSE 0 END) AS attendedCount
    FROM attendance a
    JOIN players p ON p.id = a.playerId
    JOIN events e ON e.id = a.eventId
    WHERE e.type = 'training'
      AND e.date BETWEEN ? AND ?
  `;

  const params: SqlValue[] = [period.start, period.end];

  if (team) {
    sql += " AND e.categoryRequirement = ?";
    params.push(team);
  }

  sql += " GROUP BY a.playerId";

  const rows = rowsToObjects(db.exec(sql, params));

  return rows.map((r) => {
    const attendedCount = Number(r.attendedCount) || 0;
    const totalSessions = Number(r.totalSessions) || 0;
    return {
      entityType: "player" as const,
      entityId: Number(r.playerId),
      entityLabel: (r.playerLabel as string) ?? "",
      period,
      attendedCount,
      totalSessions,
      attendanceRate: safeDiv(attendedCount, totalSessions),
    };
  });
}

export function getTournamentParticipation(
  period: StatsPeriod,
): TournamentParticipationResult[] {
  const db = getDB();

  const sql = `
    SELECT
      tp.playerId,
      p.name AS playerLabel,
      COUNT(DISTINCT t.eventId) AS tournamentCount
    FROM team_players tp
    JOIN teams t ON t.id = tp.teamId
    JOIN events e ON e.id = t.eventId
    JOIN players p ON p.id = tp.playerId
    WHERE e.type = 'tournament'
      AND e.date BETWEEN ? AND ?
    GROUP BY tp.playerId
  `;

  const rows = rowsToObjects(db.exec(sql, [period.start, period.end]));

  return rows.map((r) => ({
    entityType: "player" as const,
    entityId: Number(r.playerId),
    entityLabel: (r.playerLabel as string) ?? "",
    period,
    tournamentCount: Number(r.tournamentCount) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Homepage stats with 1-hour TTL cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _homepageCache: HomepageStats | null = null;
let _homepageCacheTime = 0;

export function invalidateHomepageStatsCache(): void {
  _homepageCache = null;
  _homepageCacheTime = 0;
}

export function getHomepageStats(): HomepageStats {
  const now = Date.now();

  if (_homepageCache && now - _homepageCacheTime < CACHE_TTL_MS) {
    return _homepageCache;
  }

  const db = getDB();

  const currentSemester = getSemesterBounds(new Date());
  const schoolYear = getSchoolYearBounds(new Date());

  // Lifetime athletes: distinct players who ever had attendance
  const lifetimeRows = db.exec(
    "SELECT COUNT(DISTINCT playerId) AS cnt FROM attendance",
  );
  const lifetimeAthletes =
    (lifetimeRows[0]?.values[0]?.[0] as number) ?? 0;

  // Active athletes: attending in current semester
  const activeRows = db.exec(
    `SELECT COUNT(DISTINCT a.playerId) AS cnt
     FROM attendance a
     JOIN events e ON e.id = a.eventId
     WHERE a.status = 'attending'
       AND e.date BETWEEN ? AND ?`,
    [currentSemester.start, currentSemester.end],
  );
  const activeAthletes =
    (activeRows[0]?.values[0]?.[0] as number) ?? 0;

  // Tournaments played
  const tournamentRows = db.exec(
    "SELECT COUNT(DISTINCT id) AS cnt FROM events WHERE type = 'tournament'",
  );
  const tournamentsPlayed =
    (tournamentRows[0]?.values[0]?.[0] as number) ?? 0;

  // Trophies won (count from tournament_results, the authoritative source)
  const trophyRows = db.exec(
    "SELECT COUNT(*) AS cnt FROM tournament_results",
  );
  const trophiesWon =
    (trophyRows[0]?.values[0]?.[0] as number) ?? 0;

  // Training sessions this school year
  const trainingRows = db.exec(
    `SELECT COUNT(*) AS cnt FROM events
     WHERE type = 'training'
       AND date BETWEEN ? AND ?`,
    [schoolYear.start, schoolYear.end],
  );
  const trainingSessionsThisSeason =
    (trainingRows[0]?.values[0]?.[0] as number) ?? 0;

  // Active coaches: distinct coaches who created events in current semester
  const coachRows = db.exec(
    `SELECT COUNT(DISTINCT e.createdBy) AS cnt
     FROM events e
     JOIN guardians g ON g.id = e.createdBy
     WHERE g.role IN ('coach', 'admin')
       AND e.date BETWEEN ? AND ?`,
    [currentSemester.start, currentSemester.end],
  );
  const activeCoaches =
    (coachRows[0]?.values[0]?.[0] as number) ?? 0;

  const stats: HomepageStats = {
    lifetimeAthletes,
    activeAthletes,
    tournamentsPlayed,
    trophiesWon,
    trainingSessionsThisSeason,
    activeCoaches,
    computedAt: new Date().toISOString(),
  };

  _homepageCache = stats;
  _homepageCacheTime = now;

  return stats;
}
