import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";
import { normalizePhone } from "../phone.js";

let db: Database;

describe("normalizePhone", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  afterEach(() => {
    db.close();
  });

  // BUG11: Phone number normalization must produce WAHA-compatible format

  it("strips + prefix", () => {
    expect(normalizePhone("+41765612900")).toBe("41765612900");
  });

  it("strips 00 prefix", () => {
    expect(normalizePhone("0041765612900")).toBe("41765612900");
  });

  it("strips whitespace", () => {
    expect(normalizePhone("+41 76 561 29 00")).toBe("41765612900");
  });

  it("strips dashes", () => {
    expect(normalizePhone("+41-76-561-29-00")).toBe("41765612900");
  });

  it("strips parentheses", () => {
    expect(normalizePhone("+41 (76) 561 29 00")).toBe("41765612900");
  });

  it("converts local format (leading 0) to international with default country code 41", () => {
    expect(normalizePhone("076 561 29 00")).toBe("41765612900");
  });

  it("converts local format without spaces", () => {
    expect(normalizePhone("0765612900")).toBe("41765612900");
  });

  it("uses custom country code when provided", () => {
    expect(normalizePhone("0171234567", "49")).toBe("49171234567");
  });

  it("uses country code from settings when available", () => {
    db.run("INSERT INTO settings (key, value) VALUES ('default_country_code', '49')");
    expect(normalizePhone("0171234567")).toBe("49171234567");
  });

  it("leaves already-normalized numbers unchanged", () => {
    expect(normalizePhone("41765612900")).toBe("41765612900");
  });

  it("handles WAHA-format number (already international, no prefix)", () => {
    expect(normalizePhone("41765612900")).toBe("41765612900");
  });
});
