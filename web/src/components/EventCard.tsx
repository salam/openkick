'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { t, getLanguage } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { weatherDescription } from '@/lib/weather';

interface WeatherData {
  temperature: number;
  precipitation: number;
  weatherCode: number;
  icon: string;
  description: string;
}

interface EventCardProps {
  id: string;
  title: string;
  type: 'training' | 'tournament' | 'match';
  date: string;
  time: string;
  location: string;
  attendingCount: number;
  totalPlayers: number;
  deadline?: string;
  categories?: string[];
  seriesId?: number;
}

const typeBadgeStyles: Record<string, string> = {
  training: 'bg-blue-100 text-blue-700',
  tournament: 'bg-purple-100 text-purple-700',
  match: 'bg-orange-100 text-orange-700',
};

const typeI18nKeys: Record<string, string> = {
  training: 'type_training',
  tournament: 'type_tournament',
  match: 'type_match',
};

function isDeadlineApproaching(deadline: string): boolean {
  const now = new Date();
  const dl = new Date(deadline);
  const diffHours = (dl.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > 0 && diffHours < 48;
}

export default function EventCard({
  id,
  title,
  type,
  date,
  time,
  location,
  attendingCount,
  totalPlayers,
  deadline,
  categories,
  seriesId,
}: EventCardProps) {
  const deadlineClose = deadline ? isDeadlineApproaching(deadline) : false;
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  // Fetch weather for events within the next 7 days
  useEffect(() => {
    const eventDate = new Date(date);
    const now = new Date();
    const diffDays = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 7 || diffDays < -1) return;

    apiFetch<WeatherData>(`/api/events/${id}/weather`)
      .then(setWeather)
      .catch(() => {});
  }, [id, date]);

  return (
    <Link
      href={`/events/${id}/`}
      className="block rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-1.5">
          {seriesId && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {t('series')}
            </span>
          )}
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeStyles[type] || 'bg-gray-100 text-gray-700'}`}
          >
            {typeI18nKeys[type] ? t(typeI18nKeys[type]) : type}
          </span>
        </div>
      </div>

      <div className="mb-3 space-y-1 text-sm text-gray-500">
        <div className="flex items-center gap-1.5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <span>{date} &middot; {time}</span>
          {weather && (
            <span className="ml-auto text-xs text-gray-400" title={weatherDescription(weather.weatherCode)}>
              {weather.icon} {Math.round(weather.temperature)}&deg;
              {weather.precipitation > 0 && <> &middot; {weather.precipitation}%</>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          <span>{location}</span>
        </div>
      </div>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {categories.map((cat) => (
            <span
              key={cat}
              className="rounded bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Footer: attendance + deadline */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-sm font-medium text-gray-700">
          {attendingCount}/{totalPlayers} {t('attending')}
        </span>
        {deadlineClose && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {t('deadline_soon')}
          </span>
        )}
      </div>
    </Link>
  );
}
