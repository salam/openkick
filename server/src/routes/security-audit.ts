import { Router } from "express";
import { authMiddleware, requireRole } from "../auth.js";
import { runSecurityAudit } from "../services/security-audit.js";

export const securityAuditRouter = Router();

securityAuditRouter.get(
  "/security-audit",
  authMiddleware,
  requireRole("admin"),
  async (_req, res) => {
    try {
      const result = await runSecurityAudit();
      res.json(result);
    } catch (err) {
      console.error("Security audit failed:", err);
      res.status(500).json({ error: "Security audit failed" });
    }
  }
);
