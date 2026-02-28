'use client';

import { useEffect, useState, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import CalendarView, {
  type CalendarEvent,
  type CalendarVacation,
  type ViewMode,
} from '@/components/CalendarView';
import { apiFetch } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface CalendarApiResponse {
  events: CalendarEvent[];
  trainings: CalendarEvent[];
  vacations: CalendarVacation[];
}

interface VacationFormData {
  name: string;
  startDate: string;
  endDate: string;
}

interface TrainingFormData {
  title: string;
  dayOfWeek: string;
  time: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'yearly', label: 'Yearly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'list', label: 'List' },
];

const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

// ── Page Component ─────────────────────────────────────────────────────────

function CalendarPageContent() {
  const now = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [vacations, setVacations] = useState<CalendarVacation[]>([]);
  const [loading, setLoading] = useState(true);

  // Coach action forms
  const [showVacationForm, setShowVacationForm] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [vacationForm, setVacationForm] = useState<VacationFormData>({
    name: '',
    startDate: '',
    endDate: '',
  });
  const [trainingForm, setTrainingForm] = useState<TrainingFormData>({
    title: '',
    dayOfWeek: 'Monday',
    time: '18:00',
  });
  const [formError, setFormError] = useState('');

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

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleMonthClick(m: number) {
    setMonth(m);
    setViewMode('monthly');
  }

  function handleChangeMonth(y: number, m: number) {
    setYear(y);
    setMonth(m);
  }

  async function handleAddVacation() {
    setFormError('');
    if (!vacationForm.name || !vacationForm.startDate || !vacationForm.endDate) {
      setFormError('All fields are required.');
      return;
    }
    try {
      await apiFetch('/api/vacations', {
        method: 'POST',
        body: JSON.stringify(vacationForm),
      });
      setShowVacationForm(false);
      setVacationForm({ name: '', startDate: '', endDate: '' });
      fetchCalendar();
    } catch {
      setFormError('Failed to create vacation.');
    }
  }

  async function handleAddTraining() {
    setFormError('');
    if (!trainingForm.title || !trainingForm.time) {
      setFormError('All fields are required.');
      return;
    }
    try {
      await apiFetch('/api/trainings', {
        method: 'POST',
        body: JSON.stringify(trainingForm),
      });
      setShowTrainingForm(false);
      setTrainingForm({ title: '', dayOfWeek: 'Monday', time: '18:00' });
      fetchCalendar();
    } catch {
      setFormError('Failed to create training day.');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Extract recurring training schedule from events
  const trainingDays = Array.from(
    new Set(
      events
        .filter((e) => e.type === 'training' && !e.cancelled)
        .map((e) => {
          const d = new Date(e.date + 'T00:00:00');
          return DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1];
        }),
    ),
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {VIEW_MODES.map((vm) => (
              <button
                key={vm.value}
                type="button"
                onClick={() => setViewMode(vm.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === vm.value
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {vm.label}
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

      {/* Coach action buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setShowVacationForm(!showVacationForm);
            setShowTrainingForm(false);
            setFormError('');
          }}
          className="rounded-lg bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100"
        >
          + Add Vacation
        </button>
        <button
          type="button"
          onClick={() => {
            setShowTrainingForm(!showTrainingForm);
            setShowVacationForm(false);
            setFormError('');
          }}
          className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          + Add Training Day
        </button>
      </div>

      {/* Inline vacation form */}
      {showVacationForm && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-purple-800">New Vacation Period</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              placeholder="Name (e.g. Spring Break)"
              value={vacationForm.name}
              onChange={(e) => setVacationForm({ ...vacationForm, name: e.target.value })}
              className="rounded-md border border-purple-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
            <input
              type="date"
              value={vacationForm.startDate}
              onChange={(e) => setVacationForm({ ...vacationForm, startDate: e.target.value })}
              className="rounded-md border border-purple-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
            <input
              type="date"
              value={vacationForm.endDate}
              onChange={(e) => setVacationForm({ ...vacationForm, endDate: e.target.value })}
              className="rounded-md border border-purple-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
          </div>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleAddVacation}
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setShowVacationForm(false);
                setFormError('');
              }}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline training form */}
      {showTrainingForm && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-emerald-800">New Training Day</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              placeholder="Title (e.g. U15 Training)"
              value={trainingForm.title}
              onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })}
              className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <select
              value={trainingForm.dayOfWeek}
              onChange={(e) => setTrainingForm({ ...trainingForm, dayOfWeek: e.target.value })}
              className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input
              type="time"
              value={trainingForm.time}
              onChange={(e) => setTrainingForm({ ...trainingForm, time: e.target.value })}
              className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
          </div>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleAddTraining}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setShowTrainingForm(false);
                setFormError('');
              }}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

        {/* Training schedule sidebar */}
        {trainingDays.length > 0 && (
          <aside className="w-full shrink-0 lg:w-64">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                Training Schedule
              </h3>
              <ul className="space-y-2">
                {trainingDays.map((day) => (
                  <li key={day} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    {day}
                  </li>
                ))}
              </ul>
            </div>

            {/* Upcoming vacations */}
            {vacations.length > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">
                  Vacations
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
          </aside>
        )}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <AuthGuard>
      <CalendarPageContent />
    </AuthGuard>
  );
}
