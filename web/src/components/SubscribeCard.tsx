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
      className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
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

export default function SubscribeCard() {
  const [open, setOpen] = useState(false);
  const base = typeof window !== 'undefined' ? window.location.origin : '';

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
        <div className="space-y-5 border-t border-gray-100 px-5 pb-5 pt-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Calendar
            </h3>
            <div className="space-y-2">
              <FeedUrl label="All events" url={`${base}/api/feeds/calendar.ics`} />
              <FeedUrl label="Tournaments" url={`${base}/api/feeds/calendar/tournaments.ics`} />
              <FeedUrl label="Matches" url={`${base}/api/feeds/calendar/matches.ics`} />
              <FeedUrl label="Trainings" url={`${base}/api/feeds/calendar/trainings.ics`} />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Copy a URL and paste it as a calendar subscription in Google Calendar, Apple Calendar, or Outlook.
            </p>
          </div>

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
      )}
    </div>
  );
}
