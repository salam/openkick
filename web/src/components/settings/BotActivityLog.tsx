'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';

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

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  attendance_attending: { label: 'Attending', color: 'bg-emerald-100 text-emerald-700' },
  attendance_absent: { label: 'Absent', color: 'bg-red-100 text-red-700' },
  attendance_waitlist: { label: 'Waitlist', color: 'bg-amber-100 text-amber-700' },
  coach_command: { label: 'Coach', color: 'bg-blue-100 text-blue-700' },
  help_sent: { label: 'Help', color: 'bg-gray-100 text-gray-600' },
  onboarding: { label: 'Onboarding', color: 'bg-purple-100 text-purple-700' },
  onboarding_started: { label: 'Onboarding', color: 'bg-purple-100 text-purple-700' },
  disambiguating: { label: 'Clarifying', color: 'bg-yellow-100 text-yellow-700' },
  disambiguation: { label: 'Clarifying', color: 'bg-yellow-100 text-yellow-700' },
  no_event: { label: 'No event', color: 'bg-gray-100 text-gray-500' },
  no_players: { label: 'No player', color: 'bg-gray-100 text-gray-500' },
  ignored_unknown: { label: 'Ignored', color: 'bg-gray-100 text-gray-400' },
  ignored_unknown_group: { label: 'Ignored', color: 'bg-gray-100 text-gray-400' },
};

const PAGE_SIZE = 20;

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';

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
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function maskPhone(phone: string): string {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 4) + '***' + phone.slice(-2);
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
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
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
            const isExpanded = expanded === entry.id;

            return (
              <div key={entry.id} className={`rounded-lg border transition-colors ${entry.direction === 'out' ? 'border-emerald-100 bg-emerald-50/30 hover:border-emerald-200' : 'border-gray-100 hover:border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : entry.id)}
                  className="w-full px-3 py-2 text-left"
                >
                  <div className="flex items-center gap-2 text-sm">
                    {/* Direction + Timestamp */}
                    <span className="shrink-0 text-xs text-gray-400 w-28">
                      <span className={entry.direction === 'out' ? 'text-emerald-500' : 'text-gray-400'}>
                        {entry.direction === 'out' ? '↗' : '↙'}
                      </span>{' '}
                      {formatTime(entry.createdAt)}
                    </span>

                    {/* Sender */}
                    <span className="shrink-0 text-xs font-medium text-gray-700 w-28 truncate" title={entry.phone}>
                      {entry.direction === 'out' ? 'Bot' : (entry.guardianName || maskPhone(entry.phone))}
                    </span>

                    {/* Message preview */}
                    <span className={`flex-1 truncate text-xs ${entry.direction === 'out' ? 'text-emerald-700' : 'text-gray-600'}`}>
                      {entry.body || '(audio)'}
                    </span>

                    {/* Action badge */}
                    {actionInfo && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${actionInfo.color}`}>
                        {actionInfo.label}
                      </span>
                    )}

                    {/* Player + Event */}
                    {entry.playerName && (
                      <span className="shrink-0 text-xs text-emerald-600 font-medium truncate max-w-24">
                        {entry.playerName}
                      </span>
                    )}

                    {/* Expand indicator */}
                    <span className="shrink-0 text-xs text-gray-300">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-3 py-3 space-y-2 bg-gray-50">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-gray-400">{t('bot_activity_phone')}:</span>{' '}
                        <span className="text-gray-700 font-mono">{entry.phone}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">{t('bot_activity_role')}:</span>{' '}
                        <span className="text-gray-700 capitalize">{entry.guardianRole || 'unknown'}</span>
                      </div>
                      {entry.intent && (
                        <div>
                          <span className="text-gray-400">{t('bot_activity_intent')}:</span>{' '}
                          <span className="text-gray-700">{entry.intent}</span>
                        </div>
                      )}
                      {entry.action && (
                        <div>
                          <span className="text-gray-400">{t('bot_activity_action')}:</span>{' '}
                          <span className="text-gray-700">{entry.action}</span>
                        </div>
                      )}
                      {entry.eventTitle && (
                        <div>
                          <span className="text-gray-400">{t('bot_activity_event')}:</span>{' '}
                          <span className="text-gray-700">{entry.eventTitle} ({entry.eventDate})</span>
                        </div>
                      )}
                      {entry.playerName && (
                        <div>
                          <span className="text-gray-400">{t('bot_activity_player')}:</span>{' '}
                          <span className="text-gray-700">{entry.playerName}</span>
                        </div>
                      )}
                    </div>

                    {/* Inbound message */}
                    {entry.body && (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-0.5">
                          {t('bot_activity_message_in')}
                        </p>
                        <p className="whitespace-pre-wrap rounded bg-white px-2 py-1.5 text-xs text-gray-800 border border-gray-100">
                          {entry.body}
                        </p>
                      </div>
                    )}

                    {/* Bot response */}
                    {entry.outboundBody && (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-0.5">
                          {t('bot_activity_message_out')}
                        </p>
                        <p className="whitespace-pre-wrap rounded bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800 border border-emerald-100">
                          {entry.outboundBody}
                        </p>
                      </div>
                    )}
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
          <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}</span>
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
