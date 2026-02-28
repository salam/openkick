'use client';

import { useState } from 'react';

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
      {copied ? 'Copied!' : 'Copy'}
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

const TABS = ['Google Calendar', 'Apple Calendar', 'Outlook'] as const;

function CalendarInstructions({ url }: { url: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Google Calendar');

  return (
    <div className="mt-3">
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              tab === t
                ? 'border-b-2 border-emerald-500 text-emerald-700'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="pt-2 text-xs text-gray-500 leading-relaxed">
        {tab === 'Google Calendar' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Open <strong>Google Calendar</strong> in your browser</li>
            <li>Click <strong>+</strong> next to &quot;Other calendars&quot; &rarr; <strong>From URL</strong></li>
            <li>Paste: <code className="rounded bg-gray-100 px-1 text-[10px] break-all">{url}</code></li>
          </ol>
        )}
        {tab === 'Apple Calendar' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Open <strong>Calendar</strong> on your Mac or iPhone</li>
            <li>File &rarr; <strong>New Calendar Subscription</strong></li>
            <li>Paste: <code className="rounded bg-gray-100 px-1 text-[10px] break-all">{url}</code></li>
          </ol>
        )}
        {tab === 'Outlook' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Open <strong>Outlook</strong> &rarr; Calendar</li>
            <li>Click <strong>Add calendar</strong> &rarr; <strong>Subscribe from web</strong></li>
            <li>Paste: <code className="rounded bg-gray-100 px-1 text-[10px] break-all">{url}</code></li>
          </ol>
        )}
      </div>
    </div>
  );
}

export default function SubscribeCard() {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const allEventsUrl = `${base}/api/feeds/calendar.ics`;

  return (
    <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          Subscribe to updates
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
          <FeedUrl label="All events" url={allEventsUrl} />
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
              More feeds
            </button>

            {/* Always render for bots/crawlers but visually hidden until toggled */}
            <div className={moreOpen ? 'mt-3 space-y-5' : 'sr-only'}>
              {/* Per-type calendars */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Calendar by type
                </h3>
                <div className="space-y-2">
                  <FeedUrl label="Tournaments" url={`${base}/api/feeds/calendar/tournaments.ics`} />
                  <FeedUrl label="Matches" url={`${base}/api/feeds/calendar/matches.ics`} />
                  <FeedUrl label="Trainings" url={`${base}/api/feeds/calendar/trainings.ics`} />
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
                  Use with any RSS reader (Feedly, Thunderbird, NetNewsWire, etc.).
                </p>
              </div>

              {/* Social */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Social
                </h3>
                <div className="space-y-2">
                  <div className="rounded border border-gray-200 px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">Mastodon / Fediverse</span>
                    <span className="ml-2 text-xs text-gray-400">
                      Search for @club@{typeof window !== 'undefined' ? window.location.hostname : 'your-domain'}
                    </span>
                  </div>
                  <div className="rounded border border-gray-200 px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">Bluesky</span>
                    <span className="ml-2 text-xs text-gray-400">
                      Feed available via AT Protocol
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
