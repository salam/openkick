import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDB, getDB } from "../../database.js";
import type { Database } from "sql.js";

let runHolidaySync: typeof import("../holiday-scheduler.js").runHolidaySync;
let startHolidaySyncScheduler: typeof import("../holiday-scheduler.js").startHolidaySyncScheduler;
let stopHolidaySyncScheduler: typeof import("../holiday-scheduler.js").stopHolidaySyncScheduler;

let db: Database;

beforeEach(async () => {
  db = await initDB();
  const mod = await import("../holiday-scheduler.js");
  runHolidaySync = mod.runHolidaySync;
  startHolidaySyncScheduler = mod.startHolidaySyncScheduler;
  stopHolidaySyncScheduler = mod.stopHolidaySyncScheduler;
});

afterEach(() => {
  stopHolidaySyncScheduler();
  vi.restoreAllMocks();
});

describe("runHolidaySync", () => {
  it("syncs when holiday_preset is set in settings", () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "holiday_preset",
      "ch-zurich",
    ]);

    const result = runHolidaySync();
    expect(result).not.toBeNull();
    expect(result!.synced).toBe(5);

    const rows = db.exec(
      "SELECT * FROM vacation_periods WHERE source = 'preset:ch-zurich'",
    );
    expect(rows[0].values.length).toBe(5);
  });

  it("returns null when no preset is saved", () => {
    const result = runHolidaySync();
    expect(result).toBeNull();
  });

  it("returns null when holiday_preset is empty string", () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "holiday_preset",
      "",
    ]);
    const result = runHolidaySync();
    expect(result).toBeNull();
  });

  it("returns null for unknown preset without throwing", () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "holiday_preset",
      "xx-nonexistent",
    ]);
    const result = runHolidaySync();
    expect(result).toBeNull();
  });
});

describe("startHolidaySyncScheduler / stopHolidaySyncScheduler", () => {
  it("starts and stops without error", () => {
    vi.useFakeTimers();
    startHolidaySyncScheduler(60000);
    stopHolidaySyncScheduler();
    vi.useRealTimers();
  });

  it("does not start twice", () => {
    vi.useFakeTimers();
    startHolidaySyncScheduler(60000);
    startHolidaySyncScheduler(60000);
    stopHolidaySyncScheduler();
    vi.useRealTimers();
  });

  it("runs sync on interval tick", () => {
    vi.useFakeTimers();

    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "holiday_preset",
      "ch-zurich",
    ]);

    startHolidaySyncScheduler(60000);

    vi.advanceTimersByTime(60001);

    const rows = db.exec(
      "SELECT * FROM vacation_periods WHERE source = 'preset:ch-zurich'",
    );
    expect(rows[0].values.length).toBe(5);

    stopHolidaySyncScheduler();
    vi.useRealTimers();
  });
});
