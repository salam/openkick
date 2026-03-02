import { Router } from "express";
import { getDB } from "../database.js";
import { getWeatherForecast, type WeatherForecast } from "../services/weather.js";
import { geocodeLocation } from "../services/geocoding.js";

export const weatherRouter = Router();

/** Map WMO weather codes to emoji icons */
function weatherCodeToEmoji(code: number): string {
  if (code === 0) return "\u2600\uFE0F"; // sunny
  if (code >= 1 && code <= 3) return "\u26C5"; // partly cloudy
  if (code >= 45 && code <= 48) return "\uD83C\uDF2B\uFE0F"; // fog
  if (code >= 51 && code <= 67) return "\uD83C\uDF27\uFE0F"; // rain
  if (code >= 71 && code <= 77) return "\u2744\uFE0F"; // snow
  if (code >= 80 && code <= 82) return "\uD83C\uDF27\uFE0F"; // rain showers
  if (code >= 85 && code <= 86) return "\u2744\uFE0F"; // snow showers
  if (code >= 95 && code <= 99) return "\u26C8\uFE0F"; // thunderstorm
  return "\u2601\uFE0F"; // overcast fallback
}

export interface WeatherResponse extends WeatherForecast {
  icon: string;
}

function getClubCoordinates(): { latitude: number; longitude: number } | null {
  const db = getDB();
  const latResult = db.exec("SELECT value FROM settings WHERE key = 'latitude'");
  const lonResult = db.exec("SELECT value FROM settings WHERE key = 'longitude'");

  if (
    latResult.length === 0 || latResult[0].values.length === 0 ||
    lonResult.length === 0 || lonResult[0].values.length === 0
  ) return null;

  const lat = parseFloat(latResult[0].values[0][0] as string);
  const lon = parseFloat(lonResult[0].values[0][0] as string);

  if (isNaN(lat) || isNaN(lon)) return null;
  return { latitude: lat, longitude: lon };
}

/**
 * GET /weather/current
 * Returns current weather at club location. No auth required.
 */
weatherRouter.get("/weather/current", async (_req, res) => {
  try {
    const coords = getClubCoordinates();
    if (!coords) {
      return res.status(404).json({ error: "No club coordinates configured" });
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = `${String(now.getHours()).padStart(2, "0")}:00`;

    const forecast = await getWeatherForecast(coords.latitude, coords.longitude, date, time);

    return res.json({
      ...forecast,
      icon: weatherCodeToEmoji(forecast.weatherCode),
    });
  } catch (err) {
    console.error("Weather current error:", err);
    return res.status(500).json({ error: "Failed to fetch weather" });
  }
});

/**
 * GET /events/:id/weather
 * Returns weather forecast for a specific event. No auth required.
 */
weatherRouter.get("/events/:id/weather", async (req, res) => {
  try {
    const db = getDB();
    const eventId = req.params.id;

    // Check for synthetic series ID like "series-1-2026-03-09"
    const seriesMatch = eventId.match(/^series-(\d+)-(\d{4}-\d{2}-\d{2})$/);
    let eventDate: string;
    let eventTime: string;
    let eventLocation: string | null;

    if (seriesMatch) {
      const seriesId = parseInt(seriesMatch[1], 10);
      eventDate = seriesMatch[2];
      const seriesResult = db.exec(
        "SELECT startTime, location FROM event_series WHERE id = ?",
        [seriesId],
      );
      if (seriesResult.length === 0 || seriesResult[0].values.length === 0) {
        return res.status(404).json({ error: "Event series not found" });
      }
      eventTime = (seriesResult[0].values[0][0] as string) || "18:00";
      eventLocation = seriesResult[0].values[0][1] as string | null;
    } else {
      const result = db.exec(
        "SELECT date, startTime, location FROM events WHERE id = ?",
        [parseInt(eventId, 10)],
      );
      if (result.length === 0 || result[0].values.length === 0) {
        return res.status(404).json({ error: "Event not found" });
      }
      eventDate = result[0].values[0][0] as string;
      eventTime = (result[0].values[0][1] as string) || "18:00";
      eventLocation = result[0].values[0][2] as string | null;
    }

    // Check if event is within 7 days (Open-Meteo forecast limit)
    const eventDateObj = new Date(eventDate);
    const now = new Date();
    const diffDays = (eventDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 7 || diffDays < -1) {
      return res.status(404).json({ error: "Weather forecast not available for this date" });
    }

    // Resolve coordinates: geocode event location, fall back to club coords
    let coords = eventLocation ? await geocodeLocation(eventLocation) : null;
    if (!coords) {
      coords = getClubCoordinates();
    }
    if (!coords) {
      return res.status(404).json({ error: "No coordinates available" });
    }

    const forecast = await getWeatherForecast(
      coords.latitude,
      coords.longitude,
      eventDate,
      eventTime,
    );

    return res.json({
      ...forecast,
      icon: weatherCodeToEmoji(forecast.weatherCode),
    });
  } catch (err) {
    console.error("Event weather error:", err);
    return res.status(500).json({ error: "Failed to fetch weather" });
  }
});
