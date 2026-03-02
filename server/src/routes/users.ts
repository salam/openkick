import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { getDB, getLastInsertId } from "../database.js";
import { authMiddleware, requireRole, verifyPassword } from "../auth.js";
import { sendEmail, buildInviteEmail, buildResetEmail } from "../services/email.js";
import { checkAdminPassword } from "../services/password-check.service.js";
import { normalizePhone } from "../utils/phone.js";

export const usersRouter = Router();

// List all coaches and admins
usersRouter.get(
  "/users",
  authMiddleware,
  requireRole("admin", "coach"),
  (_req: Request, res: Response) => {
    const db = getDB();
    const result = db.exec(
      "SELECT id, name, email, phone, role, passwordHash, createdAt FROM guardians WHERE role IN ('admin', 'coach') ORDER BY createdAt ASC",
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
      // Expose whether a password is set, not the hash itself
      obj.hasPassword = !!obj.passwordHash;
      delete obj.passwordHash;
      // Hide the phone hack: if phone === email, don't expose it
      if (obj.phone === obj.email) {
        delete obj.phone;
      }
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

// normalizePhone is imported from ../utils/phone.js

// PUT /api/users/:id/phone — admin updates a user's phone number
usersRouter.put(
  "/users/:id/phone",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const { phone } = req.body;
    const targetId = Number(req.params.id);

    if (!phone || typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ error: "phone is required" });
      return;
    }

    const normalized = normalizePhone(phone);

    const db = getDB();

    // Check user exists
    const target = db.exec(
      "SELECT id FROM guardians WHERE id = ? AND role IN ('admin', 'coach')",
      [targetId],
    );
    if (target.length === 0 || target[0].values.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check phone not taken by another user
    const existing = db.exec(
      "SELECT id FROM guardians WHERE phone = ? AND id != ?",
      [normalized, targetId],
    );
    if (existing.length > 0 && existing[0].values.length > 0) {
      res.status(409).json({ error: "This phone number is already in use" });
      return;
    }

    db.run("UPDATE guardians SET phone = ? WHERE id = ?", [
      normalized,
      targetId,
    ]);
    res.json({ id: targetId, phone: normalized });
  },
);

// POST /api/users/invite — invite a new coach or admin
usersRouter.post(
  "/users/invite",
  authMiddleware,
  requireRole("admin", "coach"),
  async (req: Request, res: Response) => {
    const { name, email, role, phone } = req.body;

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

    // Normalize phone: strip spaces, leading + and 00 prefix
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    const db = getDB();

    // Check for duplicate email and phone
    if (normalizedPhone) {
      const existing = db.exec(
        "SELECT id FROM guardians WHERE email = ? OR phone = ? OR phone = ?",
        [email, email, normalizedPhone],
      );
      if (existing.length > 0 && existing[0].values.length > 0) {
        res
          .status(409)
          .json({ error: "A user with this email or phone already exists" });
        return;
      }
    } else {
      const existing = db.exec(
        "SELECT id FROM guardians WHERE email = ? OR phone = ?",
        [email, email],
      );
      if (existing.length > 0 && existing[0].values.length > 0) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();

    const phoneValue = normalizedPhone || email;

    db.run(
      "INSERT INTO guardians (phone, name, email, role, resetToken, resetTokenExpiry) VALUES (?, ?, ?, ?, ?, ?)",
      [phoneValue, name, email, role, resetToken, resetTokenExpiry],
    );

    const id = getLastInsertId();

    const baseUrl =
      process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${resetToken}/`;

    try {
      const langRow = db.exec("SELECT value FROM settings WHERE key = 'bot_language'");
      const lang = (langRow[0]?.values[0]?.[0] as string) || "de";
      const { subject, html } = buildInviteEmail(name, role, resetUrl, lang);
      await sendEmail(email, subject, html);
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
      const langRow = db.exec("SELECT value FROM settings WHERE key = 'bot_language'");
      const lang = (langRow[0]?.values[0]?.[0] as string) || "de";
      const { subject, html } = buildResetEmail(resetUrl, lang);
      await sendEmail(email, subject, html);
    } catch (err) {
      console.error("Failed to send password reset email:", err);
    }

    res.status(204).send();
  },
);

// POST /api/users/check-password — current user checks their own password strength + HIBP
usersRouter.post(
  "/users/check-password",
  authMiddleware,
  requireRole("admin", "coach"),
  async (req: Request, res: Response) => {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: "password is required" });
      return;
    }

    const db = getDB();
    const result = db.exec(
      "SELECT passwordHash FROM guardians WHERE id = ?",
      [req.user!.id],
    );

    if (result.length === 0 || result[0].values.length === 0 || !result[0].values[0][0]) {
      res.status(400).json({ error: "No password set" });
      return;
    }

    const hash = result[0].values[0][0] as string;
    const valid = await verifyPassword(password, hash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }

    const check = await checkAdminPassword(password);
    res.json({
      acceptable: check.acceptable,
      reasons: check.reasons,
      zxcvbnScore: check.zxcvbnScore,
      pwnedCount: check.pwnedCount,
    });
  },
);
