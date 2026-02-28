import { describe, it, expect } from "vitest";
import { HOLIDAY_PRESETS, getPresetById, getPresetGroups } from "../holiday-presets.js";

describe("HOLIDAY_PRESETS", () => {
  it("contains ch-zurich with full holiday data", () => {
    const zurich = getPresetById("ch-zurich");
    expect(zurich).toBeDefined();
    expect(zurich!.label).toBe("Zürich (Stadt)");
    expect(zurich!.group).toBe("Switzerland");
    const holidays = zurich!.getHolidays(2026);
    expect(holidays).toHaveLength(5);
    expect(holidays[0].source).toBe("preset:ch-zurich");
  });

  it("contains at least 10 presets across 3 groups", () => {
    expect(HOLIDAY_PRESETS.length).toBeGreaterThanOrEqual(10);
    const groups = new Set(HOLIDAY_PRESETS.map((p) => p.group));
    expect(groups.size).toBeGreaterThanOrEqual(3);
  });

  it("stub presets return empty arrays from getHolidays", () => {
    const bern = getPresetById("ch-bern");
    expect(bern).toBeDefined();
    expect(bern!.getHolidays(2026)).toEqual([]);
  });

  it("getPresetGroups returns grouped structure", () => {
    const groups = getPresetGroups();
    expect(groups).toBeInstanceOf(Array);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const g of groups) {
      expect(g.group).toBeTruthy();
      expect(g.presets.length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for unknown preset id", () => {
    expect(getPresetById("xx-unknown")).toBeUndefined();
  });
});
