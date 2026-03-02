'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';

interface OutcomeEntry {
  action: string;
  playerId?: number;
  playerName?: string;
  eventId?: number;
  eventTitle?: string;
  eventDate?: string;
}

interface ActivityEntry {
  id: number;
  wahaMessageId: string;
  phone: string;
  direction: string;
  body: string | null;
  intent: string | null;
  action: string | null;
  playerId: number | null;
  eventId: number | null;
  outboundBody: string | null;
  outcomes: OutcomeEntry[] | null;
  createdAt: string;
  guardianName: string | null;
  guardianRole: string | null;
  playerName: string | null;
  eventTitle: string | null;
  eventDate: string | null;
}

interface ActivityResponse {
  entries: ActivityEntry[];
  total: number;
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  attendance_attending: { label: 'Attending', color: 'bg-primary-100 text-primary-700', icon: '\u2705' },
  attendance_absent: { label: 'Absent', color: 'bg-red-100 text-red-700', icon: '\u274C' },
  attendance_waitlist: { label: 'Waitlist', color: 'bg-amber-100 text-amber-700', icon: '\u23F3' },
  attendance_multi: { label: 'Multi-date', color: 'bg-primary-100 text-primary-700', icon: '\uD83D\uDCC5' },
  coach_command: { label: 'Coach', color: 'bg-blue-100 text-blue-700', icon: '\uD83D\uDCCB' },
  help_sent: { label: 'Help', color: 'bg-gray-100 text-gray-600', icon: '\u2753' },
  onboarding: { label: 'Onboarding', color: 'bg-purple-100 text-purple-700', icon: '\uD83D\uDC4B' },
  onboarding_started: { label: 'Onboarding', color: 'bg-purple-100 text-purple-700', icon: '\uD83D\uDC4B' },
  disambiguating: { label: 'Clarifying', color: 'bg-yellow-100 text-yellow-700', icon: '\uD83D\uDD04' },
  disambiguation: { label: 'Clarifying', color: 'bg-yellow-100 text-yellow-700', icon: '\uD83D\uDD04' },
  no_event: { label: 'No event', color: 'bg-gray-100 text-gray-500', icon: '\uD83D\uDCC5' },
  no_players: { label: 'No player', color: 'bg-gray-100 text-gray-500', icon: '\u2014' },
  ignored_unknown: { label: 'Ignored', color: 'bg-gray-100 text-gray-400', icon: '\uD83D\uDEAB' },
  ignored_unknown_group: { label: 'Ignored', color: 'bg-gray-100 text-gray-400', icon: '\uD83D\uDEAB' },
};

const PAGE_SIZE = 20;

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';

function isIgnored(action: string | null): boolean {
  return action === 'ignored_unknown' || action === 'ignored_unknown_group';
}

function isSuccess(action: string | null): boolean {
  return !!action && !action.startsWith('ignored') && action !== 'no_event' && action !== 'no_players';
}

const PersonIcon = () => (
  <svg className="w-3 h-3 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 8a5 5 0 0110 0H3z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-3 h-3 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 0a1 1 0 011 1v1h6V1a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H2a2 2 0 01-2-2V4a2 2 0 012-2h1V1a1 1 0 011-1zm10 6H2v8h12V6z" />
  </svg>
);

