'use client';

import { useEffect, useState, useCallback } from 'react';
import { t, getLanguage } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface TickerEntry {
  id: number;
  tournamentId: number;
  matchLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  score: string | null;
  matchTime: string | null;
  source: string;
}

interface LiveTickerDetailProps {
  tournamentId: string;
}

export default function LiveTickerDetail({ tournamentId }: LiveTickerDetailProps) {
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const [entries, setEntries] = useState<TickerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/live-ticker/${tournamentId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: TickerEntry[] = await res.json();
      setEntries(data);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  // Fetch on mount + every 30 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Update "seconds ago" counter every second
  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* LIVE indicator */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary-500" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-wide text-primary-700">
            {t('live')}
          </span>
        </div>

        {lastUpdated && (
          <span className="text-xs text-gray-400">
            {t('last_updated')} {secondsAgo}{t('seconds_ago')}
          </span>
        )}
      </div>

      {/* Match grid */}
      {entries.length === 0 ? (
        <p className="py-12 text-center text-gray-500">{t('no_matches')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              {entry.matchLabel && (
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {entry.matchLabel}
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="flex-1 text-right text-sm font-medium text-gray-800">
                  {entry.homeTeam}
                </span>

                <span className="min-w-[3rem] text-center text-xl font-bold text-primary-600">
                  {entry.score ?? '-'}
                </span>

                <span className="flex-1 text-left text-sm font-medium text-gray-800">
                  {entry.awayTeam}
                </span>
              </div>

              {entry.matchTime && (
                <p className="mt-2 text-center text-xs text-gray-400">{entry.matchTime}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
