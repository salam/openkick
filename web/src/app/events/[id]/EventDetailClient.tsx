'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { t, getLanguage } from '@/lib/i18n';
import AltchaWidget from '@/components/AltchaWidget';
import TournamentResultsForm from '@/components/TournamentResultsForm';
import EventChecklist from '@/components/EventChecklist';

/* ── Types ──────────────────────────────────────────────────────────── */

interface AttendanceSummary {
  attending: number;
  absent: number;
  waitlist: number;
  unknown: number;
}

interface EventDetail {
  id: number;
  type: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  attendanceTime?: string;
  deadline?: string;
  maxParticipants?: number;
  minParticipants?: number;
  location?: string;
  categoryRequirement?: string;
  recurring?: number;
  recurrenceRule?: string;
  attachmentUrl?: string;
  fee?: number;
  attendanceSummary: AttendanceSummary;
  seriesId?: number;
  results?: {
    id: number;
    eventId: number;
    placement: number | null;
    totalTeams: number | null;
    summary: string | null;
    resultsUrl: string | null;
    achievements: { type: string; label: string }[];
    createdAt: string;
    updatedAt: string;
  } | null;
}

interface SeriesInfo {
  id: number;
  title: string;
  type: string;
  description?: string;
  startTime?: string;
  attendanceTime?: string;
  location?: string;
  categoryRequirement?: string;
  maxParticipants?: number;
  minParticipants?: number;
}

/** Match synthetic series IDs like "series-1-2026-03-09" */
const SERIES_ID_RE = /^series-(\d+)-(\d{4}-\d{2}-\d{2})$/;

interface AttendanceRecord {
  id: number;
  eventId: number;
  playerId: number;
  playerName?: string;
  status: string;
  source: string;
  reason?: string;
}

interface Team {
  id: number;
  name: string;
  players: { id: number; name: string; category: string }[];
}

interface TokenPayload {
  role?: string;
  playerId?: number;
  sub?: number;
  [key: string]: unknown;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function decodeToken(): TokenPayload | null {
  if (typeof window === 'undefined') return null;
  const token =
    localStorage.getItem('openkick_token') ||
    localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function deadlineCountdown(deadline: string): string {
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  if (diff <= 0) return t('deadline_passed');
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h ${t('remaining')}`;
  return `${remainingHours}h ${t('remaining')}`;
}

const TYPE_I18N_KEYS: Record<string, string> = {
  training: 'type_training',
  match: 'type_match',
  tournament: 'type_tournament',
  social: 'type_social',
};

/* ── Skeleton ────────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6 p-6">
      <div className="h-8 w-2/3 rounded bg-gray-200" />
      <div className="h-4 w-1/3 rounded bg-gray-200" />
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
        <div className="h-4 w-4/6 rounded bg-gray-200" />
      </div>
      <div className="flex gap-4">
        <div className="h-14 w-36 rounded-xl bg-gray-200" />
        <div className="h-14 w-36 rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}

/* ── Attendance Table (inline, coach view) ───────────────────────────── */

function AttendanceTable({
  records,
  loading,
}: {
  records: AttendanceRecord[];
  loading: boolean;
}) {
  if (loading) {
    return <div className="animate-pulse h-24 rounded-lg bg-gray-100" />;
  }

  if (records.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        {t('no_attendance')}
      </p>
    );
  }

  const statusColor: Record<string, string> = {
    attending: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    waitlist: 'bg-yellow-100 text-yellow-800',
    unknown: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {t('player')}
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {t('status')}
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {t('source')}
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              {t('reason')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 font-medium">
                {r.playerName || `${t('player')} #${r.playerId}`}
              </td>
              <td className="px-4 py-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[r.status] || statusColor.unknown}`}
                >
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-2 text-gray-500">{r.source}</td>
              <td className="px-4 py-2 text-gray-500">{r.reason || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Main Page Component ─────────────────────────────────────────────── */

export default function EventDetailClient() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // Parse synthetic series ID if present
  const seriesMatch = id ? SERIES_ID_RE.exec(id) : null;
  const parsedSeriesId = seriesMatch ? Number(seriesMatch[1]) : null;
  const parsedDate = seriesMatch ? seriesMatch[2] : null;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);

  // Auth state: null = loading, false = public, true = logged in
  const [authed, setAuthed] = useState<boolean | null>(null);

  // Role
  const [role, setRole] = useState<string>('');
  const [playerId, setPlayerId] = useState<number | null>(null);

  // Parent RSVP
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [captchaPayload, setCaptchaPayload] = useState('');

  // Coach attendance
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Teams
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamCount, setTeamCount] = useState(2);
  const [assigningTeams, setAssigningTeams] = useState(false);

  // Reminder
  const [reminderSent, setReminderSent] = useState(false);

  // Payment
  const [feePaymentEnabled, setFeePaymentEnabled] = useState(false);
  const [feeCurrency, setFeeCurrency] = useState('CHF');
  const [payingFee, setPayingFee] = useState(false);

  // Public RSVP flow
  const [rsvpStep, setRsvpStep] = useState<'search' | 'confirm' | 'done'>('search');
  const [rsvpName, setRsvpName] = useState('');
  const [rsvpCaptcha, setRsvpCaptcha] = useState('');
  const [rsvpToken, setRsvpToken] = useState('');
  const [rsvpPlayerInitials, setRsvpPlayerInitials] = useState('');
  const [rsvpEventTitle, setRsvpEventTitle] = useState('');
  const [rsvpSearching, setRsvpSearching] = useState(false);
  const [rsvpConfirming, setRsvpConfirming] = useState(false);
  const [rsvpResult, setRsvpResult] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);

