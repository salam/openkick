import { describe, it, expect, vi, afterEach } from "vitest";
import { getWeatherForecast, isRainy } from "../weather.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockOpenMeteoResponse(overrides?: {
  temperature?: number;
  precipitation?: number;
  weatherCode?: number;
}) {
  const temp = overrides?.temperature ?? 12.5;
  const precip = overrides?.precipitation ?? 40;
  const code = overrides?.weatherCode ?? 3;

  return {
    hourly: {
      time: [
        "2026-03-01T00:00",
        "2026-03-01T01:00",
        "2026-03-01T02:00",
        "2026-03-01T03:00",
        "2026-03-01T04:00",
        "2026-03-01T05:00",
        "2026-03-01T06:00",
        "2026-03-01T07:00",
        "2026-03-01T08:00",
        "2026-03-01T09:00",
        "2026-03-01T10:00",
        "2026-03-01T11:00",
        "2026-03-01T12:00",
        "2026-03-01T13:00",
        "2026-03-01T14:00",
        "2026-03-01T15:00",
        "2026-03-01T16:00",
        "2026-03-01T17:00",
        "2026-03-01T18:00",
        "2026-03-01T19:00",
        "2026-03-01T20:00",
        "2026-03-01T21:00",
        "2026-03-01T22:00",
        "2026-03-01T23:00",
      ],
      temperature_2m: Array(24).fill(temp),
      precipitation_probability: Array(24).fill(precip),
      weather_code: Array(24).fill(code),
    },
  };
}

describe("getWeatherForecast", () => {
  it("returns temperature, precipitation, and description for a given location and time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          mockOpenMeteoResponse({
            temperature: 8.3,
            precipitation: 55,
            weatherCode: 61,
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await getWeatherForecast(47.37, 8.55, "2026-03-01", "18:00");

    expect(result).toEqual({
      temperature: 8.3,
      precipitation: 55,
      weatherCode: 61,
      description: "Rain",
    });
  });

  it("calls OpenMeteo API with correct URL parameters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockOpenMeteoResponse()), { status: 200 }),
    );

    await getWeatherForecast(47.37, 8.55, "2026-03-01", "18:00");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://api.open-meteo.com/v1/forecast",
    );
    expect(url.searchParams.get("latitude")).toBe("47.37");
    expect(url.searchParams.get("longitude")).toBe("8.55");
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,precipitation_probability,weather_code",
    );
    expect(url.searchParams.get("start_date")).toBe("2026-03-01");
    expect(url.searchParams.get("end_date")).toBe("2026-03-01");
  });

  it("handles API error gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(
      getWeatherForecast(47.37, 8.55, "2026-03-01", "18:00"),
    ).rejects.toThrow("OpenMeteo API error: 500");
  });

  it("maps weather codes to descriptions correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(mockOpenMeteoResponse({ weatherCode: 0 })),
        { status: 200 },
      ),
    );

    const result = await getWeatherForecast(47.37, 8.55, "2026-03-01", "12:00");
    expect(result.description).toBe("Clear sky");
  });
});

describe("isRainy", () => {
  it("returns true when precipitation probability is above 80", () => {
    expect(isRainy({ precipitation: 90 })).toBe(true);
  });

  it("returns false when precipitation probability is 80 or below", () => {
    expect(isRainy({ precipitation: 30 })).toBe(false);
    expect(isRainy({ precipitation: 80 })).toBe(false);
  });
});
