import { describe, it, expect } from "vitest";
import { generateCSV, generatePDF } from "../export.service.js";

describe("generateCSV", () => {
  it("produces BOM + semicolon-separated output", () => {
    const buf = generateCSV(
      ["Name", "Hours"],
      [
        { Name: "L.", Hours: 3 },
        { Name: "M.", Hours: 2 },
      ],
    );
    const text = buf.toString("utf-8");
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Name;Hours");
    expect(text).toContain("L.;3");
    expect(text).toContain("M.;2");
  });

  it("handles empty rows", () => {
    const buf = generateCSV(["A"], []);
    const text = buf.toString("utf-8");
    expect(text).toContain("A");
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
  });
});

describe("generatePDF", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await generatePDF("Test Report", ["Name", "Hours"], [
      { Name: "L.", Hours: 3 },
    ]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString("utf-8", 0, 5)).toContain("%PDF");
  });
});
