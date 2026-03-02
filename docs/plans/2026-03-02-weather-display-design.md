# Weather Display on Events & Navbar

**Date:** 2026-03-02

## Goal

Show weather forecasts on training/tournament days in the event cards and event detail pages, plus a compact current-weather widget in the navbar header.

## Architecture

### Backend

1. **Geocoding service** (`server/src/services/geocoding.ts`) — Calls OSM Nominatim `search` endpoint to resolve event location text → lat/lon. Caches results in `geocoding_cache` SQLite table to respect Nominatim rate limits (1 req/sec).

2. **`GET /api/events/:id/weather`** — Resolves event location → coordinates (cache → Nominatim → club global fallback), then calls existing `getWeatherForecast()`. Returns forecast.

3. **`GET /api/weather/current`** — Returns weather for today at club global coordinates. Used by the navbar widget.

### Frontend

1. **Navbar** — Compact weather pill next to language toggle: emoji icon + temperature (e.g. `☀️ 14°`). Tooltip shows full description.

2. **EventCard** — Small weather badge after date/time row: icon + temp + precipitation %. Only for events ≤7 days out.

3. **Event detail page** — Icon + temp + description + precipitation probability.

### Geocoding Cache

```sql
geocoding_cache(
  location_text TEXT PRIMARY KEY,
  latitude REAL,
  longitude REAL,
  cached_at TEXT
)
```

### Weather Icon Mapping (WMO codes → emoji)

| Code | Icon | Description |
|------|------|-------------|
| 0 | ☀️ | Clear sky |
| 1-3 | ⛅ | Partly cloudy |
| 45-48 | 🌫 | Fog |
| 51-67 | 🌧 | Rain/drizzle |
| 71-77 | ❄️ | Snow |
| 80-82 | 🌧 | Rain showers |
| 85-86 | ❄️ | Snow showers |
| 95-99 | ⛈ | Thunderstorm |

### Edge Cases

- Events >7 days out: no weather shown (API forecast limit)
- Location can't be geocoded: fall back to club global coordinates
- No club coordinates: no weather shown
- Nominatim rate limit: mitigated by caching

## Files to Create/Modify

### New
- `server/src/services/geocoding.ts` — Nominatim geocoding + cache
- `server/src/services/__tests__/geocoding.test.ts`
- `server/src/routes/weather.ts` — Weather API endpoints
- `server/src/routes/__tests__/weather.test.ts`

### Modify
- `server/src/database.ts` — Add `geocoding_cache` table
- `server/src/index.ts` — Register weather routes
- `web/src/components/Navbar.tsx` — Add weather pill
- `web/src/components/EventCard.tsx` — Add weather badge
- `web/src/app/events/[id]/EventDetailClient.tsx` — Add weather display
- `server/src/utils/translations/{en,de,fr}.ts` — Weather UI labels
