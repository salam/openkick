'use client';

import { useEffect, useState, useCallback } from 'react';
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

interface ModelOption {
  id: string;
  label: string;
  pricing: string;
  tier: 'latest' | 'budget' | 'more';
}

const MODEL_SUGGESTIONS: Record<string, ModelOption[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', pricing: '$2.50 / $10', tier: 'latest' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', pricing: '$0.15 / $0.60', tier: 'budget' },
    { id: 'gpt-5', label: 'GPT-5', pricing: '$1.25 / $10', tier: 'more' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', pricing: '$0.30 / $1.10', tier: 'more' },
    { id: 'o3-mini', label: 'o3-mini', pricing: '$1.10 / $4.40', tier: 'more' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6-20260220', label: 'Claude Sonnet 4.6', pricing: '$3 / $15', tier: 'latest' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', pricing: '$1 / $5', tier: 'budget' },
    { id: 'claude-opus-4-6-20260220', label: 'Claude Opus 4.6', pricing: '$15 / $75', tier: 'more' },
    { id: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5', pricing: '$3 / $15', tier: 'more' },
  ],
  euria: [
    { id: 'euria', label: 'Euria', pricing: 'Included', tier: 'latest' },
  ],
};

const PROVIDER_DASHBOARD_LINKS: Record<string, { url: string; label: string }> = {
  openai: { url: 'https://platform.openai.com/api-keys', label: 'OpenAI Dashboard' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys', label: 'Anthropic Console' },
  euria: { url: 'https://manager.infomaniak.com', label: 'Infomaniak Manager' },
};

const BOT_LANGUAGES = [
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Francais' },
  { value: 'en', label: 'English' },
];

const BOT_PREVIEW_MESSAGES: Record<string, { userMsg: string; botMsg: string }> = {
  de: { userMsg: 'Frida kommt diese Woche', botMsg: '✔︎ Frida, Mi 26. Feb, 14:00' },
  fr: { userMsg: 'Frida vient cette semaine', botMsg: '✔︎ Frida, mer 26 fév, 14:00' },
  en: { userMsg: 'Frida is coming this week', botMsg: '✔︎ Frida, Wed Feb 26, 2:00 PM' },
};

const CAPTCHA_PROVIDERS = [
  { value: 'altcha', label: 'Altcha (Proof-of-Work)' },
  { value: 'hcaptcha', label: 'hCaptcha' },
  { value: 'friendly', label: 'Friendly Captcha' },
];

const SETTING_KEYS = [
  'club_name',
  'club_description',
  'contact_info',
  'club_logo',
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
  'feeds_enabled',
  'feed_rss_enabled',
  'feed_atom_enabled',
  'feed_activitypub_enabled',
  'feed_atprotocol_enabled',
  'feed_ics_enabled',
  'feed_sitemap_enabled',
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
  const [showMoreModels, setShowMoreModels] = useState(false);
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');
  const [auditResult, setAuditResult] = useState<{
    timestamp: string;
    checks: { id: string; category: string; status: 'pass' | 'warn' | 'fail'; message: string; detail?: string }[];
    summary: { pass: number; warn: number; fail: number };
  } | null>(null);
  const [runningAudit, setRunningAudit] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);

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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoMsg('');
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ key: string; value: string }>(
        '/api/settings/upload-logo',
        {
          method: 'POST',
          body: JSON.stringify({ data: base64, filename: file.name }),
        },
      );
      update('club_logo', res.value);
      setOriginal((prev) => ({ ...prev, club_logo: res.value }));
      setLogoMsg('Logo uploaded successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('413') || msg.toLowerCase().includes('too large')) {
        setLogoMsg('Logo too large. Please choose a smaller file.');
      } else {
        setLogoMsg(msg ? `Failed to upload logo: ${msg}` : 'Failed to upload logo.');
      }
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
      setTimeout(() => setLogoMsg(''), 5000);
    }
  }

  async function handleLogoRemove() {
    setUploadingLogo(true);
    setLogoMsg('');
    try {
      await apiFetch('/api/settings/remove-logo', { method: 'DELETE' });
      update('club_logo', '');
      setOriginal((prev) => ({ ...prev, club_logo: '' }));
      setLogoMsg('Logo removed.');
    } catch {
      setLogoMsg('Failed to remove logo.');
    } finally {
      setUploadingLogo(false);
      setTimeout(() => setLogoMsg(''), 3000);
    }
  }

  async function handleRunAudit() {
    setRunningAudit(true);
    try {
      const result = await apiFetch<{
        timestamp: string;
        checks: { id: string; category: string; status: 'pass' | 'warn' | 'fail'; message: string; detail?: string }[];
        summary: { pass: number; warn: number; fail: number };
      }>('/api/security-audit');
      setAuditResult(result);
      setAuditExpanded(true);
    } catch {
      setAuditResult(null);
    } finally {
      setRunningAudit(false);
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
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Club Profile */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Club Profile
              </h2>
              <p className="mb-3 text-sm text-gray-500">
                Public information shown on your club page, llms.txt, and feeds.
              </p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="club_name" className={labelClass}>
                    Club Name
                  </label>
                  <input
                    id="club_name"
                    type="text"
                    value={settings.club_name || ''}
                    onChange={(e) => update('club_name', e.target.value)}
                    placeholder="FC My Club"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="club_description" className={labelClass}>
                    Description
                  </label>
                  <textarea
                    id="club_description"
                    value={settings.club_description || ''}
                    onChange={(e) => update('club_description', e.target.value)}
                    placeholder="A short description of your club..."
                    rows={3}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="contact_info" className={labelClass}>
                    Contact Info
                  </label>
                  <input
                    id="contact_info"
                    type="text"
                    value={settings.contact_info || ''}
                    onChange={(e) => update('contact_info', e.target.value)}
                    placeholder="info@yourclub.ch or a URL"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Club Logo</label>
                  <div className="flex items-center gap-4">
                    {settings.club_logo && (
                      <div className="relative">
                        <img
                          src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${settings.club_logo}`}
                          alt="Club logo"
                          className="h-16 w-16 rounded-lg border border-gray-200 object-contain bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleLogoRemove}
                          disabled={uploadingLogo}
                          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs leading-none shadow hover:bg-red-600 disabled:opacity-50"
                          title="Remove logo"
                        >
                          &times;
                        </button>
                      </div>
                    )}
                    <div>
                      <input
                        id="upload_logo"
                        type="file"
                        accept=".png,.jpg,.jpeg,.gif,.svg,.webp"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 file:shadow-sm hover:file:bg-gray-50"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        PNG, JPG, SVG, or WebP. Max 2 MB.
                      </p>
                    </div>
                  </div>
                  {logoMsg && (
                    <p
                      className={`mt-2 text-sm font-medium ${
                        logoMsg.includes('Failed') ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {logoMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Security Audit */}
            <div className={cardClass}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">Security Audit</h2>
                  {auditResult && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      auditResult.summary.fail > 0
                        ? 'bg-red-100 text-red-700'
                        : auditResult.summary.warn > 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {auditResult.summary.fail > 0
                        ? `${auditResult.summary.fail} issue${auditResult.summary.fail > 1 ? 's' : ''}`
                        : auditResult.summary.warn > 0
                          ? `${auditResult.summary.warn} warning${auditResult.summary.warn > 1 ? 's' : ''}`
                          : 'All clear'}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleRunAudit}
                  disabled={runningAudit}
                  className={btnSecondary}
                >
                  {runningAudit ? 'Running...' : auditResult ? 'Re-run Audit' : 'Run Audit'}
                </button>
              </div>
              <p className="mb-3 text-sm text-gray-500">
                Checks file permissions, database exposure, CORS, admin passwords, and more.
              </p>

              {auditResult && (
                <>
                  <div className="mb-3 flex items-center gap-4 text-sm">
                    <span className="text-emerald-600 font-medium">{auditResult.summary.pass} passed</span>
                    {auditResult.summary.warn > 0 && (
                      <span className="text-amber-600 font-medium">{auditResult.summary.warn} warning{auditResult.summary.warn > 1 ? 's' : ''}</span>
                    )}
                    {auditResult.summary.fail > 0 && (
                      <span className="text-red-600 font-medium">{auditResult.summary.fail} failed</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAuditExpanded(!auditExpanded)}
                    className="text-xs text-gray-500 hover:text-gray-700 mb-2"
                  >
                    {auditExpanded ? '▾ Hide details' : '▸ Show details'}
                  </button>

                  {auditExpanded && (
                    <div className="space-y-2">
                      {(['fail', 'warn', 'pass'] as const).map(status =>
                        auditResult.checks
                          .filter(c => c.status === status)
                          .map(check => (
                            <div key={check.id} className={`rounded-md border px-3 py-2 text-sm ${
                              check.status === 'fail'
                                ? 'border-red-200 bg-red-50'
                                : check.status === 'warn'
                                  ? 'border-amber-200 bg-amber-50'
                                  : 'border-gray-100 bg-gray-50'
                            }`}>
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex-shrink-0">
                                  {check.status === 'pass' ? '✔' : check.status === 'warn' ? '⚠' : '✘'}
                                </span>
                                <div>
                                  <p className={`font-medium ${
                                    check.status === 'fail' ? 'text-red-800' : check.status === 'warn' ? 'text-amber-800' : 'text-gray-700'
                                  }`}>
                                    {check.message}
                                  </p>
                                  {check.detail && (
                                    <p className="mt-0.5 text-xs text-gray-500">{check.detail}</p>
                                  )}
                                  <p className="mt-0.5 text-xs text-gray-400">{check.category}</p>
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )}

                  <p className="mt-3 text-xs text-gray-400">
                    Last run: {new Date(auditResult.timestamp).toLocaleString()}
                  </p>
                </>
              )}
            </div>

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
                  {(() => {
                    const provider = settings.llm_provider || '';
                    const models = MODEL_SUGGESTIONS[provider] || [];
                    const primaryModels = models.filter((m) => m.tier !== 'more');
                    const moreModels = models.filter((m) => m.tier === 'more');
                    const currentValue = settings.llm_model || '';
                    const isKnownModel = models.some((m) => m.id === currentValue);

                    if (!provider || useCustomModel) {
                      return (
                        <div className="space-y-1">
                          <input
                            id="llm_model"
                            type="text"
                            value={currentValue}
                            onChange={(e) => update('llm_model', e.target.value)}
                            placeholder="e.g. gpt-4o-mini, claude-sonnet-4-6-20260220"
                            className={inputClass}
                          />
                          {provider && (
                            <button
                              type="button"
                              onClick={() => setUseCustomModel(false)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              ← Back to suggested models
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          {primaryModels.map((m) => (
                            <label
                              key={m.id}
                              className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                                currentValue === m.id
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="llm_model"
                                  value={m.id}
                                  checked={currentValue === m.id}
                                  onChange={() => update('llm_model', m.id)}
                                  className="text-blue-600"
                                />
                                <span className="text-sm font-medium text-gray-900">
                                  {m.label}
                                </span>
                                {m.tier === 'latest' && (
                                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 uppercase">
                                    Latest
                                  </span>
                                )}
                                {m.tier === 'budget' && (
                                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 uppercase">
                                    Budget
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {m.pricing} /M tokens
                              </span>
                            </label>
                          ))}
                        </div>

                        {moreModels.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setShowMoreModels(!showMoreModels)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              {showMoreModels ? '▾ Hide more models' : '▸ More models...'}
                            </button>
                            {showMoreModels && (
                              <div className="mt-1 space-y-1">
                                {moreModels.map((m) => (
                                  <label
                                    key={m.id}
                                    className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                                      currentValue === m.id
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        name="llm_model"
                                        value={m.id}
                                        checked={currentValue === m.id}
                                        onChange={() => update('llm_model', m.id)}
                                        className="text-blue-600"
                                      />
                                      <span className="text-sm text-gray-700">
                                        {m.label}
                                      </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {m.pricing} /M tokens
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setUseCustomModel(true)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Enter custom model ID...
                        </button>

                        {!isKnownModel && currentValue && (
                          <p className="text-xs text-amber-600">
                            Custom model: {currentValue}
                          </p>
                        )}
                      </div>
                    );
                  })()}
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
                  {settings.llm_provider && PROVIDER_DASHBOARD_LINKS[settings.llm_provider] && (
                    <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                      <p className="text-xs text-blue-800">
                        Get your API key from the{' '}
                        <a
                          href={PROVIDER_DASHBOARD_LINKS[settings.llm_provider].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline hover:text-blue-900"
                        >
                          {PROVIDER_DASHBOARD_LINKS[settings.llm_provider].label} →
                        </a>
                      </p>
                    </div>
                  )}
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

              {/* WhatsApp-style preview */}
              {settings.bot_language && BOT_PREVIEW_MESSAGES[settings.bot_language] && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Preview
                  </p>
                  <div className="mx-auto max-w-xs rounded-lg bg-[#e5ddd5] p-3 space-y-2"
                       style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M0 20h40M20 0v40\' fill=\'none\' stroke=\'%23d4ccc4\' stroke-width=\'.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill=\'url(%23p)\' width=\'200\' height=\'200\'/%3E%3C/svg%3E")' }}>
                    {/* User message (right-aligned, green bubble) */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-1.5 shadow-sm">
                        <p className="text-sm text-gray-900">
                          {BOT_PREVIEW_MESSAGES[settings.bot_language].userMsg}
                        </p>
                        <p className="mt-0.5 text-right text-[10px] text-gray-500">
                          09:14
                        </p>
                      </div>
                    </div>
                    {/* Bot response (left-aligned, white bubble) */}
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg rounded-tl-none bg-white px-3 py-1.5 shadow-sm">
                        <p className="text-sm text-gray-900">
                          {BOT_PREVIEW_MESSAGES[settings.bot_language].botMsg}
                        </p>
                        <p className="mt-0.5 text-right text-[10px] text-gray-500">
                          09:14
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* WAHA Configuration */}
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
                    WAHA Quick Start guide →
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

            {/* Public Feeds */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Public Feeds
              </h2>
              <p className="mb-3 text-sm text-gray-500">
                Control which public feeds are available. Disabling the master toggle turns off all feeds.
              </p>
              <div className="space-y-3">
                {[
                  { key: 'feeds_enabled', label: 'All Feeds (Master Toggle)' },
                  { key: 'feed_rss_enabled', label: 'RSS 2.0' },
                  { key: 'feed_atom_enabled', label: 'Atom 1.0' },
                  { key: 'feed_ics_enabled', label: 'Calendar (ICS)' },
                  { key: 'feed_activitypub_enabled', label: 'ActivityPub (Mastodon)' },
                  { key: 'feed_atprotocol_enabled', label: 'AT Protocol (Bluesky)' },
                  { key: 'feed_sitemap_enabled', label: 'Include in Sitemap' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer">
                    <span className={`text-sm ${key === 'feeds_enabled' ? 'font-semibold' : ''} text-gray-700`}>
                      {label}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings[key] !== 'false'}
                      onClick={() => update(key, settings[key] === 'false' ? 'true' : 'false')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings[key] === 'false' ? 'bg-gray-300' : 'bg-emerald-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings[key] === 'false' ? 'translate-x-1' : 'translate-x-6'
                        }`}
                      />
                    </button>
                  </label>
                ))}
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
  );
}
