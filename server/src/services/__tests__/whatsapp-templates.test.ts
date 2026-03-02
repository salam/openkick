import { describe, it, expect, beforeEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

// Mock the database module so getBotTemplate uses our in-memory DB
vi.mock("../../database.js", async () => {
  const actual = await vi.importActual<typeof import("../../database.js")>("../../database.js");
  return {
    ...actual,
    getDB: vi.fn(),
  };
});

// Mock the i18n module
vi.mock("../../utils/i18n.js", () => ({
  t: vi.fn((key: string, _lang: string, params?: Record<string, string>) => {
    // Simulate a simple i18n fallback: return a known string for testing
    let value = `default_${key}`;
    if (params) {
      for (const [param, replacement] of Object.entries(params)) {
        value = value.replaceAll(`{{${param}}}`, replacement);
      }
    }
    return value;
  }),
}));

describe("whatsapp-templates: getBotTemplate", () => {
  beforeEach(async () => {
    db = await initDB();

    // Wire up the mock so getDB() returns our test DB
    const { getDB } = await import("../../database.js");
    vi.mocked(getDB).mockReturnValue(db);
  });

  it("returns default from t() when no custom template exists in settings", async () => {
    const { getBotTemplate } = await import("../whatsapp-templates.js");

    const result = getBotTemplate("reminder", "de", { playerName: "Max" });

    // Should fall back to t(), which in our mock returns "default_reminder"
    const { t } = await import("../../utils/i18n.js");
    expect(t).toHaveBeenCalledWith("reminder", "de", { playerName: "Max" });
    expect(result).toBe("default_reminder");
  });

  it("uses custom template from settings when one exists", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "bot_template_reminder",
      "Hey {{playerName}}, vergiss das Training nicht!",
    ]);

    const { getBotTemplate } = await import("../whatsapp-templates.js");

    const result = getBotTemplate("reminder", "de", { playerName: "Max" });

    expect(result).toBe("Hey Max, vergiss das Training nicht!");
  });

  it("correctly replaces multiple {{var}} placeholders in custom templates", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "bot_template_match_info",
      "{{playerName}} spielt am {{date}} um {{time}} in {{location}}",
    ]);

    const { getBotTemplate } = await import("../whatsapp-templates.js");

    const result = getBotTemplate("match_info", "de", {
      playerName: "Luca",
      date: "2026-03-15",
      time: "14:00",
      location: "Sportplatz B",
    });

    expect(result).toBe("Luca spielt am 2026-03-15 um 14:00 in Sportplatz B");
  });

  it("falls back to t() when settings table has no matching key", async () => {
    // Insert an unrelated template to ensure the table isn't empty
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "bot_template_other",
      "Some other template",
    ]);

    const { getBotTemplate } = await import("../whatsapp-templates.js");

    const result = getBotTemplate("nonexistent", "en");

    const { t } = await import("../../utils/i18n.js");
    expect(t).toHaveBeenCalledWith("nonexistent", "en", undefined);
    expect(result).toBe("default_nonexistent");
  });

  it("returns custom template as-is when no params are provided", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "bot_template_welcome",
      "Willkommen beim Verein!",
    ]);

    const { getBotTemplate } = await import("../whatsapp-templates.js");

    const result = getBotTemplate("welcome", "de");

    expect(result).toBe("Willkommen beim Verein!");
  });
});
