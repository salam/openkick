import { describe, it, expect, afterEach } from "vitest";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { initDB } from "../database.js";

let db: Database | null = null;

afterEach(() => {
  if (db) {
    db.close();
    db = null;
  }
});

describe("database migration – reset token columns", () => {
  it("creates resetToken and resetTokenExpiry columns on fresh database", async () => {
    db = await initDB();

    const info = db.exec("PRAGMA table_info(guardians)");
    const cols = info[0].values.map((row) => row[1] as string);

    expect(cols).toContain("resetToken");
    expect(cols).toContain("resetTokenExpiry");
  });

  it("migrates an existing database that lacks the new columns", async () => {
    // Create a database with the OLD schema (no resetToken columns)
    const SQL = await initSqlJs();
    const oldDb = new SQL.Database();
    oldDb.run(`
      CREATE TABLE IF NOT EXISTS guardians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        name TEXT,
        email TEXT,
        passwordHash TEXT,
        role TEXT NOT NULL DEFAULT 'parent',
        language TEXT NOT NULL DEFAULT 'de',
        consentGiven INTEGER NOT NULL DEFAULT 0,
        accessToken TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Verify the old schema does NOT have the new columns
    const oldCols = oldDb.exec("PRAGMA table_info(guardians)")[0].values.map(
      (r) => r[1] as string,
    );
    expect(oldCols).not.toContain("resetToken");
    expect(oldCols).not.toContain("resetTokenExpiry");

    // Save to a buffer and re-open via initDB to trigger migration
    const data = oldDb.export();
    oldDb.close();

    // Write to a temp file so initDB can load it
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmpFile = path.join(
      os.tmpdir(),
      `openkick-migration-test-${Date.now()}.db`,
    );
    fs.writeFileSync(tmpFile, Buffer.from(data));

    try {
      db = await initDB(tmpFile);

      const info = db.exec("PRAGMA table_info(guardians)");
      const cols = info[0].values.map((row) => row[1] as string);

      expect(cols).toContain("resetToken");
      expect(cols).toContain("resetTokenExpiry");
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
