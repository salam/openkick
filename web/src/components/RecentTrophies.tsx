'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/date';

interface TrophyCabinetEntry {
  id: number;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  eventType: string;
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  resultsUrl: string | null;
  achievements: { type: string; label: string }[];
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function placementIcon(placement: number): string {
  switch (placement) {
    case 1: return '\u{1F947}';
    case 2: return '\u{1F948}';
    case 3: return '\u{1F949}';
    default: return '\u{1F3C6}';
  }
}

function placementColor(placement: number): string {
  switch (placement) {
    case 1:
      return 'bg-gradient-to-r from-amber-50 to-yellow-100 text-amber-900';
    case 2:
      return 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-800';
    case 3:
      return 'bg-gradient-to-r from-orange-50 to-amber-100 text-orange-900';
    default:
      return 'bg-gradient-to-r from-primary-50 to-primary-100 text-primary-800';
  }
}

export default function RecentTrophies() {
  const [entries, setEntries] = useState<TrophyCabinetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<TrophyCabinetEntry[]>(
          '/api/trophy-cabinet?limit=5',
        );
        setEntries(data);
      } catch {
        // API not available — leave empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (!loading && entries.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-14 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
                <div className="mt-1 h-3 w-24 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="h-5 w-10 animate-pulse rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('recent_trophies')}
        </h2>
        <a
          href="/trophies"
          className="text-xs text-primary-600 hover:text-primary-800"
        >
          {t('view_all')}
        </a>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <a
            key={entry.id}
            href={`/events/${entry.eventId}`}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50"
          >
            {entry.placement != null && (
              <span
                className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-center ${placementColor(entry.placement)}`}
              >
                <span className="text-xl leading-none">{placementIcon(entry.placement)}</span>
                <span className="mt-0.5 text-xs font-bold">
                  {ordinal(entry.placement)}
                  {entry.totalTeams != null && <span className="font-normal opacity-70">/{entry.totalTeams}</span>}
                </span>
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {entry.eventTitle}
              </p>
              <p className="text-xs text-gray-500">
                {formatDate(entry.eventDate)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
