'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TickerEntry {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  matchTime: string;
}

interface ActiveTournamentTicker {
  tournamentId: string;
  tournamentTitle: string;
  date: string;
  entries: TickerEntry[];
}

interface FlatEntry extends TickerEntry {
  tournamentId: string;
}

export default function LiveTickerBar() {
  const [entries, setEntries] = useState<FlatEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    async function fetchTicker() {
      try {
        const res = await fetch(`${API_URL}/api/live-ticker/active`);
        if (!res.ok) return;
        const data: ActiveTournamentTicker[] = await res.json();
        const flat: FlatEntry[] = data.flatMap((t) =>
          t.entries.map((e) => ({ ...e, tournamentId: t.tournamentId }))
        );
        setEntries(flat);
      } catch {
        // silently ignore fetch errors
      }
    }

    fetchTicker();
    const pollInterval = setInterval(fetchTicker, 30_000);
    return () => clearInterval(pollInterval);
  }, []);

  useEffect(() => {
    if (entries.length <= 1) return;
    const rotateInterval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % entries.length);
    }, 5_000);
    return () => clearInterval(rotateInterval);
  }, [entries.length]);

  if (entries.length === 0) return null;

  const entry = entries[currentIndex % entries.length];
  if (!entry) return null;

  return (
    <Link
      href={`/live/${entry.tournamentId}`}
      className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm transition hover:bg-emerald-100"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="font-semibold text-emerald-700">Live</span>
      <span className="text-gray-700">
        {entry.homeTeam}{' '}
        <span className="font-bold">
          {entry.homeScore} : {entry.awayScore}
        </span>{' '}
        {entry.awayTeam}
      </span>
      <span className="text-xs text-gray-400">{entry.matchTime}</span>
    </Link>
  );
}
