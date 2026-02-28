'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

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

function placementColor(placement: number): string {
  switch (placement) {
    case 1:
      return 'bg-amber-100 text-amber-800';
    case 2:
      return 'bg-gray-100 text-gray-700';
    case 3:
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-50 text-gray-600';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
          Recent Trophies
        </h2>
        <a
          href="/trophies"
          className="text-xs text-emerald-600 hover:text-emerald-800"
        >
          View all
        </a>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between">
            <div>
              <a
                href={`/events/${entry.eventId}`}
                className="text-sm font-medium text-gray-900 hover:text-emerald-600"
              >
                {entry.eventTitle}
              </a>
              <p className="text-xs text-gray-500">
                {formatDate(entry.eventDate)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {entry.placement && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${placementColor(entry.placement)}`}
                >
                  {ordinal(entry.placement)}
                </span>
              )}
              {entry.achievements.length > 0 && (
                <span className="text-xs font-medium text-amber-600">
                  T {entry.achievements.length}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
