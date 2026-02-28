import { getDB } from "../database.js";

export interface FeedItem {
  id: number;
  type: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  location: string | null;
  categoryRequirement: string | null;
  createdAt: string;
  placement: number | null;
  totalTeams: number | null;
  trophySummary: string | null;
  resultsUrl: string | null;
  achievements: { type: string; label: string }[];
}

export interface FeedQuery {
  type?: "training" | "tournament" | "match";
  limit?: number;
}

function buildQuery(join: "LEFT" | "INNER", query?: FeedQuery): { sql: string; params: unknown[] } {
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);

  let sql = `SELECT e.id, e.type, e.title, e.description, e.date, e.startTime,
             e.location, e.categoryRequirement, e.createdAt,
             tr.placement, tr.totalTeams, tr.summary AS trophySummary,
             tr.resultsUrl, tr.achievements
             FROM events e
             ${join} JOIN tournament_results tr ON tr.eventId = e.id`;
  const params: unknown[] = [];

  if (query?.type) {
    sql += " WHERE e.type = ?";
    params.push(query.type);
  }

  sql += " ORDER BY e.date DESC LIMIT ?";
  params.push(limit);

  return { sql, params };
}

function rowToFeedItem(columns: string[], row: unknown[]): FeedItem {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return {
    id: obj.id as number,
    type: obj.type as string,
    title: obj.title as string,
    description: (obj.description as string) ?? null,
    date: obj.date as string,
    startTime: (obj.startTime as string) ?? null,
    location: (obj.location as string) ?? null,
    categoryRequirement: (obj.categoryRequirement as string) ?? null,
    createdAt: obj.createdAt as string,
    placement: (obj.placement as number) ?? null,
    totalTeams: (obj.totalTeams as number) ?? null,
    trophySummary: (obj.trophySummary as string) ?? null,
    resultsUrl: (obj.resultsUrl as string) ?? null,
    achievements: JSON.parse((obj.achievements as string) || "[]"),
  };
}

export function getFeedItems(query?: FeedQuery): FeedItem[] {
  const db = getDB();
  const { sql, params } = buildQuery("LEFT", query);
  const result = db.exec(sql, params as import("sql.js").SqlValue[]);
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToFeedItem(columns, row));
}

export function getTrophyFeedItems(limit?: number): FeedItem[] {
  const db = getDB();
  const { sql, params } = buildQuery("INNER", { limit });
  const result = db.exec(sql, params as import("sql.js").SqlValue[]);
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToFeedItem(columns, row));
}
