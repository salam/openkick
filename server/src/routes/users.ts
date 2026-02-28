import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";

export const usersRouter = Router();

// List all coaches and admins
usersRouter.get(
  "/users",
  authMiddleware,
  requireRole("admin", "coach"),
  (_req: Request, res: Response) => {
    const db = getDB();
    const result = db.exec(
      "SELECT id, name, email, role, createdAt FROM guardians WHERE role IN ('admin', 'coach') ORDER BY createdAt ASC",
    );

    if (result.length === 0) {
      res.json([]);
      return;
    }

    const cols = result[0].columns;
    const rows = result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });

    res.json(rows);
  },
);