  // Weather
  const [weather, setWeather] = useState<{ temperature: number; precipitation: number; icon: string; description: string } | null>(null);

  // Language reactivity
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  /* ── Fetch payment status ── */
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${apiUrl}/api/public/payment-status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.useCases?.tournament_fee?.enabled) {
          setFeePaymentEnabled(true);
          setFeeCurrency(data.useCases.tournament_fee.currency || 'CHF');
        }
      })
      .catch(() => {});
  }, []);

  /* ── Decode token on mount ── */
  useEffect(() => {
    const authenticated = isAuthenticated();
    setAuthed(authenticated);
    if (authenticated) {
      const payload = decodeToken();
      if (payload) {
        setRole(payload.role || '');
        setPlayerId(payload.playerId ?? payload.sub ?? null);
      }
    }
  }, []);

  /* ── Fetch event (or build virtual instance from series template) ── */
  useEffect(() => {
    if (!id || authed === null) return; // still determining auth

    setLoading(true);

    if (authed === false) {
      // Public view — use public endpoint
      apiFetch<{ id: number; type: string; title: string; description?: string; date: string; startTime?: string; attendanceTime?: string; deadline?: string; maxParticipants?: number; location?: string; categoryRequirement?: string; attachmentUrl?: string; fee?: number }>(
        `/api/public/events/${id}`,
      )
        .then((data) => {
          const mapped: EventDetail = {
            ...data,
            attendanceSummary: { attending: 0, absent: 0, waitlist: 0, unknown: 0 },
          };
          setEvent(mapped);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
      return;
    }

    if (parsedSeriesId && parsedDate) {
      // Synthetic series ID — fetch the series template and build a virtual event
      apiFetch<SeriesInfo>(`/api/event-series/${parsedSeriesId}`)
        .then((series) => {
          setSeriesInfo(series);
          const virtual: EventDetail = {
            id: 0, // virtual — RSVP uses the URL id param instead
            type: series.type,
            title: series.title,
            description: series.description,
            date: parsedDate,
            startTime: series.startTime,
            attendanceTime: series.attendanceTime,
            location: series.location,
            categoryRequirement: series.categoryRequirement,
            maxParticipants: series.maxParticipants,
            minParticipants: series.minParticipants,
            seriesId: parsedSeriesId,
            attendanceSummary: { attending: 0, absent: 0, waitlist: 0, unknown: 0 },
          };
          setEvent(virtual);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      // Regular numeric event ID
      apiFetch<EventDetail>(`/api/events/${id}`)
        .then((data) => {
          setEvent(data);
          // If the event belongs to a series, fetch series info for the banner
          if (data.seriesId) {
            apiFetch<SeriesInfo>(`/api/event-series/${data.seriesId}`)
              .then(setSeriesInfo)
              .catch(() => {}); // non-critical
          }
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [id, authed, parsedSeriesId, parsedDate]);

  // Fetch weather for event (only for events within 7 days)
  useEffect(() => {
    if (!event || !id) return;
    const eventDate = new Date(event.date);
    const now = new Date();
    const diffDays = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 7 || diffDays < -1) return;

    apiFetch<{ temperature: number; precipitation: number; icon: string; description: string }>(`/api/events/${id}/weather`)
      .then(setWeather)
      .catch(() => {});
  }, [id, event?.date]);

  /* ── Fetch attendance for coaches ── */
  const fetchAttendance = useCallback(() => {
    if (!id) return;
    setAttendanceLoading(true);
    apiFetch<AttendanceRecord[]>(`/api/events/${id}/attendance`)
      .then(setAttendance)
      .catch(() => {})
      .finally(() => setAttendanceLoading(false));
  }, [id]);

  useEffect(() => {
    if (authed === true && (role === 'coach' || role === 'admin')) {
      fetchAttendance();
    }
  }, [authed, role, fetchAttendance]);

  /* ── Fetch teams for coaches ── */
  const fetchTeams = useCallback(() => {
    if (!id) return;
    setTeamsLoading(true);
    apiFetch<Team[]>(`/api/events/${id}/teams`)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setTeamsLoading(false));
  }, [id]);

  useEffect(() => {
    if (authed === true && (role === 'coach' || role === 'admin')) {
      fetchTeams();
    }
  }, [authed, role, fetchTeams]);

  /* ── RSVP handler (parent) ── */
  async function handleRsvp(status: 'attending' | 'absent') {
    if (!event || !playerId) return;
    setRsvpLoading(true);
    try {
      await apiFetch('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          eventId: id, // URL param — could be numeric string or synthetic series ID
          playerId,
          status,
          source: 'parent',
          captcha: captchaPayload,
        }),
      });
      setRsvpStatus(status);
    } catch {
      /* swallow – user can retry */
    } finally {
      setRsvpLoading(false);
    }
  }

  /* ── Auto-assign teams (coach) ── */
  async function handleAutoAssignTeams() {
    if (!id) return;
    setAssigningTeams(true);
    try {
      await apiFetch(`/api/events/${id}/teams`, {
        method: 'POST',
        body: JSON.stringify({ teamCount }),
      });
      fetchTeams();
    } catch {
      /* swallow */
    } finally {
      setAssigningTeams(false);
    }
  }

  /* ── Send reminder (coach) ── */
  async function handleSendReminder() {
    if (!id) return;
    try {
      await apiFetch(`/api/events/${id}/remind`, { method: 'POST' });
    } catch {
      /* endpoint may not exist yet, still show feedback */
    }
    setReminderSent(true);
  }

  /* ── Cancel series instance (coach) ── */
  async function handleCancelInstance() {
    const sid = event?.seriesId || parsedSeriesId;
    const eventDate = event?.date || parsedDate;
    if (!sid || !eventDate) return;

    if (!confirm(t('cancel_instance_confirm'))) return;

    try {
      await apiFetch(`/api/event-series/${sid}/exclude`, {
        method: 'POST',
        body: JSON.stringify({ date: eventDate }),
      });
      router.push('/events/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_cancel'));
    }
  }

  /* ── Pay tournament fee ── */
  async function handlePayFee() {
    if (!event?.fee) return;
    setPayingFee(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/api/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useCase: 'tournament_fee',
          referenceId: String(event.id || id),
          amount: event.fee,
          currency: feeCurrency,
          successUrl: `${window.location.origin}/events/${id}/?paid=1`,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch { /* checkout failed */ }
    finally { setPayingFee(false); }
  }

  /* ── Public RSVP handlers ── */
  async function handlePublicRsvpSearch() {
    setRsvpSearching(true);
    setRsvpError(null);
    try {
      const res = await apiFetch<{ token: string; playerInitials: string; eventTitle: string }>(
        '/api/rsvp/search',
        {
          method: 'POST',
          body: JSON.stringify({ name: rsvpName, eventId: id, captcha: rsvpCaptcha }),
        },
      );
      setRsvpToken(res.token);
      setRsvpPlayerInitials(res.playerInitials);
      setRsvpEventTitle(res.eventTitle);
      setRsvpStep('confirm');
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : t('rsvp_error'));
    } finally {
      setRsvpSearching(false);
    }
  }

  async function handlePublicRsvpConfirm(status: 'attending' | 'absent') {
    setRsvpConfirming(true);
    setRsvpError(null);
    try {
      await apiFetch('/api/rsvp/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: rsvpToken, status }),
      });
      setRsvpResult(status === 'attending' ? t('rsvp_registered') : t('rsvp_unregistered'));
      setRsvpStep('done');
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : t('rsvp_error'));
    } finally {
      setRsvpConfirming(false);
    }
  }

  /* ── Render ── */

  if (loading) return <LoadingSkeleton />;

  if (error || !event) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-red-800">
            {t('failed_load_event')}
          </h2>
          <p className="text-sm text-red-600">{error || t('event_not_found')}</p>
        </div>
      </div>
    );
  }

  const categories = event.categoryRequirement
    ? event.categoryRequirement.split(',').map((c) => c.trim())
    : [];

  /* ── Public (unauthenticated) view ── */
  if (authed === false && event) {
    return (
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        {/* ── Header ── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-block rounded-full bg-primary-100 px-3 py-0.5 text-xs font-semibold text-primary-700">
              {TYPE_I18N_KEYS[event.type] ? t(TYPE_I18N_KEYS[event.type]) : event.type}
            </span>
            {event.deadline && (
              <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-800">
                {deadlineCountdown(event.deadline)}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {event.title}
          </h1>
        </div>

        {/* ── Info grid ── */}
        <section className="grid gap-4 sm:grid-cols-2">
          <InfoItem label={t('date')} value={formatDate(event.date)} />
          {event.startTime && (
            <InfoItem label={t('start_time')} value={event.startTime} />
          )}
          {event.attendanceTime && (
            <InfoItem label={t('attendance_time')} value={event.attendanceTime} />
          )}
          {event.location && (
            <InfoItem label={t('location')} value={event.location} />
          )}
          {event.deadline && (
            <InfoItem label={t('deadline')} value={formatDate(event.deadline)} />
          )}
          {event.maxParticipants != null && (
            <InfoItem
              label={t('max_participants')}
              value={String(event.maxParticipants)}
            />
          )}
          {event.fee != null && event.fee! > 0 && (
            <InfoItem
              label={t('event_fee')}
              value={`${feeCurrency} ${(event.fee! / 100).toFixed(2)}`}
            />
          )}
          {weather && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                {t('weather_precipitation')}
              </p>
              <p className="text-sm text-gray-700">
                {weather.icon} {Math.round(weather.temperature)}&deg;C &middot; {weather.description}
                {weather.precipitation > 0 && (
                  <span className="text-gray-400"> &middot; {weather.precipitation}% {t('weather_precipitation')}</span>
                )}
              </p>
            </div>
          )}
        </section>

        {/* ── Description ── */}
        {event.description && (
          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('description')}
            </h2>
            <p className="whitespace-pre-line text-gray-700">
              {event.description}
            </p>
          </section>
        )}

        {/* ── Category badges ── */}
        {categories.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('categories')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <span
                  key={cat}
                  className="inline-block rounded-full border border-primary-300 bg-primary-50 px-3 py-0.5 text-xs font-medium text-primary-600"
                >
                  {cat}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Attachment ── */}
        {event.attachmentUrl && (
          <section>
            <a
              href={event.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
              {t('download_attachment')}
            </a>
          </section>
        )}

        {/* ── Tournament fee payment ── */}
        {feePaymentEnabled && event.fee != null && event.fee! > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="mb-1 text-base font-semibold text-amber-800">{t('event_fee_title')}</h2>
            <p className="mb-3 text-sm text-amber-700">
              {t('event_fee_description')}
            </p>
            <button
              onClick={handlePayFee}
              disabled={payingFee}
              className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {payingFee ? '...' : `${t('event_fee_pay')} ${feeCurrency} ${(event.fee! / 100).toFixed(2)}`}
            </button>
          </section>
        )}

        {/* ── Public RSVP ── */}
        <section className="rounded-xl border-2 border-primary-300 bg-primary-50 p-6">
          <h2 className="mb-1 text-lg font-semibold text-primary-800">
            {t('public_rsvp_title')}
          </h2>
          <p className="mb-4 text-sm text-primary-700">{t('public_rsvp_desc')}</p>

          {rsvpError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
              {rsvpError}
            </div>
          )}

          {rsvpStep === 'search' && (
            <div className="space-y-3">
              <AltchaWidget onVerify={setRsvpCaptcha} />
              <input
                type="text"
                value={rsvpName}
                onChange={(e) => setRsvpName(e.target.value)}
                placeholder={t('rsvp_child_name_placeholder')}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
              <button
                onClick={handlePublicRsvpSearch}
                disabled={rsvpSearching || !rsvpCaptcha || !rsvpName.trim()}
                className="w-full rounded-xl bg-primary-500 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-primary-600 disabled:opacity-50"
              >
                {rsvpSearching ? t('rsvp_searching') : t('rsvp_continue')}
              </button>
            </div>
          )}

          {rsvpStep === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                {t('rsvp_confirm_question')
                  .replace('{name}', rsvpPlayerInitials)
                  .replace('{event}', rsvpEventTitle)}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => handlePublicRsvpConfirm('attending')}
                  disabled={rsvpConfirming}
                  className="flex-1 rounded-xl bg-primary-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-primary-600 disabled:opacity-50"
                >
                  {rsvpConfirming ? '...' : t('rsvp_attending')}
                </button>
                <button
                  onClick={() => handlePublicRsvpConfirm('absent')}
                  disabled={rsvpConfirming}
                  className="flex-1 rounded-xl bg-red-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-red-600 disabled:opacity-50"
                >
                  {rsvpConfirming ? '...' : t('rsvp_absent')}
                </button>
              </div>
              <button
                onClick={() => { setRsvpStep('search'); setRsvpToken(''); setRsvpCaptcha(''); }}
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                {t('rsvp_select_other')}
              </button>
            </div>
          )}

          {rsvpStep === 'done' && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-primary-800">{rsvpResult}</p>
              <button
                onClick={() => {
                  setRsvpStep('search');
                  setRsvpToken('');
                  setRsvpCaptcha('');
                  setRsvpName('');
                  setRsvpResult(null);
                }}
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                {t('rsvp_confirm_another')}
              </button>
            </div>
          )}
        </section>

        {/* ── Login banner ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-600">
            {t('login_for_details_pre')}<a href="/login" className="font-semibold text-primary-600 underline hover:text-primary-800">{t('login_for_details_link')}</a>{t('login_for_details_post')}
          </p>
        </section>
      </main>
    );
  }

  const isParent = role === 'parent';
  const isCoach = role === 'coach' || role === 'admin';

  const summary = event.attendanceSummary;
  const totalResponded = summary.attending + summary.absent + summary.waitlist;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      {/* ── Header ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-primary-100 px-3 py-0.5 text-xs font-semibold text-primary-700">
            {TYPE_I18N_KEYS[event.type] ? t(TYPE_I18N_KEYS[event.type]) : event.type}
          </span>
          {event.deadline && (
            <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-800">
              {deadlineCountdown(event.deadline)}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          {event.title}
        </h1>
      </div>

      {/* ── Series banner ── */}
      {(event.seriesId || seriesInfo) && (
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
          </svg>
          <span>{t('part_of_series')}: <strong>{seriesInfo?.title || t('series')}</strong></span>
        </div>
      )}

      {/* ── Info grid ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <InfoItem label={t('date')} value={formatDate(event.date)} />
        {event.startTime && (
          <InfoItem label={t('start_time')} value={event.startTime} />
        )}
        {event.attendanceTime && (
          <InfoItem label={t('attendance_time')} value={event.attendanceTime} />
        )}
        {event.location && (
          <InfoItem label={t('location')} value={event.location} />
        )}
        {event.deadline && (
          <InfoItem label={t('deadline')} value={formatDate(event.deadline)} />
        )}
        {event.maxParticipants != null && (
          <InfoItem
            label={t('max_participants')}
            value={String(event.maxParticipants)}
          />
        )}
        {event.fee != null && event.fee > 0 && (
          <InfoItem
            label={t('event_fee')}
            value={`${feeCurrency} ${(event.fee / 100).toFixed(2)}`}
          />
        )}
        {weather && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
              {t('weather_precipitation')}
            </p>
            <p className="text-sm text-gray-700">
              {weather.icon} {Math.round(weather.temperature)}&deg;C &middot; {weather.description}
              {weather.precipitation > 0 && (
                <span className="text-gray-400"> &middot; {weather.precipitation}% {t('weather_precipitation')}</span>
              )}
            </p>
          </div>
        )}
      </section>

      {/* ── Description ── */}
      {event.description && (
        <section>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('description')}
          </h2>
          <p className="whitespace-pre-line text-gray-700">
            {event.description}
          </p>
        </section>
      )}

      {/* ── Category badges ── */}
      {categories.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('categories')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat}
                className="inline-block rounded-full border border-primary-300 bg-primary-50 px-3 py-0.5 text-xs font-medium text-primary-600"
              >
                {cat}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Attachment ── */}
      {event.attachmentUrl && (
        <section>
          <a
            href={event.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
            {t('download_attachment')}
          </a>
        </section>
      )}

      {/* ── Attendance summary (always visible) ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('attendance_summary')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t('attending')}
            value={summary.attending}
            color="green"
          />
          <StatCard label={t('absent')} value={summary.absent} color="red" />
          <StatCard
            label={t('waitlist')}
            value={summary.waitlist}
            color="yellow"
          />
          <StatCard
            label={t('no_response')}
            value={summary.unknown}
            color="gray"
          />
        </div>
        {totalResponded > 0 && event.maxParticipants != null && (
          <p className="mt-2 text-xs text-gray-500">
            {summary.attending} / {event.maxParticipants} {t('spots_filled')}
          </p>
        )}
      </section>

      {/* ── Parent RSVP ── */}
      {isParent && (
        <section className="rounded-xl border border-primary-200 bg-primary-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-primary-800">
            {t('your_response')}
          </h2>

          {rsvpStatus ? (
            <div className="flex items-center gap-3">
              <span
                className={`inline-block rounded-full px-4 py-1 text-sm font-semibold ${
                  rsvpStatus === 'attending'
                    ? 'bg-primary-200 text-primary-800'
                    : 'bg-red-200 text-red-900'
                }`}
              >
                {rsvpStatus === 'attending' ? t('attending') : t('absent')}
              </span>
              <button
                onClick={() => setRsvpStatus(null)}
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                {t('change')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <AltchaWidget onVerify={setCaptchaPayload} />
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => handleRsvp('attending')}
                  disabled={rsvpLoading || !captchaPayload}
                  className="flex-1 rounded-xl bg-primary-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-primary-600 disabled:opacity-50"
                >
                  {rsvpLoading ? '...' : t('attend')}
                </button>
                <button
                  onClick={() => handleRsvp('absent')}
                  disabled={rsvpLoading || !captchaPayload}
                  className="flex-1 rounded-xl bg-red-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-red-600 disabled:opacity-50"
                >
                  {rsvpLoading ? '...' : t('absent')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Tournament fee payment (authenticated) ── */}
      {isParent && feePaymentEnabled && event.fee != null && event.fee > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-1 text-base font-semibold text-amber-800">{t('event_fee_title')}</h2>
          <p className="mb-3 text-sm text-amber-700">
            {t('event_fee_description')}
          </p>
          <button
            onClick={handlePayFee}
            disabled={payingFee}
            className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
          >
            {payingFee ? '...' : `${t('event_fee_pay')} ${feeCurrency} ${(event.fee / 100).toFixed(2)}`}
          </button>
        </section>
      )}

      {/* ── Coach: Attendance table ── */}
      {isCoach && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('attendance_details')}
            </h2>
            <button
              onClick={fetchAttendance}
              className="text-xs text-primary-600 underline hover:text-primary-800"
            >
              {t('refresh')}
            </button>
          </div>
          <AttendanceTable records={attendance} loading={attendanceLoading} />
        </section>
      )}

      {/* ── Coach: Event checklist ── */}
      {isCoach && (
        <EventChecklist eventId={event.id} />
      )}

      {/* ── Coach: Team assignment ── */}
      {isCoach && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('team_assignment')}
          </h2>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-sm text-gray-600">
              {t('num_teams')}
              <input
                type="number"
                min={1}
                max={10}
                value={teamCount}
                onChange={(e) =>
                  setTeamCount(Math.max(1, Number(e.target.value)))
                }
                className="ml-2 w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={handleAutoAssignTeams}
              disabled={assigningTeams}
              className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
            >
              {assigningTeams ? t('assigning') : t('auto_assign')}
            </button>
          </div>

          {teamsLoading ? (
            <div className="animate-pulse h-16 rounded-lg bg-gray-100" />
          ) : teams.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <h3 className="mb-2 font-semibold text-gray-800">
                    {team.name}
                  </h3>
                  {team.players.length === 0 ? (
                    <p className="text-xs italic text-gray-400">{t('no_players')}</p>
                  ) : (
                    <ul className="space-y-1">
                      {team.players.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-700">{p.name}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                            {p.category}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-500">
              {t('no_teams')}
            </p>
          )}
        </section>
      )}

      {/* ── Coach: Send reminder ── */}
      {isCoach && (
        <section className="flex items-center gap-4">
          <button
            onClick={handleSendReminder}
            disabled={reminderSent}
            className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50 disabled:opacity-50"
          >
            {reminderSent ? t('reminder_sent') : t('send_reminder')}
          </button>
          {reminderSent && (
            <span className="text-xs text-primary-600">
              {t('reminder_sent_msg')}
            </span>
          )}
        </section>
      )}

      {/* ── Coach: Series actions ── */}
      {isCoach && (event.seriesId || seriesInfo) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('series_actions')}
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCancelInstance}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              {t('cancel_instance')}
            </button>
            <a
              href="/events/"
              className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50"
            >
              {t('view_all_events')}
            </a>
          </div>
        </section>
      )}

      {/* ── Tournament results ── */}
      {['tournament', 'match', 'friendly'].includes(event.type) && (
        <TournamentResultsForm
          eventId={event.id}
          eventType={event.type}
          isCoach={isCoach}
          initialResults={event.results ?? null}
        />
      )}

      {/* ── Back link ── */}
      <div className="pt-4">
        <a
          href="/dashboard/"
          className="text-sm text-primary-600 underline hover:text-primary-800"
        >
          {t('back_to_dashboard')}
        </a>
      </div>
    </main>
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'red' | 'yellow' | 'gray';
}) {
  const colors = {
    green: 'bg-green-50 text-green-800 border-green-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}
