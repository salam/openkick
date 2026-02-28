import { describe, it, expect } from "vitest";
import { expandSeries, type SeriesTemplate, type VacationPeriod } from "../event-series.js";

const baseSeries: SeriesTemplate = {
  id: 1,
  type: "training",
  title: "Monday Training",
  description: null,
  startTime: "18:00",
  attendanceTime: "17:45",
  location: "Sportplatz A",
  categoryRequirement: "E,F",
  maxParticipants: null,
  minParticipants: null,
  recurrenceDay: 1, // Monday (ISO)
  startDate: "2026-03-02", // a Monday
  endDate: "2026-03-30",   // 5 Mondays
  customDates: null,
  excludedDates: null,
  deadlineOffsetHours: 48,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00",
};

describe("expandSeries", () => {
  it("generates weekly instances between start and end date", () => {
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"]);
  });

  it("filters to requested date range", () => {
    const result = expandSeries(baseSeries, "2026-03-08", "2026-03-20", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).toEqual(["2026-03-09", "2026-03-16"]);
  });

  it("skips vacation periods", () => {
    const vacations: VacationPeriod[] = [
      { startDate: "2026-03-09", endDate: "2026-03-15" },
    ];
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", vacations, []);
    const dates = result.map((e) => e.date);
    expect(dates).not.toContain("2026-03-09");
    expect(dates).toContain("2026-03-02");
    expect(dates).toContain("2026-03-16");
  });

  it("skips excluded dates", () => {
    const series = { ...baseSeries, excludedDates: JSON.stringify(["2026-03-16"]) };
    const result = expandSeries(series, "2026-03-01", "2026-03-31", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).not.toContain("2026-03-16");
  });

  it("includes custom dates outside weekly pattern", () => {
    const series = { ...baseSeries, customDates: JSON.stringify(["2026-03-05"]) };
    const result = expandSeries(series, "2026-03-01", "2026-03-31", [], []);
    const dates = result.map((e) => e.date);
    expect(dates).toContain("2026-03-05");
  });

  it("replaces virtual instance with materialized event", () => {
    const materialized = [
      { id: 99, seriesId: 1, date: "2026-03-09", title: "Edited Training", type: "training", startTime: "19:00" },
    ];
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", [], materialized as any);
    const mar9 = result.find((e) => e.date === "2026-03-09");
    expect(mar9?.title).toBe("Edited Training");
    expect(mar9?.startTime).toBe("19:00");
    expect(mar9?.materialized).toBe(true);
    expect(mar9?.id).toBe(99);
  });

  it("computes deadline from deadlineOffsetHours", () => {
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-31", [], []);
    const first = result[0];
    // 48h before 2026-03-02 18:00 = 2026-02-28 18:00
    expect(first.deadline).toBe("2026-02-28T18:00:00");
  });

  it("sets virtual instance fields from template", () => {
    const result = expandSeries(baseSeries, "2026-03-01", "2026-03-10", [], []);
    const first = result[0];
    expect(first.seriesId).toBe(1);
    expect(first.type).toBe("training");
    expect(first.title).toBe("Monday Training");
    expect(first.location).toBe("Sportplatz A");
    expect(first.materialized).toBe(false);
  });
});
