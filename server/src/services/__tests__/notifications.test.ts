import { describe, it, expect, beforeEach } from "vitest";
import { initDB } from "../../database.js";
import {
  createNotification,
  getUnreadNotifications,
  markAsRead,
} from "../notifications.js";
import type { Database } from "sql.js";

let db: Database;

describe("notifications service", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it("should create a notification", () => {
    const notification = createNotification({
      userId: 1,
      eventId: null,
      type: "info",
      message: "Welcome!",
    });

    expect(notification).toHaveProperty("id");
    expect(notification.userId).toBe(1);
    expect(notification.eventId).toBeNull();
    expect(notification.type).toBe("info");
    expect(notification.message).toBe("Welcome!");
    expect(notification.read).toBe(0);
    expect(notification.createdAt).toBeDefined();
  });

  it("should list unread notifications for a user", () => {
    createNotification({ userId: 1, type: "info", message: "Msg 1" });
    createNotification({ userId: 1, type: "alert", message: "Msg 2" });
    createNotification({ userId: 2, type: "info", message: "Other user" });

    const unread = getUnreadNotifications(1);
    expect(unread).toHaveLength(2);
    expect(unread.every((n) => n.userId === 1)).toBe(true);
    expect(unread.every((n) => n.read === 0)).toBe(true);
  });

  it("should mark notification as read", () => {
    const notification = createNotification({
      userId: 1,
      type: "info",
      message: "Read me",
    });

    markAsRead(notification.id);

    const unread = getUnreadNotifications(1);
    expect(unread).toHaveLength(0);

    // Verify the notification is now read in the DB
    const rows = db.exec("SELECT read FROM notifications WHERE id = ?", [
      notification.id,
    ]);
    expect(rows[0].values[0][0]).toBe(1);
  });
});
