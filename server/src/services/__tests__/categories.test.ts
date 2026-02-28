import { describe, it, expect } from "vitest";
import {
  getSeasonYear,
  getCategoryForBirthYear,
  getAllCategories,
  getCategoryInfo,
} from "../categories.js";

describe("getSeasonYear", () => {
  it("returns 2025 for a date in August 2025 (after July 1)", () => {
    expect(getSeasonYear(new Date("2025-08-15"))).toBe(2025);
  });

  it("returns 2025 for a date in March 2026 (before July 1, still 2025/26 season)", () => {
    expect(getSeasonYear(new Date("2026-03-15"))).toBe(2025);
  });

  it("returns 2026 for a date in July 2026 (new season)", () => {
    expect(getSeasonYear(new Date("2026-07-02"))).toBe(2026);
  });
});

describe("getCategoryForBirthYear", () => {
  it("returns 'E' for birth year 2017, season 2025", () => {
    expect(getCategoryForBirthYear(2017, 2025)).toBe("E");
  });

  it("returns 'E' for birth year 2016, season 2025", () => {
    expect(getCategoryForBirthYear(2016, 2025)).toBe("E");
  });

  it("returns 'D-7' for birth year 2015, season 2025", () => {
    expect(getCategoryForBirthYear(2015, 2025)).toBe("D-7");
  });

  it("returns 'D-9' for birth year 2014, season 2025", () => {
    expect(getCategoryForBirthYear(2014, 2025)).toBe("D-9");
  });

  it("returns 'C' for birth year 2013, season 2025", () => {
    expect(getCategoryForBirthYear(2013, 2025)).toBe("C");
  });

  it("returns 'C' for birth year 2012, season 2025", () => {
    expect(getCategoryForBirthYear(2012, 2025)).toBe("C");
  });

  it("returns 'B' for birth year 2011, season 2025", () => {
    expect(getCategoryForBirthYear(2011, 2025)).toBe("B");
  });

  it("returns 'B' for birth year 2010, season 2025", () => {
    expect(getCategoryForBirthYear(2010, 2025)).toBe("B");
  });

  it("returns 'A' for birth year 2009, season 2025", () => {
    expect(getCategoryForBirthYear(2009, 2025)).toBe("A");
  });

  it("returns 'A' for birth year 2008, season 2025", () => {
    expect(getCategoryForBirthYear(2008, 2025)).toBe("A");
  });

  it("returns 'G' for birth year 2020, season 2025", () => {
    expect(getCategoryForBirthYear(2020, 2025)).toBe("G");
  });

  it("returns 'F' for birth year 2019, season 2025", () => {
    expect(getCategoryForBirthYear(2019, 2025)).toBe("F");
  });

  it("returns 'F' for birth year 2018, season 2025", () => {
    expect(getCategoryForBirthYear(2018, 2025)).toBe("F");
  });
});

describe("getAllCategories", () => {
  it("returns an array of category objects with name, label, format, teamSize", () => {
    const categories = getAllCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(cat).toHaveProperty("name");
      expect(cat).toHaveProperty("label");
      expect(cat).toHaveProperty("format");
      expect(cat).toHaveProperty("teamSize");
    }
  });
});

describe("getCategoryInfo", () => {
  it("returns correct info for D-7", () => {
    const info = getCategoryInfo("D-7");
    expect(info).toEqual({
      name: "D-7",
      label: "D-Junioren D7 (U11)",
      format: "7v7",
      teamSize: 7,
      minAge: 10,
      maxAge: 10,
    });
  });

  it("returns undefined for an unknown category", () => {
    expect(getCategoryInfo("Z")).toBeUndefined();
  });
});
