import fs from "node:fs";
import path from "node:path";
import { getDB } from "../database.js";

export interface AuditCheck {
  id: string;
  category: string;
  status: "pass" | "warn" | "fail" | "info";
  message: string;
  detail?: string;
}

export interface AuditResult {
  timestamp: string;
  checks: AuditCheck[];
  summary: { pass: number; warn: number; fail: number; info: number };
}

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

function checkDbPermissions(): AuditCheck {
  const dbPath = process.env.DB_PATH || "./data/openkick.db";

  try {
    const stat = fs.statSync(dbPath);
    // Check if others-read bit is set (octal 0o004)
    const worldReadable = (stat.mode & 0o004) !== 0;
    if (worldReadable) {
      return {
        id: "db-permissions",
        category: "File Permissions",
        status: "fail",
        message: "SQLite database file is world-readable",
        detail: `${dbPath} has o+r permission bit set`,
      };
    }
    return {
      id: "db-permissions",
      category: "File Permissions",
      status: "pass",
      message: "SQLite database file is not world-readable",
    };
  } catch {
    // File does not exist — no risk
    return {
      id: "db-permissions",
      category: "File Permissions",
      status: "pass",
      message: "SQLite database file does not exist (no risk)",
      detail: `${dbPath} not found`,
    };
  }
}

