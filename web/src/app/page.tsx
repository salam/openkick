'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SubscribeCard from '@/components/SubscribeCard';
import TournamentWidget from '@/components/TournamentWidget';
import { useClubSettings } from '@/hooks/useClubSettings';
import { t, getLanguage } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const { club_name, club_description, club_logo } = useClubSettings();
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {club_logo ? (
        <img src={`${API_URL}${club_logo}`} alt={club_name} className="h-20 w-20 rounded-full object-cover" />
      ) : null}
      <h1 className="text-4xl font-bold">{club_name}</h1>
      <p className="text-lg text-gray-600">{club_description}</p>

      <div className="flex gap-4">
        <Link href="/login/" className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600">
          {t('login')}
        </Link>
        <Link href="/dashboard/" className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          {t('dashboard')}
        </Link>
      </div>

      <TournamentWidget />
      <SubscribeCard />
    </main>
  );
}
