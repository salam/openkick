'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TemplateKey = 'training_headsup' | 'rain_alert' | 'holiday' | 'custom';

interface Template {
  key: TemplateKey;
  labelKey: string;
  descriptionKey: string;
}

interface BroadcastEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  time: string;
  categories?: string[];
}

interface Broadcast {
  id: string;
  message: string;
  status: 'draft' | 'sent';
  recipientCount: number;
  category?: string | null;
  createdAt: string;
  sentAt?: string | null;
}

const TEMPLATES: Template[] = [
  {
    key: 'training_headsup',
    labelKey: 'tpl_training_headsup',
    descriptionKey: 'tpl_training_desc',
  },
  {
    key: 'rain_alert',
    labelKey: 'tpl_rain_alert',
    descriptionKey: 'tpl_rain_desc',
  },
  {
    key: 'holiday',
    labelKey: 'tpl_holiday',
    descriptionKey: 'tpl_holiday_desc',
  },
  {
    key: 'custom',
    labelKey: 'tpl_custom',
    descriptionKey: 'tpl_custom_desc',
  },
];

const SFV_CATEGORIES = ['G', 'F', 'E', 'D-7', 'D-9', 'C', 'B', 'A'] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BroadcastComposer() {
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  // Composer state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null);
  const [events, setEvents] = useState<BroadcastEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string>('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // History state
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  /* ---- Data fetching ---- */

  const fetchBroadcasts = useCallback(async () => {
    try {
      const data = await apiFetch<Broadcast[]>('/api/broadcasts');
      setBroadcasts(data);
    } catch {
      // Silently fail – history is non-critical
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await apiFetch<BroadcastEvent[]>('/api/events');
        setEvents(data);
      } catch {
        // Events not available
      }
    }
    loadEvents();
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  /* ---- Recipient count ---- */

  useEffect(() => {
    async function loadCount() {
      try {
        const params = category ? `?category=${encodeURIComponent(category)}` : '';
        const data = await apiFetch<{ count: number }>(`/api/broadcasts/recipients${params}`);
        setRecipientCount(data.count);
      } catch {
        setRecipientCount(null);
      }
    }
    loadCount();
  }, [category]);

  /* ---- Handlers ---- */

  async function handleGenerate() {
    if (!selectedTemplate) return;
    if (selectedTemplate === 'custom') {
      setMessage('');
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const body: Record<string, string> = { template: selectedTemplate };
      if (selectedEventId) body.eventId = selectedEventId;
      const data = await apiFetch<{ message: string }>('/api/broadcasts/compose', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_generate'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // 1. Create the broadcast as draft
      const body: Record<string, unknown> = { message: message.trim() };
      if (category) body.category = category;
      const draft = await apiFetch<Broadcast>('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // 2. Send it
      await apiFetch(`/api/broadcasts/${draft.id}/send`, { method: 'POST' });

      setSuccessMsg(t('broadcast_sent'));
      setMessage('');
      setSelectedTemplate(null);
      setConfirmOpen(false);
      await fetchBroadcasts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_send_broadcast'));
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  }

  /* ---- Render ---- */

  return (
    <div className="space-y-8">
      {/* ---- Composer section ---- */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('compose_broadcast')}</h2>

        {/* Error / success banners */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">
              {t('dismiss')}
            </button>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {successMsg}
            <button onClick={() => setSuccessMsg(null)} className="ml-2 font-medium underline">
              {t('dismiss')}
            </button>
          </div>
        )}

        {/* Template selector */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-gray-700">{t('choose_template')}</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((tpl) => {
              const active = selectedTemplate === tpl.key;
              return (
                <button
                  key={tpl.key}
                  onClick={() => setSelectedTemplate(tpl.key)}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    active
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span
                    className={`block text-sm font-semibold ${active ? 'text-emerald-700' : 'text-gray-900'}`}
                  >
                    {t(tpl.labelKey)}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">{t(tpl.descriptionKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Event selector (for non-custom templates) */}
        {selectedTemplate && selectedTemplate !== 'custom' && (
          <div className="mb-5">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('link_to_event')}
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">{t('none')}</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} &mdash; {ev.date}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Generate button */}
        {selectedTemplate && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mb-5 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {generating ? t('generating') : selectedTemplate === 'custom' ? t('start_writing') : t('generate_message')}
          </button>
        )}

        {/* Message textarea */}
        {(message || selectedTemplate === 'custom') && (
          <div className="mb-5">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('message')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-800 focus:border-green-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder={t('type_message')}
            />
          </div>
        )}

        {/* Category filter + recipient count */}
        {message && (
          <div className="mb-5 flex flex-wrap items-end gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('category_filter')}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">{t('all_categories')}</option>
                {SFV_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
              {t('recipients')}:{' '}
              <span className="font-semibold text-emerald-700">
                {recipientCount !== null ? recipientCount : '--'}
              </span>
            </div>
          </div>
        )}

        {/* Send button */}
        {message.trim() && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={sending}
            className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {t('send_broadcast')}
          </button>
        )}
      </div>

      {/* ---- Confirmation dialog ---- */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">{t('confirm_send')}</h2>
            <p className="mb-1 text-sm text-gray-600">
              {t('confirm_send_msg')}
              {recipientCount !== null ? ` ${recipientCount} ${t('recipient_s')}` : ''}?
            </p>
            {category && (
              <p className="mb-3 text-xs text-gray-500">
                {t('filtered_to')}: <span className="font-medium">{category}</span>
              </p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {sending ? t('sending') : t('confirm_and_send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Sent history ---- */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('broadcast_history')}</h2>

        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : broadcasts.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t('no_broadcasts')}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {broadcasts.map((bc) => (
              <div key={bc.id} className="flex items-start gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-gray-800">{bc.message}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {bc.recipientCount} {t('recipient_s')}
                    {bc.category ? ` \u00b7 ${bc.category}` : ''}
                    {' \u00b7 '}
                    {new Date(bc.sentAt || bc.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    bc.status === 'sent'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {bc.status === 'sent' ? t('sent') : t('draft')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
