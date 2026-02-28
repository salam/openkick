import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";
import type { AuditCheck, AuditResult } from "../security-audit.js";

let db: Database;

describe("security audit service", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("runSecurityAudit return shape", () => {
    it("returns an object with timestamp, checks array, and summary", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result: AuditResult = await runSecurityAudit();

      expect(result).toHaveProperty("timestamp");
      expect(typeof result.timestamp).toBe("string");
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);

      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);

      expect(result).toHaveProperty("summary");
      expect(result.summary).toHaveProperty("pass");
      expect(result.summary).toHaveProperty("warn");
      expect(result.summary).toHaveProperty("fail");
    });

    it("each check has id, category, status, and message", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();

      for (const check of result.checks) {
        expect(check).toHaveProperty("id");
        expect(typeof check.id).toBe("string");

        expect(check).toHaveProperty("category");
        expect(typeof check.category).toBe("string");

        expect(check).toHaveProperty("status");
        expect(["pass", "warn", "fail"]).toContain(check.status);

        expect(check).toHaveProperty("message");
        expect(typeof check.message).toBe("string");
      }
    });

    it("check IDs are unique", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();
      const ids = result.checks.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("summary counts match checks", () => {
    it("summary.pass + summary.warn + summary.fail equals checks.length", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();

      const { pass, warn, fail } = result.summary;
      expect(pass + warn + fail).toBe(result.checks.length);
    });

    it("summary counts match actual check statuses", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();

      const passCount = result.checks.filter((c) => c.status === "pass").length;
      const warnCount = result.checks.filter((c) => c.status === "warn").length;
      const failCount = result.checks.filter((c) => c.status === "fail").length;

      expect(result.summary.pass).toBe(passCount);
      expect(result.summary.warn).toBe(warnCount);
      expect(result.summary.fail).toBe(failCount);
    });
  });

  describe("expected check IDs", () => {
    it("includes all 8 expected check IDs", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();
      const ids = result.checks.map((c) => c.id);

      const expectedIds = [
        "db-permissions",
        "db-http-exposure",
        "env-permissions",
        "cors-config",
        "admin-passwords",
        "security-txt",
        "https-production",
        "gitignore-coverage",
      ];

      for (const id of expectedIds) {
        expect(ids).toContain(id);
      }
    });
  });

  describe("admin-passwords check", () => {
    it("passes when all admin guardians have passwordHash set", async () => {
      db.run(
        "INSERT INTO guardians (phone, name, role, passwordHash) VALUES (?, ?, ?, ?)",
        ["+49111", "Admin A", "admin", "$2b$10$hashedvalue"],
      );
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();
      const check = result.checks.find((c) => c.id === "admin-passwords");

      expect(check).toBeDefined();
      expect(check!.status).toBe("pass");
    });

    it("fails when an admin guardian has no passwordHash", async () => {
      db.run(
        "INSERT INTO guardians (phone, name, role) VALUES (?, ?, ?)",
        ["+49222", "Admin B", "admin"],
      );
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();
      const check = result.checks.find((c) => c.id === "admin-passwords");

      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
    });

    it("passes when there are no admin guardians", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();
      const check = result.checks.find((c) => c.id === "admin-passwords");

      expect(check).toBeDefined();
      expect(check!.status).toBe("pass");
    });
  });

  describe("cors-config check", () => {
    it("warns or fails when CORS_ORIGIN is wildcard", async () => {
      const originalCors = process.env.CORS_ORIGIN;
      process.env.CORS_ORIGIN = "*";

      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();
      const check = result.checks.find((c) => c.id === "cors-config");

      expect(check).toBeDefined();
      expect(["warn", "fail"]).toContain(check!.status);

      if (originalCors !== undefined) {
        process.env.CORS_ORIGIN = originalCors;
      } else {
        delete process.env.CORS_ORIGIN;
      }
    });
  });

  describe("gitignore-coverage check", () => {
    it("checks for .env, *.db, and node_modules in gitignore", async () => {
      const { runSecurityAudit } = await import("../security-audit.js");
      const result = await runSecurityAudit();
      const check = result.checks.find((c) => c.id === "gitignore-coverage");

      expect(check).toBeDefined();
      // In this repo, gitignore should cover these patterns
      expect(check!.status).not.toBe("fail");
    });
  });
});
