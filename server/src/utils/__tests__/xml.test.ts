import { describe, it, expect } from "vitest";
import { xmlEscape } from "../xml.js";

describe("xmlEscape", () => {
  it("escapes ampersands", () => {
    expect(xmlEscape("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(xmlEscape("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes quotes", () => {
    expect(xmlEscape('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes apostrophes", () => {
    expect(xmlEscape("it's")).toBe("it&apos;s");
  });

  it("handles empty string", () => {
    expect(xmlEscape("")).toBe("");
  });

  it("handles null/undefined gracefully", () => {
    expect(xmlEscape(null as unknown as string)).toBe("");
    expect(xmlEscape(undefined as unknown as string)).toBe("");
  });
});
