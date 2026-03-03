import { t } from '@/lib/i18n';

/** Map WMO weather code to a localized description using i18n keys */
export function weatherDescription(code: number): string {
  if (code === 0) return t('weather_clear_sky');
  if (code >= 1 && code <= 3) return t('weather_partly_cloudy');
  if (code >= 45 && code <= 48) return t('weather_foggy');
  if (code >= 51 && code <= 55) return t('weather_drizzle');
  if (code >= 56 && code <= 57) return t('weather_freezing_drizzle');
  if (code >= 61 && code <= 65) return t('weather_rain');
  if (code >= 66 && code <= 67) return t('weather_freezing_rain');
  if (code >= 71 && code <= 77) return t('weather_snow');
  if (code >= 80 && code <= 82) return t('weather_rain_showers');
  if (code >= 85 && code <= 86) return t('weather_snow_showers');
  if (code === 95) return t('weather_thunderstorm');
  if (code >= 96 && code <= 99) return t('weather_thunderstorm_hail');
  return t('weather_unknown');
}
