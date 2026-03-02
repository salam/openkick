'use client';

import { useState, useEffect } from 'react';
import { useClubSettings } from '@/hooks/useClubSettings';
import { t, getLanguage } from '@/lib/i18n';
import { isAuthenticated } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const LINK_GROUPS = [
  {
    labelKey: 'footer_feeds',
    links: [
      { name: 'RSS', href: `${API_URL}/api/feeds/rss` },
      { name: 'Atom', href: `${API_URL}/api/feeds/atom` },
      { name: 'Calendar', href: `${API_URL}/api/feeds/calendar.ics` },
    ],
  },
  {
    labelKey: 'footer_data',
    links: [
      { name: 'Sitemap', href: `${API_URL}/api/sitemap.xml` },
      { name: 'llms.txt', href: `${API_URL}/llms.txt` },
      { name: 'robots.txt', href: `${API_URL}/robots.txt` },
    ],
  },
  {
    labelKey: 'footer_api',
    links: [
      { name: 'Health', href: `${API_URL}/api/health` },
      { name: 'MCP', href: `${API_URL}/mcp` },
    ],
  },
];

export default function Footer() {
  const { club_name } = useClubSettings();
  const [lang, setLang] = useState('de'); // SSR-safe default
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    setLang(getLanguage());
    setLoggedIn(isAuthenticated());
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);
  const lt = (key: string) => t(key, lang);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-gray-200 bg-gray-50 px-6 py-4">
      <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-center gap-x-8 gap-y-2 text-xs text-gray-500">
        {LINK_GROUPS.map((group) => (
          <span key={group.labelKey}>
            <span className="font-medium text-gray-600">{lt(group.labelKey)}:</span>{' '}
            {group.links.map((link, i) => (
              <span key={link.name}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary-600 hover:underline"
                >
                  {link.name}
                </a>
                {i < group.links.length - 1 && ' · '}
              </span>
            ))}
          </span>
        ))}
      </div>
      <div className="mx-auto mt-2 flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
        <span>
          <span className="font-medium text-gray-600">{lt('footer_security')}:</span>{' '}
          <a
            href={`${API_URL}/.well-known/security.txt`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-600 hover:underline"
          >
            security.txt
          </a>
        </span>
        <span className="text-gray-300">|</span>
        <span className="flex items-center gap-2">
          <a href="/imprint/" className="hover:text-primary-600 hover:underline">
            {lt('imprint')}
          </a>
          <span>·</span>
          <a href="/privacy/" className="hover:text-primary-600 hover:underline">
            {lt('privacy')}
          </a>
          <span>·</span>
          <a
            href={loggedIn ? '/dashboard/' : '/login/'}
            className="rounded-md border border-gray-300 px-2.5 py-0.5 font-medium text-gray-600 transition hover:border-primary-500 hover:text-primary-600"
          >
            {loggedIn ? lt('dashboard') : lt('login')}
          </a>
        </span>
      </div>
      <p className="mt-2 text-center text-xs text-gray-400">
        &copy; {year} {club_name} · Powered by{' '}
        <a
          href="https://openkick.org"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary-600 hover:underline"
        >
          OpenKick
        </a>
      </p>
    </footer>
  );
}
