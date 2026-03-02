'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { t, getLanguage } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import LanguageToggle from '@/components/LanguageToggle';
import { useClubSettings } from '@/hooks/useClubSettings';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface WeatherData {
  temperature: number;
  icon: string;
  description: string;
}

const navLinks = [
  { href: '/dashboard/', label: 'dashboard' },
  { href: '/calendar/', label: 'calendar' },
  { href: '/players/', label: 'players' },
  { href: '/surveys/', label: 'surveys' },
  { href: '/dashboard/checklists/', label: 'checklists' },
  { href: '/dashboard/payments/', label: 'payments_title' },
  { href: '/settings/', label: 'settings' },
];

const SERVER_LANG = 'de';

export default function Navbar() {
  const { club_name, club_logo } = useClubSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [lang, setLang] = useState(SERVER_LANG);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // After mount, switch to the user's real language (avoids hydration mismatch)
  useEffect(() => {
    setLang(getLanguage());
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  // Fetch current weather for the navbar pill
  useEffect(() => {
    apiFetch<WeatherData>('/api/weather/current')
      .then(setWeather)
      .catch(() => {}); // silently fail — weather is non-critical
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    router.replace('/login/');
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard/" className="flex items-center gap-2">
            {club_logo ? (
              <img
                src={`${API_URL}${club_logo}`}
                alt={club_name}
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-sm font-bold text-white">
                {(club_name || 'OK').slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="text-lg font-semibold text-gray-900">{club_name || 'OpenKick'}</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {t(link.label, lang)}
                </Link>
              );
            })}
          </div>

          {/* Desktop actions */}
          <div className="hidden items-center gap-2 md:flex">
            {weather && (
              <span
                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                title={weather.description}
              >
                {weather.icon} {Math.round(weather.temperature)}&deg;
              </span>
            )}
            <LanguageToggle />
            <button
              onClick={handleLogout}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              {t('logout', lang)}
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 md:hidden"
            aria-label="Toggle menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-200 md:hidden">
          <div className="space-y-1 px-4 py-3">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {t(link.label, lang)}
                </Link>
              );
            })}
            <div className="border-t border-gray-200 pt-2 mt-2 flex items-center gap-2">
              {weather && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {weather.icon} {Math.round(weather.temperature)}&deg; &middot; {weather.description}
                </span>
              )}
              <LanguageToggle />
            </div>
            <button
              onClick={handleLogout}
              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              {t('logout', lang)}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
