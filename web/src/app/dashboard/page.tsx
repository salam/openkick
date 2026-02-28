'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import EventCard from '@/components/EventCard';
import OnboardingChecklist from '@/components/OnboardingChecklist';

interface ApiEvent {
  id: string;
  title: string;
  type: 'training' | 'tournament' | 'match';
  date: string;
  time: string;
  location: string;
  attendingCount: number;
  totalPlayers: number;
  deadline?: string;
  categories?: string[];
  seriesId?: number;
}

interface ApiPlayer {
  id: string;
  name: string;
}

type FilterType = 'all' | 'training' | 'tournament' | 'match';

const filterButtons: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'training', label: 'Training' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'match', label: 'Match' },
];

export default function DashboardPage() {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [eventsData, playersData] = await Promise.all([
          apiFetch<ApiEvent[]>('/api/events'),
          apiFetch<ApiPlayer[]>('/api/players'),
        ]);
        setEvents(eventsData);
        setPlayers(playersData);
      } catch {
        // API not available yet - use empty state
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredEvents =
    filter === 'all' ? events : events.filter((e) => e.type === filter);

  const pendingResponses = events.reduce(
    (sum, e) => sum + (e.totalPlayers - e.attendingCount),
    0,
  );

  return (
    <div>
      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('dashboard')}</h1>

      <OnboardingChecklist />

      {/* Quick stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">{t('players')}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {loading ? '-' : players.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">{t('events')}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {loading ? '-' : events.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Pending Responses</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {loading ? '-' : pendingResponses}
          </p>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setFilter(btn.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === btn.value
                ? 'bg-emerald-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Events grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 9v9.75" />
          </svg>
          <p className="mt-2 text-sm font-medium text-gray-600">No events yet</p>
          <p className="mt-1 text-xs text-gray-400">Create your first event or set up a recurring series</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/events/new/"
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              Create Event
            </Link>
            <Link
              href="/events/new/?series=true"
              className="rounded-xl border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50"
            >
              Create Series
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              id={event.id}
              title={event.title}
              type={event.type}
              date={event.date}
              time={event.time}
              location={event.location}
              attendingCount={event.attendingCount}
              totalPlayers={event.totalPlayers}
              deadline={event.deadline}
              categories={event.categories}
              seriesId={event.seriesId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
