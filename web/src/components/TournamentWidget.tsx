'use client';

import { useEffect, useState } from 'react';
import LiveTickerBar from './LiveTickerBar';
import { formatDateLong } from '@/lib/date';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface TournamentEvent {
  id: string;
  title: string;
  date: string;
  location?: string;
  type?: string;
}

interface GameHistory {
  tournamentName?: string;
  placement?: number;
}

export default function TournamentWidget() {
  const [hasActive, setHasActive] = useState<boolean | null>(null);
  const [nextTournament, setNextTournament] = useState<TournamentEvent | null>(null);
  const [lastResult, setLastResult] = useState<GameHistory | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`${API_URL}/api/live-ticker/active`);
        if (!res.ok) {
          setHasActive(false);
          return;
        }
        const data = await res.json();
        const active =
          Array.isArray(data) &&
          data.some((t: { entries?: unknown[] }) => t.entries && t.entries.length > 0);
        setHasActive(active);

        if (!active) {
          fetchIdleData();
        }
      } catch {
        setHasActive(false);
        fetchIdleData();
      }
    }

    async function fetchIdleData() {
      try {
        const eventsRes = await fetch(`${API_URL}/api/events?type=tournament`);
        if (eventsRes.ok) {
          const events: TournamentEvent[] = await eventsRes.json();
          const now = new Date();
          const future = events
            .filter((e) => new Date(e.date) > now)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          if (future.length > 0) {
            setNextTournament(future[0]);
          }
        }
      } catch {
        // ignore
      }

      try {
        const historyRes = await fetch(`${API_URL}/api/game-history/latest`);
        if (historyRes.ok) {
          const history: GameHistory = await historyRes.json();
          setLastResult(history);
        }
      } catch {
        // ignore
      }
    }

    check();
  }, []);

  if (hasActive === null) return null;

  if (hasActive) {
    return <LiveTickerBar />;
  }

  const hasIdle = nextTournament || lastResult;
  if (!hasIdle) return null;

  return (
    <div className="flex w-full max-w-md flex-col gap-4 sm:flex-row">
      {nextTournament && (
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Next Tournament
          </p>
          <p className="font-medium text-gray-800">{nextTournament.title}</p>
          <p className="text-sm text-gray-500">
            {formatDateLong(nextTournament.date)}
          </p>
          {nextTournament.location && (
            <p className="text-sm text-gray-400">{nextTournament.location}</p>
          )}
        </div>
      )}
      {lastResult && lastResult.tournamentName && (
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Last Tournament
          </p>
          <p className="font-medium text-gray-800">{lastResult.tournamentName}</p>
          {lastResult.placement != null && (
            <p className="text-sm text-gray-500">
              Rang {lastResult.placement}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
