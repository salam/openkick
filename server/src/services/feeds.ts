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
}

export interface FeedQuery {
  type?: "training" | "tournament" | "match";
  limit?: number;
}

export function getFeedItems(query?: FeedQuery): FeedItem[] {
  const db = getDB();
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);

  let sql = `SELECT id, type, title, description, date, startTime, location,
             categoryRequirement, createdAt FROM events`;
  const params: unknown[] = [];

  if (query?.type) {
    sql += " WHERE type = ?";
    params.push(query.type);
  }

  sql += " ORDER BY date DESC LIMIT ?";
  params.push(limit);

  const result = db.exec(sql, params as import("sql.js").SqlValue[]);
  if (result.length === 0) return [];

  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as unknown as FeedItem;
  });
}
