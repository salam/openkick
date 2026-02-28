export interface WeatherForecast {
  temperature: number; // Celsius
  precipitation: number; // Probability percentage (0-100)
  weatherCode: number; // WMO weather code
  description: string; // Human-readable ("Sunny", "Light rain", etc.)
}

interface OpenMeteoHourlyResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
}

export async function getWeatherForecast(
  latitude: number,
  longitude: number,
  date: string, // ISO date YYYY-MM-DD
  time: string, // HH:MM
): Promise<WeatherForecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,weather_code",
  );
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `OpenMeteo API error: ${response.status} ${response.statusText}`,
    );
  }

  const data: OpenMeteoHourlyResponse = await response.json();

  const hour = parseInt(time.split(":")[0], 10);
  const targetISO = `${date}T${String(hour).padStart(2, "0")}:00`;

  const index = data.hourly.time.indexOf(targetISO);
  if (index === -1) {
    throw new Error(
      `No data found for time ${time} on ${date}. Available times: ${data.hourly.time.join(", ")}`,
    );
  }

  const weatherCode = data.hourly.weather_code[index];

  return {
    temperature: data.hourly.temperature_2m[index],
    precipitation: data.hourly.precipitation_probability[index],
    weatherCode,
    description: weatherCodeToDescription(weatherCode),
  };
}

export function isRainy(forecast: Pick<WeatherForecast, "precipitation">): boolean {
  return forecast.precipitation > 80;
}

function weatherCodeToDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code >= 1 && code <= 3) return "Partly cloudy";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 56 && code <= 57) return "Freezing drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 66 && code <= 67) return "Freezing rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code >= 96 && code <= 99) return "Thunderstorm with hail";
  return "Unknown";
}
