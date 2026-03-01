import { describe, it, expect } from "vitest";
import { getSemesterBounds, getSchoolYearBounds, parsePeriodParam } from "../semester.js";

describe("getSemesterBounds", () => {
  it("returns Spring for Feb 1", () => {
    const r = getSemesterBounds(new Date("2026-02-01"));
    expect(r).toEqual({
      start: "2026-02-01",
      end: "2026-07-31",
      label: "Spring 2026",
      type: "spring",
    });
  });

  it("returns Spring for Jul 31", () => {
    const r = getSemesterBounds(new Date("2026-07-31"));
    expect(r.type).toBe("spring");
    expect(r.label).toBe("Spring 2026");
  });

  it("returns Autumn for Aug 1", () => {
    const r = getSemesterBounds(new Date("2026-08-01"));
    expect(r).toEqual({
      start: "2026-08-01",
      end: "2027-01-31",
      label: "Autumn 2026/27",
      type: "autumn",
    });
  });

  it("returns Autumn for Jan 15 (belongs to previous Aug)", () => {
    const r = getSemesterBounds(new Date("2026-01-15"));
    expect(r).toEqual({
      start: "2025-08-01",
      end: "2026-01-31",
      label: "Autumn 2025/26",
      type: "autumn",
    });
  });

  it("returns Autumn for Dec 25", () => {
    const r = getSemesterBounds(new Date("2025-12-25"));
    expect(r.type).toBe("autumn");
    expect(r.start).toBe("2025-08-01");
  });
});

describe("getSchoolYearBounds", () => {
  it("returns 2025/26 for Mar 2026", () => {
    const r = getSchoolYearBounds(new Date("2026-03-15"));
    expect(r).toEqual({
      start: "2025-08-01",
      end: "2026-07-31",
      label: "2025/26",
      type: "school_year",
    });
  });

  it("returns 2026/27 for Aug 2026", () => {
    const r = getSchoolYearBounds(new Date("2026-08-01"));
    expect(r).toEqual({
      start: "2026-08-01",
      end: "2027-07-31",
      label: "2026/27",
      type: "school_year",
    });
  });
});

describe("parsePeriodParam", () => {
  it("parses 'spring-2026'", () => {
    const r = parsePeriodParam("spring-2026");
    expect(r.type).toBe("spring");
    expect(r.start).toBe("2026-02-01");
  });

  it("parses 'autumn-2025'", () => {
    const r = parsePeriodParam("autumn-2025");
    expect(r.type).toBe("autumn");
    expect(r.start).toBe("2025-08-01");
  });

  it("parses 'year-2025'", () => {
    const r = parsePeriodParam("year-2025");
    expect(r.type).toBe("school_year");
    expect(r.start).toBe("2025-08-01");
  });

  it("defaults to current semester for undefined", () => {
    const r = parsePeriodParam(undefined);
    expect(["spring", "autumn"]).toContain(r.type);
  });

  it("parses 'current'", () => {
    const r = parsePeriodParam("current");
    expect(["spring", "autumn"]).toContain(r.type);
  });

  it("parses 'current-year'", () => {
    const r = parsePeriodParam("current-year");
    expect(r.type).toBe("school_year");
  });
});
