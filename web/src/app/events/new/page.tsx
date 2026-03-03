'use client';

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import AuthGuard from '@/components/AuthGuard';

/* ── Constants ──────────────────────────────────────────────────────── */

const EVENT_TYPES = ['training', 'tournament', 'match', 'friendly'] as const;

const SFV_CATEGORIES = ['A', 'B', 'C', 'D-9', 'D-7', 'E', 'F', 'G'] as const;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  A: 'bg-red-100 text-red-800 border-red-300',
  B: 'bg-orange-100 text-orange-800 border-orange-300',
  C: 'bg-amber-100 text-amber-800 border-amber-300',
  'D-9': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'D-7': 'bg-lime-100 text-lime-800 border-lime-300',
  E: 'bg-green-100 text-green-800 border-green-300',
  F: 'bg-teal-100 text-teal-800 border-teal-300',
  G: 'bg-cyan-100 text-cyan-800 border-cyan-300',
};

/** Maps WEEKDAYS index to ISO weekday number (Mon=1 … Sun=7) */
function weekdayToISO(day: string): number {
  const idx = WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number]);
  return idx >= 0 ? idx + 1 : 1;
}

const DEADLINE_OFFSET_OPTIONS = [
  { label: 'None', value: null },
  { label: '24 hours before', value: 24 },
  { label: '48 hours before', value: 48 },
  { label: '72 hours before', value: 72 },
] as const;

/* ── Types ──────────────────────────────────────────────────────────── */

interface ImportedTournament {
  title: string;
  date: string;
  startTime: string | null;
  location: string | null;
  categoryRequirement: string | null;
  deadline: string | null;
  maxParticipants: number | null;
  description: string | null;
}

interface EventFormData {
  type: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  attendanceTime: string;
  deadline: string;
  maxParticipants: string;
  minParticipants: string;
  location: string;
  categories: string[];
  recurring: boolean;
  recurrenceDays: string[];
  // Series fields
  seriesMode: boolean;
  recurrenceDay: number; // ISO weekday 1-7
  seriesStartDate: string;
  seriesEndDate: string;
  deadlineOffsetHours: number | null;
  // Tournament-specific fields
  teamName: string;
  openCall: boolean;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function NewEventPage() {
  return <AuthGuard><NewEventForm /></AuthGuard>;
}

function NewEventForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [seriesMode, setSeriesMode] = useState(searchParams.get('series') === 'true');

