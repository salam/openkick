'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getUserRole } from '@/lib/auth';
import ClubProfileForm from '@/components/settings/ClubProfileForm';
import SmtpForm from '@/components/settings/SmtpForm';
import LlmConfigForm from '@/components/settings/LlmConfigForm';
import WahaConfigForm from '@/components/settings/WahaConfigForm';

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
  const [importUrl, setImportUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [presets, setPresets] = useState<{ group: string; presets: { id: string; label: string }[] }[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [uploadingIcs, setUploadingIcs] = useState(false);
  const [holidayMsg, setHolidayMsg] = useState('');
  const [upcomingVacations, setUpcomingVacations] = useState<{ name: string; startDate: string; endDate: string }[]>([]);
  const [suggestion, setSuggestion] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');
  const [auditResult, setAuditResult] = useState<{
    timestamp: string;
    checks: { id: string; category: string; status: 'pass' | 'warn' | 'fail' | 'info'; message: string; detail?: string }[];
    summary: { pass: number; warn: number; fail: number; info: number };
  } | null>(null);
  const [runningAudit, setRunningAudit] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [users, setUsers] = useState<{ id: number; name: string; email: string; role: string; createdAt: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userMsg, setUserMsg] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [lastAdminInfoId, setLastAdminInfoId] = useState<number | null>(null);
  const [inviteRole, setInviteRole] = useState('coach');
  const [inviting, setInviting] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiFetch<SettingsMap>('/api/settings');
      setSettings(data);
      setOriginal(data);
    } catch {
      // settings not available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const currentRole = getUserRole();
  const isAdmin = currentRole === 'admin';

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetch<{ id: number; name: string; email: string; role: string; createdAt: string }[]>('/api/users');
      setUsers(data);
    } catch {
      // not available
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    apiFetch<{ groups: { group: string; presets: { id: string; label: string }[] }[]; selected: string }>('/api/vacations/presets')
      .then((data) => {
        setPresets(data.groups);
        if (data.selected) setSelectedPreset(data.selected);
        else if (data.groups[0]?.presets[0]) setSelectedPreset(data.groups[0].presets[0].id);
      })
      .catch(() => {});
  }, []);

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

  async function saveKeys(keys: string[]) {
    await Promise.all(
      keys.filter((k) => settings[k] !== original[k]).map((key) =>
        apiFetch(`/api/settings/${key}`, {
          method: 'PUT',
          body: JSON.stringify({ value: settings[key] || '' }),
        }),
      ),
    );
    setOriginal((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = settings[k]; });
      return next;
    });
  }

  async function handleSyncPreset() {
    if (!selectedPreset) return;
    setSyncing(true);
    setHolidayMsg('');
    try {
      const data = await apiFetch<{ synced: number; upcoming: { name: string; startDate: string; endDate: string }[] }>('/api/vacations/sync', {
        method: 'POST',
        body: JSON.stringify({ presetId: selectedPreset }),
      });
      setUpcomingVacations(data.upcoming || []);
      const summary = (data.upcoming || [])
        .map((v) => `${v.name} (${v.startDate} – ${v.endDate})`)
        .join(', ');
      setHolidayMsg(summary ? `Synced! Next: ${summary}` : 'Holidays synced successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setHolidayMsg(`Failed to sync holidays: ${msg}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setHolidayMsg(''), 5000);
    }
  }

  function handleSuggestSource() {
    if (!suggestion.trim()) return;
    const title = encodeURIComponent('Holiday source request');
    const body = encodeURIComponent(
      `**Requested region / source:**\n${suggestion}\n\n_Submitted from OpenKick settings_`,
    );
    window.open(
      `https://github.com/your-org/openkick/issues/new?title=${title}&body=${body}&labels=holiday-source`,
      '_blank',
    );
    setSuggestion('');
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

  async function handleLogoUpload(base64: string) {
    setUploadingLogo(true);
    setLogoMsg('');
    try {
      const res = await apiFetch<{ key: string; value: string }>(
        '/api/settings/upload-logo',
        {
          method: 'POST',
          body: JSON.stringify({ data: base64, filename: 'logo.jpg' }),
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
        checks: { id: string; category: string; status: 'pass' | 'warn' | 'fail' | 'info'; message: string; detail?: string }[];
        summary: { pass: number; warn: number; fail: number; info: number };
      }>('/api/security-audit');
      setAuditResult(result);
      setAuditExpanded(true);
    } catch {
      setAuditResult(null);
    } finally {
      setRunningAudit(false);
    }
  }

  async function handleRoleChange(userId: number, newRole: string) {
    try {
      await apiFetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
      setUserMsg('Role updated');
    } catch (err: unknown) {
      setUserMsg(err instanceof Error ? err.message : 'Failed to update role');
    }
    setTimeout(() => setUserMsg(''), 3000);
  }

  async function handleResetPassword(userId: number, email: string) {
    if (!confirm(`Send password reset email to ${email}?`)) return;
    try {
      await apiFetch(`/api/users/${userId}/reset-password`, { method: 'POST' });
      setUserMsg('Reset email sent');
    } catch {
      setUserMsg('Failed to send reset email');
    }
    setTimeout(() => setUserMsg(''), 3000);
  }

  async function handleInvite() {
    setInviting(true);
    try {
      const newUser = await apiFetch<{ id: number; name: string; email: string; role: string; createdAt: string }>('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole }),
      });
      setUsers((prev) => [...prev, { ...newUser, createdAt: new Date().toISOString() }]);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('coach');
      setShowInviteForm(false);
      setUserMsg('Invite sent');
    } catch (err: unknown) {
      setUserMsg(err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setInviting(false);
    }
    setTimeout(() => setUserMsg(''), 3000);
  }

  const hasChanges = SETTING_KEYS.some((k) => settings[k] !== original[k]);

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
  const inputClass =
    'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
  const btnSecondary =
    'rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50';

  return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          {hasChanges && !loading && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-amber-600">Unsaved changes!</span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Club Profile */}
            <ClubProfileForm
              settings={settings}
              onUpdate={update}
              onLogoUpload={handleLogoUpload}
              onLogoRemove={handleLogoRemove}
              uploadingLogo={uploadingLogo}
              logoMsg={logoMsg}
            />

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
                    {auditResult.summary.info > 0 && (
                      <span className="text-gray-500 font-medium">{auditResult.summary.info} skipped</span>
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
                      {(['fail', 'warn', 'pass', 'info'] as const).map(status =>
                        auditResult.checks
                          .filter(c => c.status === status)
                          .map(check => (
                            <div key={check.id} className={`rounded-md border px-3 py-2 text-sm ${
                              check.status === 'fail'
                                ? 'border-red-200 bg-red-50'
                                : check.status === 'warn'
                                  ? 'border-amber-200 bg-amber-50'
                                  : check.status === 'info'
                                    ? 'border-gray-200 bg-gray-50'
                                    : 'border-gray-100 bg-gray-50'
                            }`}>
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex-shrink-0">
                                  {check.status === 'pass' ? '✔' : check.status === 'warn' ? '⚠' : check.status === 'info' ? '—' : '✘'}
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
            <LlmConfigForm settings={settings} onUpdate={update} onSaveKeys={saveKeys} />

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
            <WahaConfigForm settings={settings} onUpdate={update} />

            {/* SMTP / Email Configuration */}
            <SmtpForm settings={settings} onUpdate={update} onSaveKeys={saveKeys} />

            {/* Holiday Sources */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Holiday Sources
              </h2>
              <div className="space-y-4">
                {/* Region Picker */}
                <div>
                  <label htmlFor="holiday_preset" className={labelClass}>
                    School holiday region
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="holiday_preset"
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className={inputClass}
                    >
                      {presets.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.presets.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={handleSyncPreset}
                      disabled={syncing || !selectedPreset}
                      className={btnSecondary + ' whitespace-nowrap'}
                    >
                      {syncing ? 'Syncing...' : 'Sync'}
                    </button>
                  </div>
                  {upcomingVacations.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {upcomingVacations.map((v) => (
                        <li key={v.startDate} className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-purple-400" />
                          <span className="font-medium">{v.name}</span>
                          <span className="text-gray-500">{v.startDate} &ndash; {v.endDate}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Manual Import */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Or import manually
                  </p>
                  <div className="space-y-3">
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
                  </div>
                </div>

                {/* Suggest a Source */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Missing your region?
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={suggestion}
                      onChange={(e) => setSuggestion(e.target.value)}
                      placeholder="Describe the region or paste a URL..."
                      className={inputClass}
                    />
                    <button
                      onClick={handleSuggestSource}
                      disabled={!suggestion.trim()}
                      className={btnSecondary + ' whitespace-nowrap'}
                    >
                      Suggest
                    </button>
                  </div>
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
                  { key: 'feeds_enabled', label: 'All Feeds (Master Toggle)', hint: 'Turns all public feeds on or off at once.' },
                  { key: 'feed_rss_enabled', label: 'RSS 2.0', hint: 'Standard feed format — parents can follow club news in any feed reader (Feedly, Apple News, etc.).' },
                  { key: 'feed_atom_enabled', label: 'Atom 1.0', hint: 'Modern feed format used by many apps and services to pull in your updates automatically.' },
                  { key: 'feed_ics_enabled', label: 'Calendar (ICS)', hint: 'Lets parents subscribe in Google Calendar, Apple Calendar, or Outlook so games and trainings appear automatically.' },
                  { key: 'feed_activitypub_enabled', label: 'ActivityPub (Mastodon)', hint: 'Publishes updates to the Fediverse — followers on Mastodon and compatible platforms see your posts.' },
                  { key: 'feed_atprotocol_enabled', label: 'AT Protocol (Bluesky)', hint: 'Publishes updates to Bluesky so followers there can stay up to date with the club.' },
                  { key: 'feed_sitemap_enabled', label: 'Include in Sitemap', hint: 'Helps Google and other search engines find and index your club pages — important for SEO and discoverability.' },
                ].map(({ key, label, hint }) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer">
                    <span className={`text-sm ${key === 'feeds_enabled' ? 'font-semibold' : ''} text-gray-700 flex items-center gap-1.5`}>
                      {label}
                      <span className="relative group">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-[10px] font-semibold text-gray-500 cursor-help leading-none hover:bg-gray-300 transition-colors" title={hint}>i</span>
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg text-left font-normal">
                          {hint}
                        </span>
                      </span>
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

            {/* Users */}
            <div className={cardClass}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Users</h2>
                <button
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  className={btnSecondary}
                >
                  {showInviteForm ? 'Cancel' : 'Invite User'}
                </button>
              </div>

              {showInviteForm && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className={inputClass} placeholder="Jane Doe" />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass} placeholder="jane@example.com" type="email" />
                  </div>
                  <div>
                    <label className={labelClass}>Role</label>
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className={inputClass}>
                      <option value="coach">Coach</option>
                      {isAdmin && <option value="admin">Admin</option>}
                    </select>
                  </div>
                  <button onClick={handleInvite} disabled={inviting || !inviteName.trim() || !inviteEmail.trim()} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50">
                    {inviting ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              )}

              {userMsg && (
                <p className={`mb-3 text-sm font-medium ${userMsg.includes('Failed') ? 'text-red-600' : 'text-emerald-600'}`}>
                  {userMsg}
                </p>
              )}

              {loadingUsers ? (
                <p className="text-sm text-gray-500">Loading users...</p>
              ) : users.length === 0 ? (
                <p className="text-sm text-gray-500">No coaches or admins found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        {isAdmin && <th className="pb-2 font-medium">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td className="py-2">{u.name || '\u2014'}</td>
                          <td className="py-2 text-gray-600">{u.email}</td>
                          <td className="py-2">
                            {isAdmin ? (() => {
                              const adminCount = users.filter((x) => x.role === 'admin').length;
                              const isOnlyAdmin = u.role === 'admin' && adminCount <= 1;
                              return (
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={u.role}
                                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                    disabled={isOnlyAdmin}
                                    className={`rounded border border-gray-300 px-2 py-1 text-sm ${isOnlyAdmin ? 'cursor-not-allowed opacity-50' : ''}`}
                                  >
                                    <option value="coach">Coach</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                  {isOnlyAdmin && (
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={() => setLastAdminInfoId(lastAdminInfoId === u.id ? null : u.id)}
                                        className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600"
                                        aria-label="Info"
                                      >
                                        i
                                      </button>
                                      {lastAdminInfoId === u.id && (
                                        <div className="absolute left-6 top-1/2 z-10 w-56 -translate-y-1/2 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg">
                                          There must always be at least one admin. Invite another admin first before changing this role.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })() : (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {u.role}
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="py-2">
                              <button
                                onClick={() => handleResetPassword(u.id, u.email)}
                                className="text-sm text-gray-500 underline hover:text-gray-700"
                              >
                                Reset Password
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
              {hasChanges && (
                <span className="text-sm font-medium text-amber-600">Unsaved changes!</span>
              )}
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
