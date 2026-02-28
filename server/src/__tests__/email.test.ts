import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "sql.js";
import { initDB } from "../database.js";

let db: Database | null = null;

beforeEach(async () => {
  // Clear SMTP env vars so they don't leak between tests
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;

  db = await initDB();
});

afterEach(() => {
  if (db) {
    db.close();
    db = null;
  }
  vi.restoreAllMocks();
});

describe("getSmtpConfig", () => {
  it("reads SMTP settings from the database", async () => {
    db!.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_host', 'mail.example.com')");
    db!.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_port', '465')");
    db!.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_user', 'user@example.com')");
    db!.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_pass', 'secret')");
    db!.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_from', 'noreply@example.com')");

    const { getSmtpConfig } = await import("../services/email.js");
    const config = getSmtpConfig();

    expect(config.host).toBe("mail.example.com");
    expect(config.port).toBe(465);
    expect(config.user).toBe("user@example.com");
    expect(config.pass).toBe("secret");
    expect(config.from).toBe("noreply@example.com");
  });

  it("falls back to environment variables when settings are absent", async () => {
    process.env.SMTP_HOST = "env-host.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "envuser";
    process.env.SMTP_PASS = "envpass";
    process.env.SMTP_FROM = "env@example.com";

    const { getSmtpConfig } = await import("../services/email.js");
    const config = getSmtpConfig();

    expect(config.host).toBe("env-host.example.com");
    expect(config.port).toBe(587);
    expect(config.user).toBe("envuser");
    expect(config.pass).toBe("envpass");
    expect(config.from).toBe("env@example.com");
  });

  it("defaults port to 587 when not configured anywhere", async () => {
    const { getSmtpConfig } = await import("../services/email.js");
    const config = getSmtpConfig();

    expect(config.port).toBe(587);
  });
});

describe("sendEmail", () => {
  it("throws when SMTP is not configured", async () => {
    const { sendEmail } = await import("../services/email.js");

    await expect(
      sendEmail("to@example.com", "Subject", "<p>Hello</p>"),
    ).rejects.toThrow("SMTP not configured");
  });
});
