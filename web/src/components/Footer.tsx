'use client';

import { useClubSettings } from '@/hooks/useClubSettings';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const LINK_GROUPS = [
  {
    label: 'Feeds',
    links: [
      { name: 'RSS', href: `${API_URL}/api/feeds/rss` },
      { name: 'Atom', href: `${API_URL}/api/feeds/atom` },
      { name: 'Calendar', href: `${API_URL}/api/feeds/calendar.ics` },
    ],
  },
  {
    label: 'Discovery',
    links: [
      { name: 'Sitemap', href: `${API_URL}/api/sitemap.xml` },
      { name: 'llms.txt', href: `${API_URL}/llms.txt` },
      { name: 'robots.txt', href: `${API_URL}/robots.txt` },
    ],
  },
  {
    label: 'API',
    links: [
      { name: 'Health', href: `${API_URL}/api/health` },
      { name: 'MCP', href: `${API_URL}/mcp` },
    ],
  },
  {
    label: 'Security',
    links: [
      { name: 'security.txt', href: `${API_URL}/.well-known/security.txt` },
    ],
  },
];

export default function Footer() {
  const { club_name } = useClubSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-gray-200 bg-gray-50 px-6 py-4">
      <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-center gap-x-8 gap-y-2 text-xs text-gray-500">
        {LINK_GROUPS.map((group) => (
          <span key={group.label}>
            <span className="font-medium text-gray-600">{group.label}:</span>{' '}
            {group.links.map((link, i) => (
              <span key={link.name}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-600 hover:underline"
                >
                  {link.name}
                </a>
                {i < group.links.length - 1 && ' · '}
              </span>
            ))}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-gray-400">
        &copy; {year} {club_name}
      </p>
    </footer>
  );
}