function OutcomeStrip({ outcome }: { outcome: OutcomeEntry; }) {
  const ai = ACTION_LABELS[outcome.action] ?? null;
  return (
    <div className="flex items-center gap-1.5 text-xs flex-wrap">
      {outcome.playerName && outcome.playerId ? (
        <a
          href={`/dashboard/players?highlight=${outcome.playerId}`}
          className="inline-flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-0.5 font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors"
        >
          <PersonIcon />
          {outcome.playerName}
        </a>
      ) : outcome.playerName ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-0.5 font-medium text-gray-700">
          <PersonIcon />
          {outcome.playerName}
        </span>
      ) : null}

      {outcome.playerName && (ai || outcome.eventTitle) && (
        <span className="text-gray-400">&rarr;</span>
      )}

      {ai && (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${ai.color}`}>
          <span>{ai.icon}</span>
          {ai.label}
        </span>
      )}

      {ai && outcome.eventTitle && (
        <span className="text-gray-400">&rarr;</span>
      )}

      {outcome.eventTitle && outcome.eventId ? (
        <a
          href={`/events/${outcome.eventId}`}
          className="inline-flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-0.5 text-gray-600 hover:border-primary-300 hover:text-primary-700 transition-colors"
        >
          <CalendarIcon />
          {outcome.eventTitle}
          {outcome.eventDate && (
            <span className="text-gray-400 text-[10px]">
              {new Date(outcome.eventDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          )}
        </a>
      ) : outcome.eventTitle ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-0.5 text-gray-600">
          <CalendarIcon />
          {outcome.eventTitle}
          {outcome.eventDate && (
            <span className="text-gray-400 text-[10px]">
              {new Date(outcome.eventDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          )}
        </span>
      ) : null}
    </div>
  );
}

/** Build a single legacy outcome from the flat entry fields (for old log entries without outcomes JSON). */
function legacyOutcome(entry: ActivityEntry): OutcomeEntry | null {
  if (!entry.playerName && !entry.eventTitle && !entry.action) return null;
  return {
    action: entry.action ?? '',
    playerId: entry.playerId ?? undefined,
    playerName: entry.playerName ?? undefined,
    eventId: entry.eventId ?? undefined,
    eventTitle: entry.eventTitle ?? undefined,
    eventDate: entry.eventDate ?? undefined,
  };
}

export default function BotActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const loadEntries = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const data = await apiFetch<ActivityResponse>(
        `/api/whatsapp/activity?limit=${PAGE_SIZE}&offset=${newOffset}`,
      );
      setEntries(data.entries);
      setTotal(data.total);
      setOffset(newOffset);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries(0);
  }, [loadEntries]);

  function formatTime(iso: string): string {
    const d = new Date(iso + 'Z');
    return d.toLocaleString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });
  }

  function formatTimeFull(iso: string): string {
    const d = new Date(iso + 'Z');
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function maskPhone(phone: string): string {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 4) + '\u2022\u2022\u2022' + phone.slice(-2);
  }

  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {t('bot_activity_log')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('bot_activity_log_desc')}
          </p>
        </div>
        <button
          onClick={() => loadEntries(0)}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '...' : t('refresh')}
        </button>
      </div>

      {loading && entries.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          {t('bot_activity_empty')}
        </p>
      )}

      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry) => {
            const actionInfo = entry.action ? ACTION_LABELS[entry.action] : null;
            const isExp = expanded === entry.id;
            const ignored = isIgnored(entry.action);

            // Resolve outcomes: prefer JSON array, fall back to single legacy outcome
            const resolvedOutcomes: OutcomeEntry[] = entry.outcomes && entry.outcomes.length > 0
              ? entry.outcomes
              : (() => { const o = legacyOutcome(entry); return o ? [o] : []; })();

            return (
              <div key={entry.id} className={`rounded-lg border transition-colors ${
                ignored
                  ? 'border-gray-50 bg-gray-50/50 hover:border-gray-100'
                  : 'border-gray-100 hover:border-gray-200'
              }`}>
                {/* ── Collapsed row ── */}
                <button
                  type="button"
                  onClick={() => !ignored && setExpanded(isExp ? null : entry.id)}
                  className={`w-full px-3 py-2 text-left ${ignored ? 'cursor-default' : ''}`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    {/* Status dot + Timestamp */}
                    <span className="shrink-0 text-xs text-gray-400 flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                        ignored ? 'bg-gray-300' : isSuccess(entry.action) ? 'bg-green-500' : 'bg-red-400'
                      }`} />
                      {formatTimeFull(entry.createdAt)}
                    </span>

                    <span className="text-gray-200">|</span>

                    {/* Phone, Playername */}
                    <span className={`shrink-0 text-xs font-medium truncate max-w-44 ${ignored ? 'text-gray-400' : 'text-gray-700'}`} title={entry.phone}>
                      {maskPhone(entry.phone)}
                      {entry.playerName && !ignored && (
                        <span className="text-primary-600">, {entry.playerName}</span>
                      )}
                    </span>

                    <span className="text-gray-200">|</span>

                    {/* Message preview + action pill */}
                    <span className="flex-1 flex items-center gap-1.5 min-w-0">
                      <span className={`truncate text-xs ${
                        ignored ? 'text-gray-300 italic' : 'text-gray-600'
                      }`}>
                        {ignored ? '\u2014' : (entry.body || '(audio)')}
                      </span>
                      {actionInfo && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${actionInfo.color}`}>
                          {actionInfo.label}
                        </span>
                      )}
                    </span>

                    {/* Expand indicator */}
                    {!ignored && (
                      <span className="shrink-0 text-xs text-gray-300">
                        {isExp ? '\u25BE' : '\u25B8'}
                      </span>
                    )}
                  </div>
                </button>

                {/* ── Expanded: paired conversation view ── */}
                {isExp && !ignored && (
                  <div className="border-t border-gray-100">
                    <div className="bg-[#efeae2] px-3 py-3 space-y-2" style={{
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'1\' cy=\'1\' r=\'0.5\' fill=\'%23d5cec3\' fill-opacity=\'0.3\'/%3E%3C/svg%3E")',
                    }}>
                      {/* Inbound bubble */}
                      {entry.body && (
                        <div className="flex justify-start">
                          <div className="relative max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 shadow-sm">
                            <p className="text-[10px] font-semibold text-primary-600 mb-0.5">
                              {entry.guardianName || maskPhone(entry.phone)}
                            </p>
                            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                              {entry.body}
                            </p>
                            <span className="block text-right text-[9px] text-gray-400 mt-0.5 -mb-0.5">
                              {formatTime(entry.createdAt)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Outbound bubble */}
                      {entry.outboundBody && (
                        <div className="flex justify-end">
                          <div className="relative max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 shadow-sm">
                            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                              {entry.outboundBody}
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                              <span className="text-[9px] text-gray-400">
                                {formatTime(entry.createdAt)}
                              </span>
                              <svg className="w-3 h-3 text-blue-400" viewBox="0 0 16 16" fill="none">
                                <path d="M1.5 8.5L5 12L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M5.5 8.5L9 12L15 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action outcome strips — one per outcome */}
                      {resolvedOutcomes.length > 0 && (
                        <div className="space-y-1 px-1 pt-1">
                          {resolvedOutcomes.map((outcome, i) => (
                            <OutcomeStrip key={i} outcome={outcome} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>{offset + 1}&ndash;{Math.min(offset + PAGE_SIZE, total)} / {total}</span>
          <div className="flex gap-2">
            <button
              onClick={() => loadEntries(Math.max(0, offset - PAGE_SIZE))}
              disabled={!hasPrev || loading}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-30"
            >
              &larr;
            </button>
            <button
              onClick={() => loadEntries(offset + PAGE_SIZE)}
              disabled={!hasMore || loading}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-30"
            >
              &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
