'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RecentTrophies from '@/components/RecentTrophies';
import UpcomingTournaments from '@/components/UpcomingTournaments';
import SubscribeCard from '@/components/SubscribeCard';
import TournamentWidget from '@/components/TournamentWidget';
import HomepageCustomizer from '@/components/HomepageCustomizer';
import DonateCard from '@/components/DonateCard';
import { getLanguage } from '@/lib/i18n';
import { getUserRole } from '@/lib/auth';
import LanguageToggle from '@/components/LanguageToggle';
import HomepageStatsBar from '@/components/HomepageStatsBar';
import type { ClubSettings } from '@/hooks/useClubSettings';

interface WeatherData {
  temperature: number;
  icon: string;
  description: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
        {weather && (
          <span
            className="rounded-full bg-white/70 px-3 py-1 text-sm font-medium text-gray-700 shadow-sm"
            title={weather.description}
          >
            {weather.icon} {Math.round(weather.temperature)}&deg; &middot; {weather.description}
          </span>
        )}

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
