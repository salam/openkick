import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExec = vi.fn();
const mockRun = vi.fn();

vi.mock("../../database.js", () => ({
  getDB: vi.fn(() => ({
    exec: mockExec,
    run: mockRun,
  })),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { geocodeLocation } from "../geocoding.js";

describe("geocodeLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for empty input", async () => {
    expect(await geocodeLocation("")).toBeNull();
    expect(await geocodeLocation("   ")).toBeNull();
    expect(await geocodeLocation(undefined as unknown as string)).toBeNull();
    expect(mockExec).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns cached coordinates when available in DB", async () => {
    mockExec.mockReturnValueOnce([
      { values: [[47.3769, 8.5417, new Date().toISOString()]] },
    ]);

    const result = await geocodeLocation("Zurich");

    expect(result).toEqual({ latitude: 47.3769, longitude: 8.5417 });
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("SELECT latitude, longitude, cached_at"),
      ["Zurich"],
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Nominatim when cache misses and caches result", async () => {
    // Cache miss: empty result
    mockExec.mockReturnValueOnce([]);

    // Nominatim returns a result
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "48.8566", lon: "2.3522" }],
    });

    const result = await geocodeLocation("Paris");

    expect(result).toEqual({ latitude: 48.8566, longitude: 2.3522 });

    // Verify fetch was called with correct URL
    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchUrl = fetchMock.mock.calls[0][0] as string;
    expect(fetchUrl).toContain("nominatim.openstreetmap.org/search");
    expect(fetchUrl).toContain("q=Paris");
    expect(fetchUrl).toContain("format=json");
    expect(fetchUrl).toContain("limit=1");

    // Verify result was cached
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO geocoding_cache"),
      expect.arrayContaining([
        "Paris",
        48.8566,
        2.3522,
        expect.any(String),
      ]),
    );
  });

  it("returns null when Nominatim returns no results", async () => {
    mockExec.mockReturnValueOnce([]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await geocodeLocation("xyznonexistentplace12345");

    expect(result).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns null when Nominatim API fails", async () => {
    mockExec.mockReturnValueOnce([]);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await geocodeLocation("Berlin");

    expect(result).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("skips expired cache entries and fetches fresh data", async () => {
    // Return a cached entry from 31 days ago (expired)
    const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    mockExec.mockReturnValueOnce([
      { values: [[47.0, 8.0, expired]] },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "47.05", lon: "8.05" }],
    });

    const result = await geocodeLocation("Luzern");

    expect(result).toEqual({ latitude: 47.05, longitude: 8.05 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
