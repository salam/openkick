'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { t, getLanguage } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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

function statusLabel(status: TournamentView['status']): string {
  switch (status) {
    case 'open':
      return t('registration_open');
    case 'closing_soon':
      return t('closing_soon');
    case 'closed':
      return t('closed');
  }
}

const STATUS_CLASSES: Record<TournamentView['status'], string> = {
  open: 'bg-primary-100 text-primary-700',
  closing_soon: 'bg-amber-100 text-amber-800',
  closed: 'bg-red-100 text-red-800',
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

export default function PublicTournamentClient() {
  const { id } = useParams();
  const [tournament, setTournament] = useState<TournamentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

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
      .catch(() => setError(t('tournament_not_found')))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSkeleton />;

  if (error || !tournament) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-red-800">
            {error || t('tournament_not_found')}
          </h2>
          <a
            href="/"
            className="mt-4 inline-block text-sm text-primary-600 underline hover:text-primary-800"
          >
            {t('back_to_home')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-primary-100 px-3 py-0.5 text-xs font-semibold text-primary-700">
            {t('tournament')}
          </span>
          <span
            className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_CLASSES[tournament.status]}`}
          >
            {statusLabel(tournament.status)}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          {tournament.title}
        </h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <InfoItem label={t('date')} value={formatDate(tournament.date)} />
        {tournament.startTime && (
          <InfoItem label={t('rsvp_start_time')} value={tournament.startTime} />
        )}
        {tournament.location && (
          <InfoItem label={t('location')} value={tournament.location} />
        )}
        {tournament.teamName && (
          <InfoItem label={t('team')} value={tournament.teamName} />
        )}
        <InfoItem
          label={t('registered')}
          value={
            tournament.maxParticipants
              ? `${tournament.attendingCount} / ${tournament.maxParticipants}`
              : String(tournament.attendingCount)
          }
        />
      </section>

      {tournament.teams.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('teams')}
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
                  <p className="text-xs italic text-gray-400">{t('rsvp_no_players')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {team.players.map((p, j) => (
                      <span
                        key={j}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700"
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

      <div className="pt-4">
        <a
          href="/"
          className="text-sm text-primary-600 underline hover:text-primary-800"
        >
          {t('back_to_home')}
        </a>
      </div>
    </main>
  );
}
