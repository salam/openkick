'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface HomepageStats {
  lifetimeAthletes: number | null;
  activeAthletes: number | null;
  tournamentsPlayed: number | null;
  trophiesWon: number | null;
  trainingSessionsThisSeason: number | null;
  activeCoaches: number | null;
}

const STAT_CONFIG = [
  { key: 'lifetimeAthletes', label: 'Athletes' },
  { key: 'activeAthletes', label: 'Active' },
  { key: 'tournamentsPlayed', label: 'Tournaments' },
  { key: 'trophiesWon', label: 'Trophies' },
  { key: 'trainingSessionsThisSeason', label: 'Sessions' },
  { key: 'activeCoaches', label: 'Coaches' },
] as const;

export default function HomepageStatsBar() {
  const [stats, setStats] = useState<HomepageStats | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/public/homepage-stats`);
        if (res.ok) setStats(await res.json());
      } catch { /* ignore */ }
    }
    load();
  }, []);

  if (!stats) return null;

  const record = stats as unknown as Record<string, unknown>;
  const visibleStats = STAT_CONFIG.filter(
    (c) => record[c.key] != null
  );

  if (visibleStats.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-4">
      {visibleStats.map((c) => (
        <div
          key={c.key}
          className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-4 py-2 text-sm backdrop-blur-sm"
        >
          <span className="font-semibold text-gray-900">
            {record[c.key] as number}
          </span>
          <span className="text-gray-500">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
