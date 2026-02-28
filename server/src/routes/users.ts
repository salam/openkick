import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";
import { sendEmail } from "../services/email.js";

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

// POST /api/users/invite — invite a new coach or admin
usersRouter.post(
  "/users/invite",
  authMiddleware,
  requireRole("admin", "coach"),
  async (req: Request, res: Response) => {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      res.status(400).json({ error: "name, email, and role are required" });
      return;
    }

    if (!["admin", "coach"].includes(role)) {
      res.status(400).json({ error: "role must be 'admin' or 'coach'" });
      return;
    }

    // Coaches can only invite coaches
    if (req.user!.role === "coach" && role === "admin") {
      res.status(403).json({ error: "Coaches can only invite other coaches" });
      return;
    }

    const db = getDB();

    // Check for duplicate email (phone column stores email for coaches/admins)
    const existing = db.exec(
      "SELECT id FROM guardians WHERE email = ? OR phone = ?",
      [email, email],
    );
    if (existing.length > 0 && existing[0].values.length > 0) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();

    db.run(
      "INSERT INTO guardians (phone, name, email, role, resetToken, resetTokenExpiry) VALUES (?, ?, ?, ?, ?, ?)",
      [email, name, email, role, resetToken, resetTokenExpiry],
    );

    const idResult = db.exec("SELECT last_insert_rowid()");
    const id = idResult[0].values[0][0] as number;

    const baseUrl =
      process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${resetToken}/`;

    try {
      await sendEmail(
        email,
        "You've been invited to OpenKick",
        `<p>Hi ${name},</p><p>You've been invited as a ${role}. Click <a href="${resetUrl}">here</a> to set your password and get started.</p>`,
      );
    } catch (err) {
      console.error("Failed to send invite email:", err);
    }

    res.status(201).json({ id, name, email, role });
  },
);

// POST /api/users/:id/reset-password — admin triggers password reset email
usersRouter.post(
  "/users/:id/reset-password",
  authMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const db = getDB();

    const result = db.exec(
      "SELECT id, email FROM guardians WHERE id = ? AND role IN ('admin', 'coach')",
      [targetId],
    );

    if (result.length === 0 || result[0].values.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const email = result[0].values[0][1] as string;
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.run(
      "UPDATE guardians SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?",
      [resetToken, resetTokenExpiry, targetId],
    );

    const baseUrl = process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${resetToken}/`;

    try {
      await sendEmail(
        email,
        "Password Reset",
        `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
      );
    } catch (err) {
      console.error("Failed to send password reset email:", err);
    }

    res.status(204).send();
  },
);
