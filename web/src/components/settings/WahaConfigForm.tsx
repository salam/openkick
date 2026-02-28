'use client';

import type { SettingsFormProps } from './ClubProfileForm';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

export default function WahaConfigForm({
  settings,
  onUpdate,
}: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        WAHA Configuration
      </h2>

      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1.5">
        <p className="font-medium">What is WAHA?</p>
        <p>
          WAHA (WhatsApp HTTP API) is a self-hosted service that connects
          openkick to WhatsApp. It runs as a Docker container on your
          server and provides the bridge so the bot can receive and send
          messages.
        </p>
        <p>
          <span className="font-medium">URL</span> — the address where
          your WAHA instance is running. If WAHA runs on the same server,
          use{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">
            http://localhost:3008
          </code>
          ; otherwise use the public URL of the machine hosting it.
        </p>
        <p>
          <span className="font-medium">Getting started</span> — follow
          the{' '}
          <a
            href="https://waha.devlike.pro/docs/overview/quick-start/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline hover:text-amber-700"
          >
            WAHA Quick Start guide &rarr;
          </a>{' '}
          to spin up the Docker container. Once running, open the dashboard at{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">
            your-url/dashboard
          </code>{' '}
          to scan the QR code and link your WhatsApp account.
        </p>
      </div>

      <div>
        <label htmlFor="waha_url" className={labelClass}>
          WAHA URL
        </label>
        <input
          id="waha_url"
          type="text"
          value={settings.waha_url || ''}
          onChange={(e) => onUpdate('waha_url', e.target.value)}
          placeholder="http://localhost:3008"
          className={inputClass}
        />
      </div>
      {settings.waha_url && (
        <div className="mt-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-sm text-gray-500">
            Configured: {settings.waha_url}
          </span>
        </div>
      )}
    </div>
  );
}
