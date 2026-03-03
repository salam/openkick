import { Router, type Request, type Response } from "express";
import { authMiddleware, requireRole } from "../auth.js";
import { getUnreadNotifications, markAsRead } from "../services/notifications.js";

export const notificationsRouter = Router();

// GET /api/notifications — return all unread notifications
notificationsRouter.get("/notifications", authMiddleware, (_req: Request, res: Response) => {
  // For now, return all unread notifications (no user context in simple auth)
  // Once auth middleware provides req.user, filter by userId
  const { userId } = _req.query;
  const uid = userId ? Number(userId) : 0;
  const notifications = getUnreadNotifications(uid);
  res.json(notifications);
});

// PUT /api/notifications/:id/read — mark a notification as read
notificationsRouter.put("/notifications/:id/read", authMiddleware, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  markAsRead(id);
  res.json({ success: true });
});
