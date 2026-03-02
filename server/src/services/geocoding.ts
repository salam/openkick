import { getDB } from "../database.js";

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "OpenKick/1.0 (youth-football-management)";

/** Cache TTL: 30 days in milliseconds */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Geocode a location string to coordinates.
 * Checks the geocoding_cache table first, falls back to Nominatim API.
 */
export async function geocodeLocation(
  locationText: string,
): Promise<GeoCoordinates | null> {
  if (!locationText || !locationText.trim()) return null;

  const normalized = locationText.trim();

  // Check cache first
  const cached = getCachedCoordinates(normalized);
  if (cached) return cached;

  // Call Nominatim
  const coords = await fetchFromNominatim(normalized);
  if (coords) {
    cacheCoordinates(normalized, coords);
  }

  return coords;
}

function getCachedCoordinates(locationText: string): GeoCoordinates | null {
  const db = getDB();
  const result = db.exec(
    "SELECT latitude, longitude, cached_at FROM geocoding_cache WHERE location_text = ?",
    [locationText],
  );

  if (result.length === 0 || result[0].values.length === 0) return null;

  const [latitude, longitude, cachedAt] = result[0].values[0] as [
    number,
    number,
    string,
  ];

  // Check if cache is still fresh
  const age = Date.now() - new Date(cachedAt).getTime();
  if (age > CACHE_TTL_MS) return null;

  return { latitude, longitude };
}

function cacheCoordinates(
  locationText: string,
  coords: GeoCoordinates,
): void {
  const db = getDB();
  db.run(
    "INSERT OR REPLACE INTO geocoding_cache (location_text, latitude, longitude, cached_at) VALUES (?, ?, ?, ?)",
    [locationText, coords.latitude, coords.longitude, new Date().toISOString()],
  );
}

async function fetchFromNominatim(
  query: string,
): Promise<GeoCoordinates | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { lat: string; lon: string }[];
  if (!data || data.length === 0) return null;

  return {
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
  };
}
