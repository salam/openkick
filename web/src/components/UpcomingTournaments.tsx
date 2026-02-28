'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Tournament {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  deadline?: string;
}

type RegistrationStatus = 'open' | 'closing_soon' | 'closed';

function getRegistrationStatus(deadline?: string): RegistrationStatus {
  if (!deadline) return 'open';
  const now = new Date();
  const dl = new Date(deadline);
  const diffMs = dl.getTime() - now.getTime();
  if (diffMs <= 0) return 'closed';
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 48) return 'closing_soon';
  return 'open';
}

const statusStyles: Record<RegistrationStatus, string> = {
  open: 'bg-emerald-100 text-emerald-700',
  closing_soon: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-700',
};

const statusLabels: Record<RegistrationStatus, string> = {
  open: 'Open',
  closing_soon: 'Closing soon',
  closed: 'Closed',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function UpcomingTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<Tournament[]>(
          '/api/events?type=tournament&upcoming=true',
        );
        setTournaments(data.slice(0, 3));
      } catch {
        // API not available — leave empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (!loading && tournaments.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-14 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <div className="h-4 w-44 animate-pulse rounded bg-gray-200" />
                <div className="mt-1 h-3 w-28 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
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
          Upcoming Tournaments
        </h2>
        <Link
          href="/events?type=tournament"
          className="text-xs text-emerald-600 hover:text-emerald-800"
        >
          View all
        </Link>
      </div>
      <div className="space-y-3">
        {tournaments.map((t) => {
          const status = getRegistrationStatus(t.deadline);
          return (
            <Link
              key={t.id}
              href={`/events/${t.id}/`}
              className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {t.title}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <span>{formatDate(t.date)}</span>
                  <span>&middot;</span>
                  <span className="truncate">{t.location}</span>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
              >
                {statusLabels[status]}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
