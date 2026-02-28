'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CalendarView, {
  type CalendarEvent,
  type CalendarVacation,
  type ViewMode,
} from '@/components/CalendarView';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────────

interface CalendarApiResponse {
  events: CalendarEvent[];
  trainings: CalendarEvent[];
  vacations: CalendarVacation[];
}

interface ApiEventSeries {
  id: number;
  type: string;
  title: string;
  recurrenceDay: number;
  startDate: string;
  endDate: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const VIEW_MODE_KEYS: Record<ViewMode, string> = {
  yearly: 'yearly',
  monthly: 'monthly',
  list: 'list',
};

const VIEW_MODES: ViewMode[] = ['yearly', 'monthly', 'list'];

const DAY_KEYS = [
  'day_monday', 'day_tuesday', 'day_wednesday', 'day_thursday',
  'day_friday', 'day_saturday', 'day_sunday',
];

const ISO_DAY_KEYS = ['', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun'];

// ── Page Component ─────────────────────────────────────────────────────────

function CalendarPageContent() {
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const now = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [vacations, setVacations] = useState<CalendarVacation[]>([]);
  const [eventSeries, setEventSeries] = useState<ApiEventSeries[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const params =
        viewMode === 'yearly'
          ? `year=${year}`
          : `month=${year}-${String(month + 1).padStart(2, '0')}`;
      const data = await apiFetch<CalendarApiResponse>(
        `/api/calendar?${params}`,
      );
      // Merge trainings into events for unified rendering
      const allEvents = [...(data.events || []), ...(data.trainings || [])];
      setEvents(allEvents);
      setVacations(data.vacations || []);
    } catch {
      // API not yet available - empty state
      setEvents([]);
      setVacations([]);
    } finally {
      setLoading(false);
    }
  }, [viewMode, year, month]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  useEffect(() => {
    async function loadSeries() {
      try {
        const data = await apiFetch<ApiEventSeries[]>('/api/event-series');
        setEventSeries(data);
      } catch {
        // API not yet available
      }
    }
    loadSeries();
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleMonthClick(m: number) {
    setMonth(m);
    setViewMode('monthly');
  }

  function handleChangeMonth(y: number, m: number) {
    setYear(y);
    setMonth(m);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Extract recurring training schedule from events
  const trainingDays = Array.from(
    new Set(
      events
        .filter((e) => e.type === 'training' && !e.cancelled)
        .map((e) => {
          const d = new Date(e.date + 'T00:00:00');
          return DAY_KEYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
        }),
    ),
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{t('calendar')}</h1>
          <Link
            href="/events/new/"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            {t('new_event')}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {VIEW_MODES.map((vm) => (
              <button
                key={vm}
                type="button"
                onClick={() => setViewMode(vm)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === vm
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t(VIEW_MODE_KEYS[vm])}
              </button>
            ))}
          </div>

          {/* Year navigation for yearly view */}
          {viewMode === 'yearly' && (
            <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1">
              <button
                type="button"
                onClick={() => setYear((y) => y - 1)}
                className="rounded p-1 text-gray-600 hover:bg-gray-100"
                aria-label="Previous year"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="min-w-[3rem] text-center text-sm font-semibold text-gray-900">
                {year}
              </span>
              <button
                type="button"
                onClick={() => setYear((y) => y + 1)}
                className="rounded p-1 text-gray-600 hover:bg-gray-100"
                aria-label="Next year"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Calendar */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
            </div>
          ) : (
            <CalendarView
              viewMode={viewMode}
              year={year}
              month={month}
              events={events}
              vacations={vacations}
              onMonthClick={handleMonthClick}
              onDayClick={(date) => {
                // Could open a detail modal -- for now just log
                console.log('Day clicked:', date);
              }}
              onChangeMonth={handleChangeMonth}
            />
          )}
        </div>

        {/* Sidebar */}
        {(trainingDays.length > 0 || vacations.length > 0 || eventSeries.length > 0) && (
          <aside className="w-full shrink-0 lg:w-64">
            {/* Training schedule */}
            {trainingDays.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">
                  {t('training_schedule')}
                </h3>
                <ul className="space-y-2">
                  {trainingDays.map((dayKey) => (
                    <li key={dayKey} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      {t(dayKey)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Upcoming vacations */}
            {vacations.length > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">
                  {t('vacations')}
                </h3>
                <ul className="space-y-2">
                  {vacations.map((v) => (
                    <li key={v.id} className="text-sm text-gray-700">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-purple-400" />
                      <span className="font-medium">{v.name}</span>
                      <br />
                      <span className="ml-4 text-xs text-gray-500">
                        {v.startDate} &ndash; {v.endDate}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Event Series */}
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                {t('event_series')}
              </h3>
              {eventSeries.length === 0 ? (
                <p className="text-sm text-gray-400">{t('no_event_series')}</p>
              ) : (
                <ul className="space-y-2">
                  {eventSeries.map((s) => (
                    <li key={s.id} className="text-sm text-gray-700">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-400" />
                      <span className="font-medium">{s.title}</span>
                      <br />
                      <span className="ml-4 text-xs text-gray-500">
                        {t(ISO_DAY_KEYS[s.recurrenceDay])} &middot; {s.startDate} &ndash; {s.endDate}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  return <CalendarPageContent />;
}
