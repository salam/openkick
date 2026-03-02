import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getDB, getLastInsertId } from "../database.js";
import { hashPassword, generateJWT } from "../auth.js";
import { sendEmail, buildResetEmail } from "../services/email.js";
import { checkAdminPassword } from "../services/password-check.service.js";

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

  const id = getLastInsertId();

  const check = await checkAdminPassword(password);
  const piiAccessLevel = check.acceptable ? 'full' : 'restricted';
  const token = generateJWT({ id, role: "admin", piiAccessLevel });
  res.status(201).json({ token, piiAccessLevel, passwordWarnings: check.reasons });
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
        const langRow = db.exec("SELECT value FROM settings WHERE key = 'bot_language'");
        const lang = (langRow[0]?.values[0]?.[0] as string) || "de";
        const { subject, html } = buildResetEmail(resetUrl, lang);
        await sendEmail(email, subject, html);
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

    let piiAccessLevel: 'full' | 'restricted' = 'restricted';
    let passwordWarnings: string[] = [];
    if (role === 'admin') {
      const check = await checkAdminPassword(password);
      piiAccessLevel = check.acceptable ? 'full' : 'restricted';
      passwordWarnings = check.reasons;
    }

    const jwt = generateJWT({ id, role, piiAccessLevel });
    res.json({ token: jwt, piiAccessLevel, passwordWarnings });
  },
);
