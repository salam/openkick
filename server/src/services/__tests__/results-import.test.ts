import { parseResultsResponse } from "../results-import.js";

describe("results-import", () => {
  it("parses valid LLM JSON response", () => {
    const json = JSON.stringify({
      placement: 3, totalTeams: 12,
      summary: "Won quarter-final, lost semi-final. Strong defense.",
      achievements: [{ type: "3rd_place", label: "3rd Place" }],
    });
    const result = parseResultsResponse(json);
    expect(result.placement).toBe(3);
    expect(result.totalTeams).toBe(12);
    expect(result.summary).toContain("quarter-final");
    expect(result.achievements).toHaveLength(1);
  });

  it("handles markdown code fences in response", () => {
    const response = '```json\n{"placement": 1, "totalTeams": 8, "summary": "Champions!", "achievements": [{"type": "1st_place", "label": "1st Place"}]}\n```';
    const result = parseResultsResponse(response);
    expect(result.placement).toBe(1);
  });

  it("returns partial result when some fields missing", () => {
    const json = JSON.stringify({ placement: 5, totalTeams: 16 });
    const result = parseResultsResponse(json);
    expect(result.placement).toBe(5);
    expect(result.summary).toBeNull();
    expect(result.achievements).toEqual([]);
  });
});
