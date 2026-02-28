import { getDB } from "../database.js";
import { syncPresetHolidays } from "./holidays.js";
import { getPresetById } from "./holiday-presets.js";

/**
 * Reads the saved holiday_preset from settings and syncs it for the current year.
 * Returns null if no preset is configured or if the preset is unknown.
 */
export function runHolidaySync(): { synced: number; source: "external" | "fallback" } | null {
  const db = getDB();
  const result = db.exec(
    "SELECT value FROM settings WHERE key = 'holiday_preset'",
  );

  const presetId = result[0]?.values[0]?.[0] as string | undefined;
  if (!presetId) return null;

  if (!getPresetById(presetId)) return null;

  const year = new Date().getFullYear();
  return syncPresetHolidays(presetId, year);
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function startHolidaySyncScheduler(intervalMs = ONE_DAY_MS): void {
  if (syncInterval) return;
  syncInterval = setInterval(() => runHolidaySync(), intervalMs);
}

export function stopHolidaySyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
