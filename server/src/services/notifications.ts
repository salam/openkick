import { getDB, getLastInsertId } from "../database.js";

export interface Notification {
  id: number;
  userId: number | null;
  eventId: number | null;
  type: string;
  message: string;
  read: number;
  createdAt: string;
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

export function createNotification({
  userId,
  eventId,
  type,
  message,
}: {
  userId?: number | null;
  eventId?: number | null;
  type: string;
  message: string;
}): Notification {
  const db = getDB();
  db.run(
    "INSERT INTO notifications (userId, eventId, type, message) VALUES (?, ?, ?, ?)",
    [userId ?? null, eventId ?? null, type, message],
  );
  const id = getLastInsertId();
  const rows = rowsToObjects(
    db.exec("SELECT * FROM notifications WHERE id = ?", [id]),
  );
  return rows[0] as unknown as Notification;
}

export function getUnreadNotifications(userId: number): Notification[] {
  const db = getDB();
  const rows = rowsToObjects(
    db.exec(
      "SELECT * FROM notifications WHERE userId = ? AND read = 0 ORDER BY createdAt DESC",
      [userId],
    ),
  );
  return rows as unknown as Notification[];
}

export function markAsRead(id: number): void {
  const db = getDB();
  db.run("UPDATE notifications SET read = 1 WHERE id = ?", [id]);
}
