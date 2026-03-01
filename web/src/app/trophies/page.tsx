'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function placementLabel(placement: number, totalTeams: number | null): string {
  let suffix = 'th';
  if (placement === 1) suffix = 'st';
  else if (placement === 2) suffix = 'nd';
  else if (placement === 3) suffix = 'rd';
  const base = `${placement}${suffix}`;
  return totalTeams ? `${base} ${t('out_of')} ${totalTeams}` : base;
}

function placementIcon(placement: number): string {
  switch (placement) {
    case 1: return '\u{1F947}';
    case 2: return '\u{1F948}';
    case 3: return '\u{1F949}';
    default: return '\u{1F3C6}';
  }
}

function placementBadgeClass(placement: number): string {
  switch (placement) {
    case 1:
      return 'bg-gradient-to-r from-amber-50 to-yellow-100 text-amber-900 border-amber-300 shadow-sm';
    case 2:
      return 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-800 border-slate-300 shadow-sm';
    case 3:
      return 'bg-gradient-to-r from-orange-50 to-amber-100 text-orange-900 border-orange-300 shadow-sm';
    default:
      return 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 border-emerald-200 shadow-sm';
  }
}

function achievementPillClass(type: string): string {
  switch (type) {
    case '1st_place':
    case '2nd_place':
    case '3rd_place':
      return 'bg-amber-50 text-amber-700';
    case 'fair_play':
      return 'bg-emerald-50 text-emerald-700';
    case 'best_player':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-purple-50 text-purple-700';
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-gray-200 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div className="h-5 w-48 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded bg-gray-200" />
            <div className="h-6 w-20 rounded bg-gray-200" />
          </div>
          <div className="h-4 w-full rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export default function TrophyCabinetPage() {
  const [entries, setEntries] = useState<TrophyCabinetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    apiFetch<TrophyCabinetEntry[]>('/api/trophy-cabinet')
      .then((data) => {
        setEntries(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('failed_load_trophies'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('trophy_cabinet')}</h1>

      {loading && <LoadingSkeleton />}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-gray-500">{t('no_trophies')}</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-gray-200 p-5 space-y-3">
              {/* Row 1: title + date */}
              <div className="flex items-start justify-between">
                <a
                  href={`/events/${entry.eventId}`}
                  className="text-lg font-semibold text-emerald-600 hover:text-emerald-800"
                >
                  {entry.eventTitle}
                </a>
                <span className="text-sm text-gray-500">{formatDate(entry.eventDate)}</span>
              </div>

              {/* Row 2: placement badge + achievement badges */}
              <div className="flex flex-wrap items-center gap-2">
                {entry.placement != null && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${placementBadgeClass(entry.placement)}`}
                  >
                    <span className="text-base">{placementIcon(entry.placement)}</span>
                    {placementLabel(entry.placement, entry.totalTeams)}
                  </span>
                )}
                {entry.achievements.map((a, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${achievementPillClass(a.type)}`}
                  >
                    {a.label}
                  </span>
                ))}
              </div>

              {/* Row 3: summary */}
              {entry.summary && (
                <p className="text-sm text-gray-600">
                  {entry.summary.length > 150
                    ? `${entry.summary.slice(0, 150)}...`
                    : entry.summary}
                </p>
              )}

              {/* Row 4: results URL */}
              {entry.resultsUrl && (
                <a
                  href={entry.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-emerald-600 hover:text-emerald-800"
                >
                  {t('view_results')}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
