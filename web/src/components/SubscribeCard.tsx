'use client';

import { useState, useEffect } from 'react';
import { t, getLanguage } from '@/lib/i18n';

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-2 shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
    >
      {copied ? t('copied') : t('copy')}
    </button>
  );
}

function FeedUrl({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="ml-2 text-xs text-gray-400 break-all">{url}</span>
      </div>
      <CopyButton url={url} />
    </div>
  );
}

const TAB_KEYS = ['google_calendar', 'apple_calendar', 'outlook'] as const;

function CalendarInstructions({ url }: { url: string }) {
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>('google_calendar');

  return (
    <div className="mt-3">
      <div className="flex gap-1 border-b border-gray-200">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              tab === key
                ? 'border-b-2 border-emerald-500 text-emerald-700'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div className="pt-2 text-xs text-gray-500 leading-relaxed">
        {tab === 'google_calendar' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>{t('google_cal_step1')}</li>
            <li>{t('google_cal_step2')}</li>
            <li>{t('google_cal_step3')}: <code className="rounded bg-gray-100 px-1 text-[10px] break-all">{url}</code></li>
          </ol>
        )}
        {tab === 'apple_calendar' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>{t('apple_cal_step1')}</li>
            <li>{t('apple_cal_step2')}</li>
            <li>{t('apple_cal_step3')}: <code className="rounded bg-gray-100 px-1 text-[10px] break-all">{url}</code></li>
          </ol>
        )}
        {tab === 'outlook' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>{t('outlook_step1')}</li>
            <li>{t('outlook_step2')}</li>
            <li>{t('outlook_step3')}: <code className="rounded bg-gray-100 px-1 text-[10px] break-all">{url}</code></li>
          </ol>
        )}
      </div>
    </div>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SubscribeCard() {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const base = API_URL;
  const allEventsUrl = `${base}/api/feeds/calendar.ics`;
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  return (
    <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {t('subscribe_updates')}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          {/* Primary: All events calendar */}
          <FeedUrl label={t('all_events')} url={allEventsUrl} />
          <CalendarInstructions url={allEventsUrl} />

          {/* More feeds — collapsed for users, open for bots via noscript */}
          <div className="mt-5">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
            >
              <svg
                className={`h-3 w-3 transition-transform ${moreOpen ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('more_feeds')}
            </button>

            {/* Always render for bots/crawlers but visually hidden until toggled */}
            <div className={moreOpen ? 'mt-3 space-y-5' : 'sr-only'}>
              {/* Per-type calendars */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('calendar_by_type')}
                </h3>
                <div className="space-y-2">
                  <FeedUrl label={t('tournaments_feed')} url={`${base}/api/feeds/calendar/tournaments.ics`} />
                  <FeedUrl label={t('matches_feed')} url={`${base}/api/feeds/calendar/matches.ics`} />
                  <FeedUrl label={t('trainings_feed')} url={`${base}/api/feeds/calendar/trainings.ics`} />
                </div>
              </div>

              {/* RSS / Atom */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  RSS / Atom
                </h3>
                <div className="space-y-2">
                  <FeedUrl label="RSS 2.0" url={`${base}/api/feeds/rss`} />
                  <FeedUrl label="Atom" url={`${base}/api/feeds/atom`} />
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  {t('rss_hint')}
                </p>
              </div>

              {/* Social */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('social')}
                </h3>
                <div className="space-y-2">
                  <div className="rounded border border-gray-200 px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">{t('mastodon_fediverse')}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {t('search_at_club')}{typeof window !== 'undefined' ? window.location.hostname : 'your-domain'}
                    </span>
                  </div>
                  <div className="rounded border border-gray-200 px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">{t('bluesky')}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {t('feed_at_protocol')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
