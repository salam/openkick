'use client';

import { useEffect, useState, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { apiFetch } from '@/lib/api';

interface SettingRecord {
  key: string;
  value: string;
}

const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'euria', label: 'Infomaniak Euria' },
];

const BOT_LANGUAGES = [
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Francais' },
  { value: 'en', label: 'English' },
];

const CAPTCHA_PROVIDERS = [
  { value: 'altcha', label: 'Altcha (Proof-of-Work)' },
  { value: 'hcaptcha', label: 'hCaptcha' },
  { value: 'friendly', label: 'Friendly Captcha' },
];

const SETTING_KEYS = [
  'llm_provider',
  'llm_model',
  'llm_api_key',
  'llm_product_id',
  'bot_language',
  'waha_url',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'smtp_from',
  'captcha_provider',
] as const;

type SettingsMap = Record<string, string>;

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [original, setOriginal] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [syncingZurich, setSyncingZurich] = useState(false);
  const [uploadingIcs, setUploadingIcs] = useState(false);
  const [holidayMsg, setHolidayMsg] = useState('');
  const [smtpTestTo, setSmtpTestTo] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiFetch<SettingRecord[]>('/api/settings');
      const map: SettingsMap = {};
      data.forEach((s) => {
        map[s.key] = s.value;
      });
      setSettings(map);
      setOriginal(map);
    } catch {
      // settings not available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function update(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg('');
    try {
      const changed = SETTING_KEYS.filter((k) => settings[k] !== original[k]);
      await Promise.all(
        changed.map((key) =>
          apiFetch(`/api/settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value: settings[key] || '' }),
          }),
        ),
      );
      setOriginal({ ...settings });
      setSaveMsg('Settings saved successfully.');
    } catch {
      setSaveMsg('Failed to save settings.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>(
        '/api/settings/test-llm',
        { method: 'POST' },
      );
      setTestResult({ ok: res.success, msg: res.message || 'Connection successful.' });
    } catch {
      setTestResult({ ok: false, msg: 'Connection test failed.' });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleTestSmtp() {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      // Save SMTP settings first
      const smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'] as const;
      const changed = smtpKeys.filter((k) => settings[k] !== original[k]);
      if (changed.length > 0) {
        await Promise.all(
          changed.map((key) =>
            apiFetch(`/api/settings/${key}`, {
              method: 'PUT',
              body: JSON.stringify({ value: settings[key] || '' }),
            }),
          ),
        );
        setOriginal((prev) => {
          const next = { ...prev };
          changed.forEach((k) => { next[k] = settings[k]; });
          return next;
        });
      }
      const res = await apiFetch<{ success: boolean; message?: string }>(
        '/api/settings/test-smtp',
        { method: 'POST', body: JSON.stringify({ to: smtpTestTo }) },
      );
      setSmtpTestResult({ ok: res.success, msg: res.message || 'Test email sent.' });
    } catch {
      setSmtpTestResult({ ok: false, msg: 'Failed to send test email.' });
    } finally {
      setTestingSmtp(false);
    }
  }

  async function handleSyncZurich() {
    setSyncingZurich(true);
    setHolidayMsg('');
    try {
      await apiFetch('/api/vacations/sync-zurich', { method: 'POST' });
      setHolidayMsg('Zurich holidays synced successfully.');
    } catch {
      setHolidayMsg('Failed to sync Zurich holidays.');
    } finally {
      setSyncingZurich(false);
      setTimeout(() => setHolidayMsg(''), 3000);
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim()) return;
    setImportingUrl(true);
    setHolidayMsg('');
    try {
      await apiFetch('/api/vacations/import-url', {
        method: 'POST',
        body: JSON.stringify({ url: importUrl }),
      });
      setHolidayMsg('Holidays imported from URL successfully.');
      setImportUrl('');
    } catch {
      setHolidayMsg('Failed to import holidays from URL.');
    } finally {
      setImportingUrl(false);
      setTimeout(() => setHolidayMsg(''), 3000);
    }
  }

  async function handleUploadIcs(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcs(true);
    setHolidayMsg('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/vacations/import-ics`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      setHolidayMsg('ICS file uploaded successfully.');
    } catch {
      setHolidayMsg('Failed to upload ICS file.');
    } finally {
      setUploadingIcs(false);
      e.target.value = '';
      setTimeout(() => setHolidayMsg(''), 3000);
    }
  }

  const hasChanges = SETTING_KEYS.some((k) => settings[k] !== original[k]);

  const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
  const inputClass =
    'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
  const btnSecondary =
    'rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50';

  return (
    <AuthGuard>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* LLM Configuration */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                LLM Configuration
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="llm_provider" className={labelClass}>
                    Provider
                  </label>
                  <select
                    id="llm_provider"
                    value={settings.llm_provider || ''}
                    onChange={(e) => update('llm_provider', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select provider...</option>
                    {LLM_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="llm_model" className={labelClass}>
                    Model
                  </label>
                  <input
                    id="llm_model"
                    type="text"
                    value={settings.llm_model || ''}
                    onChange={(e) => update('llm_model', e.target.value)}
                    placeholder="e.g. gpt-4o-mini, claude-sonnet-4-20250514, qwen3"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="llm_api_key" className={labelClass}>
                    API Key
                  </label>
                  <input
                    id="llm_api_key"
                    type="password"
                    value={settings.llm_api_key || ''}
                    onChange={(e) => update('llm_api_key', e.target.value)}
                    placeholder="Enter API key"
                    className={inputClass}
                  />
                </div>

                {settings.llm_provider === 'euria' && (
                  <div>
                    <label htmlFor="llm_product_id" className={labelClass}>
                      Product ID
                    </label>
                    <input
                      id="llm_product_id"
                      type="text"
                      value={settings.llm_product_id || ''}
                      onChange={(e) => update('llm_product_id', e.target.value)}
                      placeholder="Infomaniak Product ID"
                      className={inputClass}
                    />
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className={btnSecondary}
                  >
                    {testingConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                  {testResult && (
                    <span
                      className={`text-sm font-medium ${
                        testResult.ok ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {testResult.msg}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bot Language */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Bot Language
              </h2>
              <p className="mb-3 text-sm text-gray-500">
                Language used for WhatsApp bot messages.
              </p>
              <div className="flex flex-wrap gap-4">
                {BOT_LANGUAGES.map((lang) => (
                  <label
                    key={lang.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="bot_language"
                      value={lang.value}
                      checked={settings.bot_language === lang.value}
                      onChange={(e) => update('bot_language', e.target.value)}
                      className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-gray-700">{lang.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* WAHA Configuration */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                WAHA Configuration
              </h2>
              <div>
                <label htmlFor="waha_url" className={labelClass}>
                  WAHA URL
                </label>
                <input
                  id="waha_url"
                  type="text"
                  value={settings.waha_url || ''}
                  onChange={(e) => update('waha_url', e.target.value)}
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

            {/* SMTP / Email Configuration */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Email (SMTP)
              </h2>
              <p className="mb-3 text-sm text-gray-500">
                Required for password reset emails.
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="smtp_host" className={labelClass}>
                      SMTP Host
                    </label>
                    <input
                      id="smtp_host"
                      type="text"
                      value={settings.smtp_host || ''}
                      onChange={(e) => update('smtp_host', e.target.value)}
                      placeholder="mail.example.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="smtp_port" className={labelClass}>
                      Port
                    </label>
                    <input
                      id="smtp_port"
                      type="number"
                      value={settings.smtp_port || '587'}
                      onChange={(e) => update('smtp_port', e.target.value)}
                      placeholder="587"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="smtp_user" className={labelClass}>
                    Username
                  </label>
                  <input
                    id="smtp_user"
                    type="text"
                    value={settings.smtp_user || ''}
                    onChange={(e) => update('smtp_user', e.target.value)}
                    placeholder="user@example.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="smtp_pass" className={labelClass}>
                    Password
                  </label>
                  <input
                    id="smtp_pass"
                    type="password"
                    value={settings.smtp_pass || ''}
                    onChange={(e) => update('smtp_pass', e.target.value)}
                    placeholder="Enter SMTP password"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="smtp_from" className={labelClass}>
                    From Address
                  </label>
                  <input
                    id="smtp_from"
                    type="email"
                    value={settings.smtp_from || ''}
                    onChange={(e) => update('smtp_from', e.target.value)}
                    placeholder="noreply@yourclub.com"
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="email"
                    value={smtpTestTo}
                    onChange={(e) => setSmtpTestTo(e.target.value)}
                    placeholder="Send test to..."
                    className={inputClass + ' max-w-xs'}
                  />
                  <button
                    onClick={handleTestSmtp}
                    disabled={testingSmtp || !smtpTestTo}
                    className={btnSecondary + ' whitespace-nowrap'}
                  >
                    {testingSmtp ? 'Sending...' : 'Send Test Email'}
                  </button>
                </div>
                {smtpTestResult && (
                  <p
                    className={`text-sm font-medium ${
                      smtpTestResult.ok ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {smtpTestResult.msg}
                  </p>
                )}
              </div>
            </div>

            {/* Holiday Sources */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Holiday Sources
              </h2>
              <div className="space-y-4">
                <div>
                  <button
                    onClick={handleSyncZurich}
                    disabled={syncingZurich}
                    className={btnSecondary}
                  >
                    {syncingZurich ? 'Syncing...' : 'Sync Zurich Holidays'}
                  </button>
                </div>

                <div>
                  <label htmlFor="import_url" className={labelClass}>
                    Import from URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="import_url"
                      type="text"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="Paste holidays URL..."
                      className={inputClass}
                    />
                    <button
                      onClick={handleImportUrl}
                      disabled={importingUrl || !importUrl.trim()}
                      className={btnSecondary + ' whitespace-nowrap'}
                    >
                      {importingUrl ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="upload_ics" className={labelClass}>
                    Upload ICS File
                  </label>
                  <input
                    id="upload_ics"
                    type="file"
                    accept=".ics"
                    onChange={handleUploadIcs}
                    disabled={uploadingIcs}
                    className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 file:shadow-sm hover:file:bg-gray-50"
                  />
                </div>

                {holidayMsg && (
                  <p
                    className={`text-sm font-medium ${
                      holidayMsg.includes('Failed')
                        ? 'text-red-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {holidayMsg}
                  </p>
                )}
              </div>
            </div>

            {/* Bot Protection (Captcha) */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Bot Protection
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                Protects login and attendance forms from automated bots. The captcha runs when a parent responds to an event or a coach logs in.
              </p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="captcha_provider" className={labelClass}>
                    Captcha Provider
                  </label>
                  <select
                    id="captcha_provider"
                    value={settings.captcha_provider || 'altcha'}
                    onChange={(e) => update('captcha_provider', e.target.value)}
                    className={inputClass}
                  >
                    {CAPTCHA_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Provider info boxes */}
                {(settings.captcha_provider || 'altcha') === 'altcha' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-gray-700">
                    <p className="mb-2 font-semibold text-emerald-800">Altcha (Proof-of-Work)</p>
                    <ul className="list-inside list-disc space-y-1 text-gray-600">
                      <li><strong>How it works:</strong> The user&apos;s browser solves a small math puzzle in the background. Invisible to users, no clicking or image selection required.</li>
                      <li><strong>Privacy:</strong> Fully self-hosted. No data leaves your server. No cookies, no tracking. GDPR and WCAG 2.2 AA compliant.</li>
                      <li><strong>Cost:</strong> Free and open-source. No external account or API key needed.</li>
                      <li><strong>Strength:</strong> Good protection against simple bots. Determined attackers with significant compute power could brute-force the puzzle, but combined with rate limiting this is well mitigated.</li>
                      <li><strong>Best for:</strong> Clubs that want zero-cost, zero-config, privacy-first protection.</li>
                    </ul>
                  </div>
                )}

                {settings.captcha_provider === 'hcaptcha' && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
                    <p className="mb-2 font-semibold text-blue-800">hCaptcha</p>
                    <ul className="list-inside list-disc space-y-1 text-gray-600">
                      <li><strong>How it works:</strong> Users sometimes see a visual challenge (select images of bicycles, etc.). Invisible mode available but may still trigger challenges for suspicious requests.</li>
                      <li><strong>Privacy:</strong> More private than Google reCAPTCHA but still sends data to hCaptcha&apos;s servers. Sets cookies. GDPR compliant with their DPA.</li>
                      <li><strong>Cost:</strong> Free tier available (up to 1M verifications/month). Requires creating an account at hcaptcha.com and adding your site key and secret key.</li>
                      <li><strong>Strength:</strong> Stronger than proof-of-work. Uses machine learning to distinguish bots from humans. Harder to bypass programmatically.</li>
                      <li><strong>Best for:</strong> Clubs facing persistent, sophisticated bot attacks where proof-of-work alone is insufficient.</li>
                    </ul>
                    <p className="mt-3 text-xs text-blue-600">
                      Not yet implemented. Selecting this option saves the preference for when hCaptcha support is added.
                    </p>
                  </div>
                )}

                {settings.captcha_provider === 'friendly' && (
                  <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-gray-700">
                    <p className="mb-2 font-semibold text-purple-800">Friendly Captcha</p>
                    <ul className="list-inside list-disc space-y-1 text-gray-600">
                      <li><strong>How it works:</strong> Similar to Altcha, uses proof-of-work in the browser. Completely invisible to users. No visual challenges ever.</li>
                      <li><strong>Privacy:</strong> EU-based company, strong GDPR compliance. Can be self-hosted or use their cloud. No tracking cookies.</li>
                      <li><strong>Cost:</strong> Free tier for small sites (up to 1,000 requests/month). Paid plans start at ~35 EUR/month. Open-source self-hosted option available for free.</li>
                      <li><strong>Strength:</strong> Similar to Altcha but with additional server-side intelligence in cloud mode. Self-hosted mode is equivalent to Altcha.</li>
                      <li><strong>Best for:</strong> Clubs in the EU that want a middle ground between fully self-hosted and managed service, with professional support available.</li>
                    </ul>
                    <p className="mt-3 text-xs text-purple-600">
                      Not yet implemented. Selecting this option saves the preference for when Friendly Captcha support is added.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              {saveMsg && (
                <span
                  className={`text-sm font-medium ${
                    saveMsg.includes('Failed')
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {saveMsg}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
