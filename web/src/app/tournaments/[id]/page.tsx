'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/* ── Types ──────────────────────────────────────────────────────────── */

interface TournamentView {
  title: string;
  date: string;
  startTime: string | null;
  location: string | null;
  teamName: string | null;
  status: 'open' | 'closing_soon' | 'closed';
  attendingCount: number;
  maxParticipants: number | null;
  teams: { name: string; players: { initial: string }[] }[];
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-CH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const STATUS_CONFIG: Record<
  TournamentView['status'],
  { classes: string; label: string }
> = {
  open: {
    classes: 'bg-emerald-100 text-emerald-700',
    label: 'Registration Open',
  },
  closing_soon: {
    classes: 'bg-amber-100 text-amber-800',
    label: 'Closing Soon',
  },
  closed: {
    classes: 'bg-red-100 text-red-800',
    label: 'Closed',
  },
};

/* ── Loading skeleton ────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6 p-6">
      <div className="h-8 w-2/3 rounded bg-gray-200" />
      <div className="h-4 w-1/3 rounded bg-gray-200" />
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/* ── Main Page Component ─────────────────────────────────────────────── */

export default function PublicTournamentPage() {
  const { id } = useParams();
  const [tournament, setTournament] = useState<TournamentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    fetch(`${API_URL}/api/public/tournaments/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data: TournamentView) => {
        setTournament(data);
        setError(null);
      })
      .catch(() => setError('Tournament not found'))
      .finally(() => setLoading(false));
  }, [id]);

  /* ── Render ── */

  if (loading) return <LoadingSkeleton />;

  if (error || !tournament) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-red-800">
            {error || 'Tournament not found'}
          </h2>
          <a
            href="/"
            className="mt-4 inline-block text-sm text-emerald-600 underline hover:text-emerald-800"
          >
            Back to home
          </a>
        </div>
      </div>
    );
  }

  const { classes, label } = STATUS_CONFIG[tournament.status];

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      {/* ── Header ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
            Tournament
          </span>
          <span
            className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${classes}`}
          >
            {label}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          {tournament.title}
        </h1>
      </div>

      {/* ── Info grid ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <InfoItem label="Date" value={formatDate(tournament.date)} />
        {tournament.startTime && (
          <InfoItem label="Start time" value={tournament.startTime} />
        )}
        {tournament.location && (
          <InfoItem label="Location" value={tournament.location} />
        )}
        {tournament.teamName && (
          <InfoItem label="Team" value={tournament.teamName} />
        )}
        <InfoItem
          label="Registered"
          value={
            tournament.maxParticipants
              ? `${tournament.attendingCount} / ${tournament.maxParticipants}`
              : String(tournament.attendingCount)
          }
        />
      </section>

      {/* ── Teams ── */}
      {tournament.teams.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Teams
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {tournament.teams.map((team, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 p-4"
              >
                <h3 className="mb-2 font-semibold text-gray-800">
                  {team.name}
                </h3>
                {team.players.length === 0 ? (
                  <p className="text-xs italic text-gray-400">No players</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {team.players.map((p, j) => (
                      <span
                        key={j}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700"
                      >
                        {p.initial}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Back link ── */}
      <div className="pt-4">
        <a
          href="/"
          className="text-sm text-emerald-600 underline hover:text-emerald-800"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}
