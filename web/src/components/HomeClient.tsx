'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RecentTrophies from '@/components/RecentTrophies';
import UpcomingTournaments from '@/components/UpcomingTournaments';
import SubscribeCard from '@/components/SubscribeCard';
import TournamentWidget from '@/components/TournamentWidget';
import HomepageCustomizer from '@/components/HomepageCustomizer';
import DonateCard from '@/components/DonateCard';
import { t, getLanguage } from '@/lib/i18n';
import { getUserRole } from '@/lib/auth';
import LanguageToggle from '@/components/LanguageToggle';
import HomepageStatsBar from '@/components/HomepageStatsBar';
import { weatherDescription } from '@/lib/weather';
import { formatDateWeekday } from '@/lib/date';
import type { ClubSettings } from '@/hooks/useClubSettings';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  icon: string;
  description: string;
  eventTitle?: string;
  eventDate?: string;
}

interface NextEventData {
  id: number | string;
  title: string;
  date: string;
  startTime: string | null;
  source: 'event' | 'series' | 'training';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function relativeDay(dateStr: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return t('next_event_today');
  if (diff === 1) return t('next_event_tomorrow');
  return null;
}

function NextEventCard({ event, weather }: { event: NextEventData; weather: WeatherData | null }) {
  const relative = relativeDay(event.date);
  const dateLabel = relative ?? formatDateWeekday(event.date);
  const href = `/events/${event.id}/`;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-full bg-white/70 px-4 py-2 shadow-sm transition hover:bg-white hover:shadow-md"
    >
      <span className="text-lg">{weather ? weather.icon : '\u{1F4C5}'}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-gray-900 group-hover:text-primary-700">
          {event.title}
        </span>
        <span className="text-xs text-gray-500">
          {dateLabel}
          {event.startTime && ` · ${event.startTime}`}
          {weather && ` · ${Math.round(weather.temperature)}° ${weatherDescription(weather.weatherCode)}`}
        </span>
      </span>
      <svg className="ml-1 h-4 w-4 text-gray-400 transition group-hover:text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

interface Props {
  initialSettings: ClubSettings;
}

export default function HomeClient({ initialSettings }: Props) {
  const router = useRouter();
  const [s, setS] = useState(initialSettings);
  const [, setLang] = useState(() => getLanguage());
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [nextEvent, setNextEvent] = useState<NextEventData | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/setup/status`)
      .then(r => r.json())
      .then(({ needsSetup }: { needsSetup: boolean }) => {
        if (needsSetup) {
          router.replace('/setup/');
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true));
  }, [router]);

  useEffect(() => {
    setIsAdmin(getUserRole() === 'admin');
  }, []);

  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/weather/current`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setWeather(d); })
      .catch(() => {});
    fetch(`${API_URL}/api/public/next-event`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setNextEvent(d); })
      .catch(() => {});
  }, []);

  function handleUpdate(key: string, value: string) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const bgStyle = s.homepage_bg_image
    ? { backgroundImage: `url(${API_URL}${s.homepage_bg_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8"
      style={bgStyle}
    >
      {s.homepage_bg_image && (
        <div className="absolute inset-0 bg-white/80" />
      )}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {isAdmin && (
          <HomepageCustomizer
            tintColor={s.tint_color}
            bgImage={s.homepage_bg_image}
            onUpdate={handleUpdate}
          />
        )}
        <LanguageToggle />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-8">
        {s.club_logo ? (
          <img src={`${API_URL}${s.club_logo}`} alt={s.club_name} className="h-20 w-20 rounded-full object-cover" />
        ) : null}
        <h1 className="text-4xl font-bold">{s.club_name}</h1>
        <p className="text-lg text-gray-600">{s.club_description}</p>
        {nextEvent && <NextEventCard event={nextEvent} weather={weather} />}

        <HomepageStatsBar />

        <div className="w-full max-w-md">
          <RecentTrophies />
          <UpcomingTournaments />
        </div>
        <TournamentWidget />
        <DonateCard />
        <SubscribeCard />
      </div>
    </main>
  );
}
