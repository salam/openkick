import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { hashPassword, generateJWT } from "../auth.js";
import { sendEmail } from "../services/email.js";

export const authRouter = Router();

// GET /api/setup/status — check whether initial admin setup is needed
authRouter.get("/setup/status", (_req: Request, res: Response) => {
  const db = getDB();
  const result = db.exec(
    "SELECT COUNT(*) FROM guardians WHERE role IN ('admin', 'coach')",
  );
  const count = (result[0]?.values[0]?.[0] as number) ?? 0;
  res.json({ needsSetup: count === 0 });
});

// POST /api/setup — create the first admin account (one-time)
authRouter.post("/setup", async (req: Request, res: Response) => {
  const db = getDB();

  // Guard: only allow if no admin/coach exists yet
  const result = db.exec(
    "SELECT COUNT(*) FROM guardians WHERE role IN ('admin', 'coach')",
  );
  const count = (result[0]?.values[0]?.[0] as number) ?? 0;
  if (count > 0) {
    res.status(409).json({ error: "Setup already complete" });
    return;
  }

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email, and password are required" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const passwordHash = await hashPassword(password);

  // Use email as the phone value (phone is UNIQUE NOT NULL; admins have no phone)
  db.run(
    "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, 'admin')",
    [email, name, email, passwordHash],
  );

  const idResult = db.exec("SELECT last_insert_rowid()");
  const id = idResult[0].values[0][0] as number;

  const token = generateJWT({ id, role: "admin" });
  res.status(201).json({ token });
});

// POST /api/auth/forgot-password — request a password reset email
authRouter.post(
  "/auth/forgot-password",
  async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const db = getDB();
    const result = db.exec(
      "SELECT id FROM guardians WHERE email = ? AND role IN ('admin', 'coach')",
      [email],
    );

    if (result.length > 0 && result[0].values.length > 0) {
      const guardianId = result[0].values[0][0] as number;

      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(
        Date.now() + 60 * 60 * 1000,
      ).toISOString();

      db.run(
        "UPDATE guardians SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?",
        [resetToken, resetTokenExpiry, guardianId],
      );

      const baseUrl =
        process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
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
    }

    // Always return 204 to prevent email enumeration
    res.status(204).send();
  },
);

// POST /api/auth/reset-password — reset password using a valid token
authRouter.post(
  "/auth/reset-password",
  async (req: Request, res: Response) => {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: "token and password are required" });
      return;
    }

    if (password.length < 8) {
      res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
      return;
    }

    const db = getDB();
    const result = db.exec(
      "SELECT id, role, resetTokenExpiry FROM guardians WHERE resetToken = ? AND role IN ('admin', 'coach')",
      [token],
    );

    if (result.length === 0 || result[0].values.length === 0) {
      res.status(400).json({ error: "Invalid or expired token" });
      return;
    }

    const [id, role, expiry] = result[0].values[0] as [
      number,
      string,
      string,
    ];

    if (new Date(expiry) < new Date()) {
      res.status(400).json({ error: "Invalid or expired token" });
      return;
    }

    const passwordHash = await hashPassword(password);
    db.run(
      "UPDATE guardians SET passwordHash = ?, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ?",
      [passwordHash, id],
    );

    const jwt = generateJWT({ id, role });
    res.json({ token: jwt });
  },
);
