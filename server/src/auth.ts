import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { getDB } from "./database.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string; piiAccessLevel?: 'full' | 'restricted' };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateJWT(payload: { id: number; role: string; piiAccessLevel?: 'full' | 'restricted' }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyJWT(
  token: string
): { id: number; role: string; piiAccessLevel?: 'full' | 'restricted' } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    return {
      id: decoded.id as number,
      role: decoded.role as string,
      piiAccessLevel: decoded.piiAccessLevel as 'full' | 'restricted' | undefined,
    };
  } catch {
    return null;
  }
}

export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Express middleware: JWT-based auth via Authorization header
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyJWT(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
}

// Express middleware: access-token auth via ?token= query param
export function tokenAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Missing token query parameter" });
    return;
  }

  const db = getDB();
  const result = db.exec(
    "SELECT id, role FROM guardians WHERE accessToken = ?",
    [token]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    res.status(401).json({ error: "Invalid access token" });
    return;
  }

  const row = result[0].values[0];
  req.user = { id: row[0] as number, role: row[1] as string };
  next();
}

// Middleware factory: restrict to specific roles
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
