import type { VacationPeriod } from "./holidays.js";
import { getZurichHolidays } from "./holidays.js";

export interface HolidayPreset {
  id: string;
  label: string;
  group: string;
  getHolidays: (year: number) => VacationPeriod[];
  externalUrl?: string;
}

export interface PresetGroup {
  group: string;
  presets: { id: string; label: string }[];
}

function makeStub(id: string, label: string, group: string, externalUrl?: string): HolidayPreset {
  return { id, label, group, getHolidays: () => [], externalUrl };
}

function wrapSource(id: string, fn: (year: number) => VacationPeriod[]): (year: number) => VacationPeriod[] {
  return (year) => fn(year).map((h) => ({ ...h, source: `preset:${id}` }));
}

export const HOLIDAY_PRESETS: HolidayPreset[] = [
  // Switzerland
  { id: "ch-zurich", label: "Zürich (Stadt)", group: "Switzerland", getHolidays: wrapSource("ch-zurich", getZurichHolidays) },
  makeStub("ch-bern", "Bern", "Switzerland"),
  makeStub("ch-basel", "Basel-Stadt", "Switzerland"),
  makeStub("ch-luzern", "Luzern", "Switzerland"),
  makeStub("ch-aargau", "Aargau", "Switzerland"),
  makeStub("ch-stgallen", "St. Gallen", "Switzerland"),
  // Germany
  makeStub("de-bw", "Baden-Württemberg", "Germany"),
  makeStub("de-bayern", "Bayern", "Germany"),
  // Austria
  makeStub("at-vorarlberg", "Vorarlberg", "Austria"),
  makeStub("at-tirol", "Tirol", "Austria"),
];

export function getPresetById(id: string): HolidayPreset | undefined {
  return HOLIDAY_PRESETS.find((p) => p.id === id);
}

export function getPresetGroups(): PresetGroup[] {
  const map = new Map<string, { id: string; label: string }[]>();
  for (const p of HOLIDAY_PRESETS) {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push({ id: p.id, label: p.label });
  }
  return Array.from(map.entries()).map(([group, presets]) => ({ group, presets }));
}