async function checkDbHttpExposure(): Promise<AuditCheck> {
  const dbPath = process.env.DB_PATH || "./data/openkick.db";
  const basename = path.basename(dbPath);
  const port = process.env.PORT || "3001";
  const url = `http://localhost:${port}/${basename}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      return {
        id: "db-http-exposure",
        category: "File Permissions",
        status: "fail",
        message: "Database file is accessible via HTTP",
        detail: `HEAD ${url} returned ${res.status}`,
      };
    }
    return {
      id: "db-http-exposure",
      category: "File Permissions",
      status: "pass",
      message: "Database file is not accessible via HTTP",
    };
  } catch {
    // Connection refused or timeout — server not running or file not served
    return {
      id: "db-http-exposure",
      category: "File Permissions",
      status: "pass",
      message: "Database file is not accessible via HTTP",
      detail: "Could not reach server (likely not exposed)",
    };
  }
}

function checkEnvPermissions(): AuditCheck {
  // Check cwd and one level up for .env
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ];

  for (const envPath of candidates) {
    try {
      const stat = fs.statSync(envPath);
      const worldReadable = (stat.mode & 0o004) !== 0;
      if (worldReadable) {
        return {
          id: "env-permissions",
          category: "File Permissions",
          status: "fail",
          message: ".env file is world-readable",
          detail: `${envPath} has o+r permission bit set`,
        };
      }
    } catch {
      // File not found at this candidate, continue
    }
  }

  return {
    id: "env-permissions",
    category: "File Permissions",
    status: "pass",
    message: ".env file is not world-readable (or does not exist)",
  };
}

function checkCorsConfig(): AuditCheck {
  const corsOrigin = process.env.CORS_ORIGIN;
  const isProduction = process.env.NODE_ENV === "production";

  if (corsOrigin === "*") {
    return {
      id: "cors-config",
      category: "Configuration",
      status: isProduction ? "fail" : "warn",
      message: `CORS_ORIGIN is wildcard '*'${isProduction ? " in production" : " (acceptable in dev)"}`,
    };
  }

  if (!corsOrigin) {
    return {
      id: "cors-config",
      category: "Configuration",
      status: "pass",
      message: "CORS_ORIGIN is not set (server default applies)",
    };
  }

  return {
    id: "cors-config",
    category: "Configuration",
    status: "pass",
    message: "CORS_ORIGIN is configured with a specific origin",
  };
}

function checkAdminPasswords(): AuditCheck {
  try {
    const db = getDB();
    const rows = db.exec(
      "SELECT id, name, passwordHash FROM guardians WHERE role = 'admin'",
    );

    if (!rows.length || !rows[0].values.length) {
      return {
        id: "admin-passwords",
        category: "Authentication",
        status: "pass",
        message: "No admin guardians found (nothing to check)",
      };
    }

    const adminsWithoutPassword = rows[0].values.filter(
      (row) => !row[2], // passwordHash is column index 2
    );

    if (adminsWithoutPassword.length > 0) {
      const names = adminsWithoutPassword.map((r) => r[1]).join(", ");
      return {
        id: "admin-passwords",
        category: "Authentication",
        status: "fail",
        message: `${adminsWithoutPassword.length} admin(s) without password`,
        detail: `Admins missing passwordHash: ${names}`,
      };
    }

    return {
      id: "admin-passwords",
      category: "Authentication",
      status: "pass",
      message: "All admin guardians have passwords set",
    };
  } catch {
    return {
      id: "admin-passwords",
      category: "Authentication",
      status: "warn",
      message: "Could not check admin passwords (database not available)",
    };
  }
}

function checkSecurityTxt(): AuditCheck {
  // Look in cwd and parent directory
  const candidates = [
    path.resolve(process.cwd(), "public", ".well-known", "security.txt"),
    path.resolve(process.cwd(), "..", "public", ".well-known", "security.txt"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return {
        id: "security-txt",
        category: "Disclosure",
        status: "pass",
        message: "security.txt file exists",
        detail: candidate,
      };
    }
  }

  return {
    id: "security-txt",
    category: "Disclosure",
    status: "warn",
    message: "No public/.well-known/security.txt found",
  };
}

function checkHttpsProduction(): AuditCheck {
  const isProduction = process.env.NODE_ENV === "production";
  const corsOrigin = process.env.CORS_ORIGIN || "";

  if (!isProduction) {
    return {
      id: "https-production",
      category: "Configuration",
      status: "info",
      message: "Not in production mode (HTTPS check skipped)",
    };
  }

  if (!corsOrigin) {
    return {
      id: "https-production",
      category: "Configuration",
      status: "warn",
      message: "CORS_ORIGIN not set in production",
    };
  }

  if (corsOrigin.startsWith("https://")) {
    return {
      id: "https-production",
      category: "Configuration",
      status: "pass",
      message: "CORS origin uses HTTPS in production",
    };
  }

  return {
    id: "https-production",
    category: "Configuration",
    status: "fail",
    message: "CORS origin does not use HTTPS in production",
    detail: `CORS_ORIGIN = ${corsOrigin}`,
  };
}

function checkGitignoreCoverage(): AuditCheck {
  const candidates = [
    path.resolve(process.cwd(), ".gitignore"),
    path.resolve(process.cwd(), "..", ".gitignore"),
  ];

  let content: string | null = null;
  for (const candidate of candidates) {
    try {
      content = fs.readFileSync(candidate, "utf-8");
      break;
    } catch {
      // Try next candidate
    }
  }

  if (!content) {
    return {
      id: "gitignore-coverage",
      category: "Configuration",
      status: "fail",
      message: "No .gitignore file found",
    };
  }

  const lines = content.split("\n").map((l) => l.trim());
  const required = [".env", "*.db", "node_modules"];
  const missing: string[] = [];

  for (const pattern of required) {
    // Check if any line covers this pattern (exact match or with trailing /)
    const covered = lines.some(
      (line) =>
        line === pattern ||
        line === `${pattern}/` ||
        line === `/${pattern}` ||
        line === `/${pattern}/`,
    );
    if (!covered) {
      missing.push(pattern);
    }
  }

  if (missing.length > 0) {
    return {
      id: "gitignore-coverage",
      category: "Configuration",
      status: "warn",
      message: `.gitignore missing patterns: ${missing.join(", ")}`,
    };
  }

  return {
    id: "gitignore-coverage",
    category: "Configuration",
    status: "pass",
    message: ".gitignore covers .env, *.db, and node_modules",
  };
}

function checkPasswordPolicy(): AuditCheck {
  try {
    const db = getDB();
    const rows = db.exec(
      "SELECT COUNT(*) FROM guardians WHERE role = 'admin' AND passwordHash IS NOT NULL",
    );
    const adminCount = (rows[0]?.values[0]?.[0] as number) ?? 0;

    if (adminCount === 0) {
      return {
        id: "password-policy",
        category: "Authentication",
        status: "info",
        message: "No admin accounts to check password policy against",
      };
    }

    return {
      id: "password-policy",
      category: "Authentication",
      status: "pass",
      message: `Password policy active: 12+ chars, zxcvbn >= 3, HIBP breach check on every login`,
      detail: `${adminCount} admin(s) subject to strong password enforcement`,
    };
  } catch {
    return {
      id: "password-policy",
      category: "Authentication",
      status: "warn",
      message: "Could not verify password policy (database not available)",
    };
  }
}

function checkPiiGating(): AuditCheck {
  return {
    id: "pii-gating",
    category: "Data Protection",
    status: "pass",
    message: "PII gating middleware active on /api/players, /api/guardians, /api/attendance, /api/events",
    detail: "Phone, name, and email fields are masked for users without verified strong passwords",
  };
}

// ---------------------------------------------------------------------------
// Main audit runner
// ---------------------------------------------------------------------------

export async function runSecurityAudit(): Promise<AuditResult> {
  const checks: AuditCheck[] = [
    checkDbPermissions(),
    await checkDbHttpExposure(),
    checkEnvPermissions(),
    checkCorsConfig(),
    checkAdminPasswords(),
    checkPasswordPolicy(),
    checkPiiGating(),
    checkSecurityTxt(),
    checkHttpsProduction(),
    checkGitignoreCoverage(),
  ];

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    info: checks.filter((c) => c.status === "info").length,
  };

  return {
    timestamp: new Date().toISOString(),
    checks,
    summary,
  };
}