  const [form, setForm] = useState<EventFormData>({
    type: 'training',
    title: '',
    description: '',
    date: '',
    startTime: '',
    attendanceTime: '',
    deadline: '',
    maxParticipants: '',
    minParticipants: '',
    location: '',
    categories: [],
    recurring: false,
    recurrenceDays: [],
    seriesMode: searchParams.get('series') === 'true',
    recurrenceDay: 1, // Monday default
    seriesStartDate: '',
    seriesEndDate: '',
    deadlineOffsetHours: null,
    teamName: '',
    openCall: false,
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import state
  const [importUrl, setImportUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  /* ── Import helpers ────────────────────────────────────────────── */

  function applyImport(data: ImportedTournament) {
    setForm((prev) => ({
      ...prev,
      type: 'tournament',
      title: data.title || prev.title,
      description: data.description || prev.description,
      date: data.date || prev.date,
      startTime: data.startTime || prev.startTime,
      location: data.location || prev.location,
      maxParticipants:
        data.maxParticipants != null ? String(data.maxParticipants) : prev.maxParticipants,
      deadline: data.deadline ? `${data.deadline}T23:59` : prev.deadline,
      categories: data.categoryRequirement
        ? data.categoryRequirement.split(',').map((c) => c.trim())
        : prev.categories,
    }));
    setImportSuccess('Tournament data imported successfully. Review the form below.');
  }

  async function handleImportUrl() {
    if (!importUrl.trim()) return;
    setImportingUrl(true);
    setError(null);
    setImportSuccess(null);
    try {
      const data = await apiFetch<ImportedTournament>('/api/events/import-url', {
        method: 'POST',
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      applyImport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import from URL');
    } finally {
      setImportingUrl(false);
    }
  }

  async function handleImportPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPdf(true);
    setError(null);
    setImportSuccess(null);
    try {
      const buffer = await file.arrayBuffer();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const token = getToken();
      const res = await fetch(`${API_URL}/api/events/import-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: buffer,
      });
      if (!res.ok) throw new Error(`Import failed: ${res.status}`);
      const data: ImportedTournament = await res.json();
      applyImport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import PDF');
    } finally {
      setImportingPdf(false);
      // Reset file input
      e.target.value = '';
    }
  }

  /* ── Form helpers ──────────────────────────────────────────────── */

  function toggleCategory(cat: string) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  }

  function toggleRecurrenceDay(day: string) {
    setForm((prev) => ({
      ...prev,
      recurrenceDays: prev.recurrenceDays.includes(day)
        ? prev.recurrenceDays.filter((d) => d !== day)
        : [...prev.recurrenceDays, day],
    }));
  }

  function handleToggleSeriesMode() {
    const next = !seriesMode;
    setSeriesMode(next);
    setForm((prev) => ({ ...prev, seriesMode: next }));
  }

  /* ── Submit ────────────────────────────────────────────────────── */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (seriesMode) {
      if (!form.title.trim() || !form.recurrenceDay || !form.seriesStartDate || !form.seriesEndDate) return;
    } else {
      if (!form.title.trim() || !form.date) return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (seriesMode) {
        const body: Record<string, unknown> = {
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim() || null,
          startTime: form.startTime || null,
          attendanceTime: form.attendanceTime || null,
          maxParticipants: form.openCall ? null : (form.maxParticipants ? Number(form.maxParticipants) : null),
          minParticipants: form.minParticipants ? Number(form.minParticipants) : null,
          location: form.location.trim() || null,
          categoryRequirement: form.categories.length > 0 ? form.categories.join(',') : null,
          recurrenceDay: form.recurrenceDay,
          startDate: form.seriesStartDate,
          endDate: form.seriesEndDate,
          deadlineOffsetHours: form.deadlineOffsetHours,
        };
        if (form.type === 'tournament') {
          body.teamName = form.teamName.trim() || null;
          body.openCall = form.openCall;
        }
        await apiFetch('/api/event-series', { method: 'POST', body: JSON.stringify(body) });
        router.push('/events/');
      } else {
        const body: Record<string, unknown> = {
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim() || null,
          date: form.date,
          startTime: form.startTime || null,
          attendanceTime: form.attendanceTime || null,
          deadline: form.deadline || null,
          maxParticipants: form.openCall ? null : (form.maxParticipants ? Number(form.maxParticipants) : null),
          minParticipants: form.minParticipants ? Number(form.minParticipants) : null,
          location: form.location.trim() || null,
          categoryRequirement: form.categories.length > 0 ? form.categories.join(',') : null,
          recurring: form.recurring ? 1 : 0,
          recurrenceRule:
            form.recurring && form.recurrenceDays.length > 0
              ? form.recurrenceDays.join(',')
              : null,
        };
        if (form.type === 'tournament') {
          body.teamName = form.teamName.trim() || null;
          body.openCall = form.openCall;
        }

        const created = await apiFetch<{ id: number }>('/api/events', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        // Upload attachment if present
        if (attachment && created.id) {
          try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
            const token = getToken();
            const formData = new FormData();
            formData.append('file', attachment);
            await fetch(`${API_URL}/api/events/${created.id}/attachment`, {
              method: 'POST',
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: formData,
            });
          } catch {
            // Attachment upload may fail if endpoint doesn't exist yet
          }
        }

        router.push(`/events/${created.id}/`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Validation for submit button ──────────────────────────────── */

  const canSubmit = seriesMode
    ? !!(form.title.trim() && form.recurrenceDay && form.seriesStartDate && form.seriesEndDate)
    : !!(form.title.trim() && form.date);

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        {seriesMode ? 'Create Event Series' : 'Create Event'}
      </h1>

      {/* ── Import section (hidden in series mode) ── */}
      {!seriesMode && (
        <div className="mb-8 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/50 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-primary-700">
            Import from Tournament
          </h2>

          {/* Import from URL */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Import from URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://example.com/tournament"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={handleImportUrl}
                disabled={importingUrl || !importUrl.trim()}
                className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
              >
                {importingUrl ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>

          {/* Import from PDF */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Import from PDF
            </label>
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 ${importingPdf ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              {importingPdf ? 'Importing...' : 'Choose PDF file'}
              <input
                type="file"
                accept=".pdf"
                onChange={handleImportPdf}
                className="hidden"
                disabled={importingPdf}
              />
            </label>
          </div>

          {/* Import feedback */}
          {importSuccess && (
            <div className="mt-3 rounded-lg bg-primary-100 p-3 text-sm text-primary-700">
              {importSuccess}
            </div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Event form ── */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Series toggle */}
        <div>
          <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
            <button
              type="button"
              role="switch"
              aria-checked={seriesMode}
              onClick={handleToggleSeriesMode}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                seriesMode ? 'bg-primary-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  seriesMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            Create as Series
          </label>
          {seriesMode && (
            <p className="mt-1 text-xs text-gray-500">
              A series generates recurring events automatically for the selected weekday.
            </p>
          )}
        </div>

        {/* Type */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* ── Series-specific fields ── */}
        {seriesMode ? (
          <>
            {/* Day of week picker */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Day of Week *</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const isoDay = weekdayToISO(day);
                  const selected = form.recurrenceDay === isoDay;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setForm({ ...form, recurrenceDay: isoDay })}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? 'bg-primary-500 text-white'
                          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start / End date row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Start Date *</label>
                <input
                  type="date"
                  value={form.seriesStartDate}
                  onChange={(e) => setForm({ ...form, seriesStartDate: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">End Date *</label>
                <input
                  type="date"
                  value={form.seriesEndDate}
                  onChange={(e) => setForm({ ...form, seriesEndDate: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Times row (no date field) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Start Time</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Attendance Time
                </label>
                <input
                  type="time"
                  value={form.attendanceTime}
                  onChange={(e) => setForm({ ...form, attendanceTime: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Deadline offset */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Deadline Offset
              </label>
              <select
                value={form.deadlineOffsetHours ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    deadlineOffsetHours: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:max-w-xs"
              >
                {DEADLINE_OFFSET_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            {/* Date + Times row (single event mode) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Start Time</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Attendance Time
                </label>
                <input
                  type="time"
                  value={form.attendanceTime}
                  onChange={(e) => setForm({ ...form, attendanceTime: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Deadline */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Deadline</label>
              <input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:max-w-xs"
              />
            </div>
          </>
        )}

        {/* Tournament-specific: Team Name */}
        {form.type === 'tournament' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Team Name</label>
            <input
              type="text"
              value={form.teamName}
              onChange={(e) => setForm({ ...form, teamName: e.target.value })}
              placeholder="e.g., FC Example E1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Official name as registered with the tournament organiser
            </p>
          </div>
        )}

        {/* Tournament-specific: Open Call toggle */}
        {form.type === 'tournament' && (
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.openCall}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    openCall: e.target.checked,
                    maxParticipants: e.target.checked ? '' : prev.maxParticipants,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Open call (no participant limit)
              </span>
            </label>
          </div>
        )}

        {/* Participants row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!form.openCall && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Max Participants
              </label>
              <input
                type="number"
                min={1}
                value={form.maxParticipants}
                onChange={(e) => setForm({ ...form, maxParticipants: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Min Participants
            </label>
            <input
              type="number"
              min={1}
              value={form.minParticipants}
              onChange={(e) => setForm({ ...form, minParticipants: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Category Requirement */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Category Requirement
          </label>
          <div className="flex flex-wrap gap-2">
            {SFV_CATEGORIES.map((cat) => {
              const selected = form.categories.includes(cat);
              const colors = CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-800 border-gray-300';
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    selected ? colors : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recurring toggle (only in single event mode) */}
        {!seriesMode && (
          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              <button
                type="button"
                role="switch"
                aria-checked={form.recurring}
                onClick={() => setForm({ ...form, recurring: !form.recurring, recurrenceDays: [] })}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  form.recurring ? 'bg-primary-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    form.recurring ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              Recurring event
            </label>

            {/* Recurrence days */}
            {form.recurring && (
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const selected = form.recurrenceDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleRecurrenceDay(day)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? 'bg-primary-500 text-white'
                          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Attachment (hidden in series mode) */}
        {!seriesMode && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Attachment (PDF)</label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              {attachment ? attachment.name : 'Choose file'}
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
            {attachment && (
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="ml-2 text-xs text-gray-500 underline hover:text-gray-700"
              >
                Remove
              </button>
            )}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-4 border-t border-gray-200 pt-6">
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-xl bg-primary-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : seriesMode ? 'Create Series' : 'Create Event'}
          </button>
          <a
            href="/events/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
