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

// PUT /api/users/:id/role — admin changes a user's role
usersRouter.put(
  "/users/:id/role",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const { role } = req.body;
    const targetId = Number(req.params.id);

    if (!role || !["admin", "coach"].includes(role)) {
      res.status(400).json({ error: "role must be 'admin' or 'coach'" });
      return;
    }

    const db = getDB();

    const target = db.exec(
      "SELECT id, role FROM guardians WHERE id = ? AND role IN ('admin', 'coach')",
      [targetId],
    );
    if (target.length === 0 || target[0].values.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentRole = target[0].values[0][1] as string;

    if (currentRole === "admin" && role === "coach") {
      const adminCount = db.exec(
        "SELECT COUNT(*) FROM guardians WHERE role = 'admin'",
      );
      const count = adminCount[0].values[0][0] as number;
      if (count <= 1) {
        res.status(409).json({ error: "Cannot demote the last admin" });
        return;
      }
    }

    db.run("UPDATE guardians SET role = ? WHERE id = ?", [role, targetId]);
    res.json({ id: targetId, role });
  },
);
