'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import AltchaWidget from '@/components/AltchaWidget';
import TournamentResultsForm from '@/components/TournamentResultsForm';

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
  if (diff <= 0) return 'Deadline passed';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h remaining`;
  return `${remainingHours}h remaining`;
}

const TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  match: 'Match',
  tournament: 'Tournament',
  social: 'Social Event',
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
        No attendance records yet.
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
              Player
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              Status
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              Source
            </th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">
              Reason
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 font-medium">
                {r.playerName || `Player #${r.playerId}`}
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

  /* ── Decode token on mount ── */
  useEffect(() => {
    const payload = decodeToken();
    if (payload) {
      setRole(payload.role || '');
      setPlayerId(payload.playerId ?? payload.sub ?? null);
    }
  }, []);

  /* ── Fetch event (or build virtual instance from series template) ── */
  useEffect(() => {
    if (!id) return;

    setLoading(true);

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
  }, [id, parsedSeriesId, parsedDate]);

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
    if (role === 'coach' || role === 'admin') {
      fetchAttendance();
    }
  }, [role, fetchAttendance]);

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
    if (role === 'coach' || role === 'admin') {
      fetchTeams();
    }
  }, [role, fetchTeams]);

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

    if (!confirm('Cancel this event instance? It will be removed from the series.')) return;

    try {
      await apiFetch(`/api/event-series/${sid}/exclude`, {
        method: 'POST',
        body: JSON.stringify({ date: eventDate }),
      });
      router.push('/events/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel instance');
    }
  }

  /* ── Render ── */

  if (loading) return <LoadingSkeleton />;

  if (error || !event) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-red-800">
            Failed to load event
          </h2>
          <p className="text-sm text-red-600">{error || 'Event not found'}</p>
        </div>
      </div>
    );
  }

  const categories = event.categoryRequirement
    ? event.categoryRequirement.split(',').map((c) => c.trim())
    : [];

  const isParent = role === 'parent';
  const isCoach = role === 'coach' || role === 'admin';

  const summary = event.attendanceSummary;
  const totalResponded = summary.attending + summary.absent + summary.waitlist;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      {/* ── Header ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
            {TYPE_LABELS[event.type] || event.type}
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
          <span>Part of series: <strong>{seriesInfo?.title || 'Event Series'}</strong></span>
        </div>
      )}

      {/* ── Info grid ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <InfoItem label="Date" value={formatDate(event.date)} />
        {event.startTime && (
          <InfoItem label="Start time" value={event.startTime} />
        )}
        {event.attendanceTime && (
          <InfoItem label="Attendance time" value={event.attendanceTime} />
        )}
        {event.location && (
          <InfoItem label="Location" value={event.location} />
        )}
        {event.deadline && (
          <InfoItem label="Deadline" value={formatDate(event.deadline)} />
        )}
        {event.maxParticipants != null && (
          <InfoItem
            label="Max participants"
            value={String(event.maxParticipants)}
          />
        )}
      </section>

      {/* ── Description ── */}
      {event.description && (
        <section>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Description
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
            Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat}
                className="inline-block rounded-full border border-emerald-300 bg-emerald-50 px-3 py-0.5 text-xs font-medium text-emerald-600"
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
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50"
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
            Download attachment (PDF)
          </a>
        </section>
      )}

      {/* ── Attendance summary (always visible) ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Attendance summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Attending"
            value={summary.attending}
            color="green"
          />
          <StatCard label="Absent" value={summary.absent} color="red" />
          <StatCard
            label="Waitlist"
            value={summary.waitlist}
            color="yellow"
          />
          <StatCard
            label="No response"
            value={summary.unknown}
            color="gray"
          />
        </div>
        {totalResponded > 0 && event.maxParticipants != null && (
          <p className="mt-2 text-xs text-gray-500">
            {summary.attending} / {event.maxParticipants} spots filled
          </p>
        )}
      </section>

      {/* ── Parent RSVP ── */}
      {isParent && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-emerald-800">
            Your response
          </h2>

          {rsvpStatus ? (
            <div className="flex items-center gap-3">
              <span
                className={`inline-block rounded-full px-4 py-1 text-sm font-semibold ${
                  rsvpStatus === 'attending'
                    ? 'bg-emerald-200 text-emerald-800'
                    : 'bg-red-200 text-red-900'
                }`}
              >
                {rsvpStatus === 'attending' ? 'Attending' : 'Absent'}
              </span>
              <button
                onClick={() => setRsvpStatus(null)}
                className="text-sm text-emerald-600 underline hover:text-emerald-800"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <AltchaWidget onVerify={setCaptchaPayload} />
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => handleRsvp('attending')}
                  disabled={rsvpLoading || !captchaPayload}
                  className="flex-1 rounded-xl bg-emerald-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  {rsvpLoading ? '...' : 'Attend'}
                </button>
                <button
                  onClick={() => handleRsvp('absent')}
                  disabled={rsvpLoading || !captchaPayload}
                  className="flex-1 rounded-xl bg-red-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-red-600 disabled:opacity-50"
                >
                  {rsvpLoading ? '...' : 'Absent'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Coach: Attendance table ── */}
      {isCoach && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Attendance details
            </h2>
            <button
              onClick={fetchAttendance}
              className="text-xs text-emerald-600 underline hover:text-emerald-800"
            >
              Refresh
            </button>
          </div>
          <AttendanceTable records={attendance} loading={attendanceLoading} />
        </section>
      )}

      {/* ── Coach: Team assignment ── */}
      {isCoach && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Team assignment
          </h2>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-sm text-gray-600">
              Number of teams
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
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {assigningTeams ? 'Assigning...' : 'Auto-assign teams'}
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
                    <p className="text-xs italic text-gray-400">No players</p>
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
              No teams assigned yet.
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
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
          >
            {reminderSent ? 'Reminder sent' : 'Send reminder'}
          </button>
          {reminderSent && (
            <span className="text-xs text-emerald-600">
              Reminder has been sent to all parents.
            </span>
          )}
        </section>
      )}

      {/* ── Coach: Series actions ── */}
      {isCoach && (event.seriesId || seriesInfo) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Series actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCancelInstance}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Cancel this instance
            </button>
            <a
              href="/events/"
              className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50"
            >
              View all events
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
          className="text-sm text-emerald-600 underline hover:text-emerald-800"
        >
          Back to dashboard
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
