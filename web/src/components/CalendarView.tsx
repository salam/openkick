'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, getLanguage } from '@/lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  type: 'training' | 'tournament' | 'match';
  date: string; // YYYY-MM-DD
  time: string;
  attendingCount?: number;
  totalPlayers?: number;
  cancelled?: boolean;
}

export interface CalendarVacation {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export type ViewMode = 'yearly' | 'monthly' | 'list';

interface CalendarViewProps {
  viewMode: ViewMode;
  year: number;
  month: number; // 0-based
  events: CalendarEvent[];
  vacations: CalendarVacation[];
  onMonthClick?: (month: number) => void;
  onDayClick?: (date: string) => void;
  onChangeMonth?: (year: number, month: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may', 'month_jun',
  'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

const DAY_HEADER_KEYS = ['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun'];

const TYPE_KEYS: Record<string, string> = {
  training: 'type_training',
  tournament: 'type_tournament',
  match: 'type_match',
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday = 0, Sunday = 6 */
function getStartDay(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isInVacation(dateStr: string, vacations: CalendarVacation[]): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  return vacations.some((v) => {
    const s = new Date(v.startDate + 'T00:00:00');
    const e = new Date(v.endDate + 'T00:00:00');
    return d >= s && d <= e;
  });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

const typeDotColor: Record<string, string> = {
  training: 'bg-emerald-500',
  tournament: 'bg-blue-500',
  match: 'bg-orange-500',
};

const typeBadgeStyle: Record<string, string> = {
  training: 'bg-emerald-100 text-emerald-700',
  tournament: 'bg-blue-100 text-blue-700',
  match: 'bg-orange-100 text-orange-700',
};

// ── Yearly View ────────────────────────────────────────────────────────────

function YearlyView({
  year,
  events,
  vacations,
  onMonthClick,
}: {
  year: number;
  events: CalendarEvent[];
  vacations: CalendarVacation[];
  onMonthClick?: (month: number) => void;
}) {
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      (map[ev.date] ??= []).push(ev);
    }
    return map;
  }, [events]);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }, (_, mi) => {
        const daysInMonth = getDaysInMonth(year, mi);
        const startDay = getStartDay(year, mi);

        return (
          <button
            key={mi}
            type="button"
            onClick={() => onMonthClick?.(mi)}
            className="rounded-lg border border-gray-200 bg-white p-3 text-left transition-shadow hover:shadow-md"
          >
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              {t(MONTH_KEYS[mi])}
            </h3>
            {/* Day headers */}
            <div className="mb-1 grid grid-cols-7 gap-px text-center">
              {DAY_HEADER_KEYS.map((dk) => (
                <span key={dk} className="text-[10px] font-medium text-gray-400">
                  {t(dk)}
                </span>
              ))}
            </div>
            {/* Day grid */}
            <div className="grid grid-cols-7 gap-px text-center">
              {/* Empty cells before first day */}
              {Array.from({ length: startDay }, (_, i) => (
                <span key={`e-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, di) => {
                const day = di + 1;
                const dateStr = formatDate(year, mi, day);
                const dayEvents = eventsByDate[dateStr] || [];
                const vacation = isInVacation(dateStr, vacations);
                const today = isToday(dateStr);
                const cancelled = dayEvents.some((e) => e.cancelled);

                // Collect unique dot colors
                const dots = new Set<string>();
                for (const ev of dayEvents) {
                  if (ev.cancelled) {
                    dots.add('bg-red-400');
                  } else {
                    dots.add(typeDotColor[ev.type] || 'bg-gray-400');
                  }
                }

                return (
                  <span
                    key={day}
                    className={`relative flex flex-col items-center rounded text-[10px] leading-4 ${
                      vacation ? 'bg-purple-50' : ''
                    } ${today ? 'font-bold text-emerald-700' : 'text-gray-700'} ${
                      cancelled && !vacation ? 'text-red-400 line-through' : ''
                    }`}
                  >
                    {day}
                    {dots.size > 0 && (
                      <span className="flex gap-px">
                        {[...dots].map((c, i) => (
                          <span
                            key={i}
                            className={`inline-block h-1 w-1 rounded-full ${c}`}
                          />
                        ))}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Monthly View ───────────────────────────────────────────────────────────

function MonthlyView({
  year,
  month,
  events,
  vacations,
  onDayClick,
  onChangeMonth,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  vacations: CalendarVacation[];
  onDayClick?: (date: string) => void;
  onChangeMonth?: (year: number, month: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const startDay = getStartDay(year, month);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      (map[ev.date] ??= []).push(ev);
    }
    return map;
  }, [events]);

  function prevMonth() {
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    onChangeMonth?.(y, m);
  }

  function nextMonth() {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    onChangeMonth?.(y, m);
  }

  return (
    <div>
      {/* Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Previous month"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {t(MONTH_KEYS[month])} {year}
        </h2>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Next month"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 gap-px text-center">
        {DAY_HEADER_KEYS.map((dk) => (
          <span key={dk} className="py-2 text-xs font-medium text-gray-500">
            {t(dk)}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200">
        {/* Empty leading cells */}
        {Array.from({ length: startDay }, (_, i) => (
          <div key={`e-${i}`} className="min-h-[80px] bg-gray-50 p-1 sm:min-h-[100px]" />
        ))}
        {Array.from({ length: daysInMonth }, (_, di) => {
          const day = di + 1;
          const dateStr = formatDate(year, month, day);
          const dayEvents = eventsByDate[dateStr] || [];
          const vacation = isInVacation(dateStr, vacations);
          const today = isToday(dateStr);
          const hasTraining = dayEvents.some((e) => e.type === 'training' && !e.cancelled);
          // Vacations that start on this day (for subtle label)
          const vacationStarts = vacations.filter((v) => v.startDate === dateStr);

          return (
            <button
              key={day}
              type="button"
              onClick={() => onDayClick?.(dateStr)}
              className={`min-h-[80px] p-1 text-left transition-colors sm:min-h-[100px] ${
                vacation ? 'bg-purple-50' : 'bg-white'
              } ${hasTraining ? 'border-l-[3px] border-l-emerald-500' : ''} ${
                today ? 'ring-2 ring-inset ring-emerald-500' : ''
              }`}
            >
              <span
                className={`inline-block text-xs font-medium ${
                  today
                    ? 'rounded-full bg-emerald-600 px-1.5 py-0.5 text-white'
                    : 'text-gray-700'
                }`}
              >
                {day}
              </span>
              <div className="mt-1 space-y-0.5">
                {/* Vacation labels: show on start day of multi-day, or on the day for single-day */}
                {vacationStarts.map((v) => (
                  <div
                    key={`vl-${v.id}`}
                    className="truncate rounded px-1 py-0.5 text-[10px] text-purple-400 sm:text-xs"
                  >
                    {v.name}
                  </div>
                ))}
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    className={`truncate rounded px-1 py-0.5 text-[10px] font-medium sm:text-xs ${
                      ev.cancelled
                        ? 'bg-red-50 text-red-400 line-through'
                        : typeBadgeStyle[ev.type] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {ev.time && <span className="mr-1">{ev.time}</span>}
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <span className="block text-[10px] text-gray-400">
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── List View ──────────────────────────────────────────────────────────────

function ListView({
  events,
  vacations,
}: {
  events: CalendarEvent[];
  vacations: CalendarVacation[];
}) {
  // Group events and vacations by month
  type ListItem =
    | { kind: 'event'; data: CalendarEvent }
    | { kind: 'vacation'; data: CalendarVacation };

  const grouped = useMemo(() => {
    const map: Record<string, ListItem[]> = {};

    // Add events
    for (const ev of events) {
      const key = ev.date.slice(0, 7); // YYYY-MM
      (map[key] ??= []).push({ kind: 'event', data: ev });
    }

    // Add vacations into each month they span (deduplicate by id+month)
    const addedVacMonths = new Set<string>();
    for (const v of vacations) {
      const start = new Date(v.startDate + 'T00:00:00');
      const end = new Date(v.endDate + 'T00:00:00');
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor <= end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const dedup = `${v.id}:${key}`;
        if (!addedVacMonths.has(dedup)) {
          addedVacMonths.add(dedup);
          (map[key] ??= []).push({ kind: 'vacation', data: v });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Sort each month: vacations first (by startDate), then events (by date)
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const dateA = a.kind === 'event' ? a.data.date : a.data.startDate;
        const dateB = b.kind === 'event' ? b.data.date : b.data.startDate;
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        // Vacations before events on same date
        if (a.kind !== b.kind) return a.kind === 'vacation' ? -1 : 1;
        return 0;
      });
    }

    // Sort month keys
    const sorted: Record<string, ListItem[]> = {};
    for (const key of Object.keys(map).sort()) {
      sorted[key] = map[key];
    }
    return sorted;
  }, [events, vacations]);

  function scrollToToday() {
    const el = document.getElementById('calendar-today');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="relative">
      {/* Scroll to today button */}
      <button
        type="button"
        onClick={scrollToToday}
        className="sticky top-0 z-10 mb-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-emerald-700"
      >
        {t('scroll_to_today')}
      </button>

      {/* Grouped events and vacations */}
      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-sm text-gray-400">{t('no_events_found')}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([monthKey, items]) => {
          const [y, m] = monthKey.split('-').map(Number);
          // Track rendered vacation IDs to avoid duplicates within a month
          const renderedVacations = new Set<string>();
          return (
            <div key={monthKey} className="mb-8">
              <h3 className="mb-3 text-base font-semibold text-gray-900">
                {t(MONTH_KEYS[m - 1])} {y}
              </h3>
              <div className="space-y-2">
                {items.map((item, idx) => {
                  if (item.kind === 'vacation') {
                    const v = item.data;
                    if (renderedVacations.has(v.id)) return null;
                    renderedVacations.add(v.id);
                    return (
                      <div
                        key={`vac-${v.id}`}
                        className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-medium text-purple-700"
                      >
                        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-purple-400" />
                        {v.name}: {v.startDate} &ndash; {v.endDate}
                      </div>
                    );
                  }

                  const ev = item.data;
                  const vacation = isInVacation(ev.date, vacations);
                  const isTodayEvent = ev.date === todayStr;

                  return (
                    <Link
                      key={ev.id}
                      href={`/events/${ev.id}/`}
                      id={isTodayEvent ? 'calendar-today' : undefined}
                      className={`flex items-center gap-4 rounded-lg border p-4 transition-shadow hover:shadow-md ${
                        vacation ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-white'
                      } ${ev.cancelled ? 'opacity-60' : ''} ${
                        isTodayEvent ? 'ring-2 ring-emerald-500' : ''
                      }`}
                    >
                      {/* Date */}
                      <div className="flex w-14 shrink-0 flex-col items-center text-center">
                        <span className="text-xs font-medium text-gray-500">
                          {new Date(ev.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' })}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {new Date(ev.date + 'T00:00:00').getDate()}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-semibold text-gray-900 ${
                            ev.cancelled ? 'line-through' : ''
                          }`}
                        >
                          {ev.title}
                        </p>
                        {ev.time && (
                          <p className="text-xs text-gray-500">{ev.time}</p>
                        )}
                      </div>

                      {/* Badge */}
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          ev.cancelled
                            ? 'bg-red-100 text-red-600'
                            : typeBadgeStyle[ev.type] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {ev.cancelled ? t('cancelled') : t(TYPE_KEYS[ev.type] || ev.type)}
                      </span>

                      {/* Attendance */}
                      {ev.attendingCount != null && ev.totalPlayers != null && (
                        <span className="shrink-0 text-xs text-gray-500">
                          {ev.attendingCount}/{ev.totalPlayers}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function CalendarView({
  viewMode,
  year,
  month,
  events,
  vacations: rawVacations,
  onMonthClick,
  onDayClick,
  onChangeMonth,
}: CalendarViewProps) {
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  // Deduplicate vacations by name+startDate+endDate (guards against duplicate DB rows)
  const vacations = useMemo(() => {
    const seen = new Set<string>();
    return rawVacations.filter((v) => {
      const key = `${v.name}|${v.startDate}|${v.endDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawVacations]);

  if (viewMode === 'yearly') {
    return (
      <YearlyView
        year={year}
        events={events}
        vacations={vacations}
        onMonthClick={onMonthClick}
      />
    );
  }

  if (viewMode === 'monthly') {
    return (
      <MonthlyView
        year={year}
        month={month}
        events={events}
        vacations={vacations}
        onDayClick={onDayClick}
        onChangeMonth={onChangeMonth}
      />
    );
  }

  return <ListView events={events} vacations={vacations} />;
}
