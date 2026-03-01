'use client';

import { useState, useEffect } from 'react';
import RecentTrophies from '@/components/RecentTrophies';
import UpcomingTournaments from '@/components/UpcomingTournaments';
import SubscribeCard from '@/components/SubscribeCard';
import TournamentWidget from '@/components/TournamentWidget';
import HomepageCustomizer from '@/components/HomepageCustomizer';
import DonateCard from '@/components/DonateCard';
import { getLanguage } from '@/lib/i18n';
import { isAuthenticated } from '@/lib/auth';
import LanguageToggle from '@/components/LanguageToggle';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Settings {
  club_name: string;
  club_description: string;
  club_logo: string;
  tint_color: string;
  homepage_bg_image: string;
}

const DEFAULTS: Settings = {
  club_name: 'OpenKick',
  club_description: 'Youth Football Management',
  club_logo: '',
  tint_color: '#10b981',
  homepage_bg_image: '',
};

export default function Home() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [, setLang] = useState(() => getLanguage());
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/settings`);
        const data = await res.json();
        setS({
          club_name: data.club_name || DEFAULTS.club_name,
          club_description: data.club_description || DEFAULTS.club_description,
          club_logo: data.club_logo || '',
          tint_color: data.tint_color || DEFAULTS.tint_color,
          homepage_bg_image: data.homepage_bg_image || '',
        });
      } catch { /* use defaults */ }
    }
    load();
  }, []);

  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  function handleUpdate(key: string, value: string) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  const bgStyle = s.homepage_bg_image
    ? { backgroundImage: `url(${API_URL}${s.homepage_bg_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8"
      style={{ ...bgStyle, '--tint': s.tint_color } as React.CSSProperties}
    >
      {s.homepage_bg_image && (
        <div className="absolute inset-0 bg-white/80" />
      )}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {loggedIn && (
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
