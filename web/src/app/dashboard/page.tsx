'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import EventCard from '@/components/EventCard';

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
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-sm text-gray-400">No upcoming events</p>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
