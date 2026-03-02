'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { getUserRole } from '@/lib/auth';
import { t, getLanguage } from '@/lib/i18n';
import ClubProfileForm from '@/components/settings/ClubProfileForm';
import SmtpForm from '@/components/settings/SmtpForm';
import LlmConfigForm from '@/components/settings/LlmConfigForm';
import WahaConfigForm from '@/components/settings/WahaConfigForm';
import SeoSocialForm from '@/components/settings/SeoSocialForm';
import SecurityContactForm from '@/components/settings/SecurityContactForm';
import LegalPrivacyForm from '@/components/settings/LegalPrivacyForm';
import HomepageAppearanceCard from '@/components/settings/HomepageAppearanceCard';
import BotSettingsForm from '@/components/settings/BotSettingsForm';
import BotActivityLog from '@/components/settings/BotActivityLog';

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
  { value: 'altcha', labelKey: 'captcha_altcha_title' },
  { value: 'hcaptcha', labelKey: 'captcha_hcaptcha_title' },
  { value: 'friendly', labelKey: 'captcha_friendly_title' },
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
  'bot_allow_onboarding',
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
  'og_title', 'og_description', 'og_image',
  'twitter_title', 'twitter_description', 'twitter_handle',
  'meta_keywords',
  'security_contact_email', 'security_contact_url',
  'security_pgp_key_url', 'security_policy_url',
  'security_acknowledgments_url', 'security_preferred_languages',
  'security_canonical_url',
  'legal_org_name', 'legal_address', 'legal_email', 'legal_phone',
  'legal_responsible', 'dpo_name', 'dpo_email',
  'imprint_extra', 'privacy_extra',
  'tint_color', 'homepage_bg_image',
  'latitude', 'longitude',
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
  const [users, setUsers] = useState<{ id: number; name: string; email: string; phone?: string; role: string; createdAt: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userMsg, setUserMsg] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [lastAdminInfoId, setLastAdminInfoId] = useState<number | null>(null);
  const [inviteRole, setInviteRole] = useState('coach');
  const [inviting, setInviting] = useState(false);
  const [editingPhoneId, setEditingPhoneId] = useState<number | null>(null);
  const [editPhoneValue, setEditPhoneValue] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

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
      const data = await apiFetch<{ id: number; name: string; email: string; phone?: string; role: string; createdAt: string }[]>('/api/users');
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
      setSaveMsg(t('settings_saved'));
    } catch {
      setSaveMsg(t('failed_save_settings'));
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
      setHolidayMsg(summary ? `${t('holidays_synced_next')} ${summary}` : t('holidays_synced'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setHolidayMsg(`${t('holidays_sync_failed')}: ${msg}`);
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
      setHolidayMsg(t('holidays_imported_url'));
      setImportUrl('');
    } catch {
      setHolidayMsg(t('holidays_import_url_failed'));
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
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/vacations/import-ics`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      setHolidayMsg(t('ics_uploaded'));
    } catch {
      setHolidayMsg(t('ics_upload_failed'));
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
      setLogoMsg(t('logo_uploaded'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('413') || msg.toLowerCase().includes('too large')) {
        setLogoMsg(t('logo_too_large'));
      } else {
        setLogoMsg(msg ? `${t('failed_upload_logo')}: ${msg}` : t('failed_upload_logo'));
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
      setLogoMsg(t('logo_removed'));
    } catch {
      setLogoMsg(t('failed_remove_logo'));
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
      setUserMsg(t('role_updated'));
    } catch (err: unknown) {
      setUserMsg(err instanceof Error ? err.message : t('failed_update_role'));
    }
    setTimeout(() => setUserMsg(''), 3000);
  }

  async function handleResetPassword(userId: number, email: string) {
    if (!confirm(`${t('confirm_reset_email')} ${email}?`)) return;
    try {
      await apiFetch(`/api/users/${userId}/reset-password`, { method: 'POST' });
      setUserMsg(t('reset_email_sent'));
    } catch {
      setUserMsg(t('failed_send_reset'));
    }
    setTimeout(() => setUserMsg(''), 3000);
  }

  async function handleInvite() {
    setInviting(true);
    try {
      const newUser = await apiFetch<{ id: number; name: string; email: string; phone?: string; role: string; createdAt: string }>('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ name: inviteName, email: inviteEmail, phone: invitePhone || undefined, role: inviteRole }),
      });
      setUsers((prev) => [...prev, { ...newUser, createdAt: new Date().toISOString() }]);
      setInviteName('');
      setInviteEmail('');
      setInvitePhone('');
      setInviteRole('coach');
      setShowInviteForm(false);
      setUserMsg(t('invite_sent'));
    } catch (err: unknown) {
      setUserMsg(err instanceof Error ? err.message : t('failed_invite'));
    } finally {
      setInviting(false);
    }
    setTimeout(() => setUserMsg(''), 3000);
  }

  async function handleSavePhone(userId: number) {
    if (!editPhoneValue.trim()) return;
    setSavingPhone(true);
    try {
      const result = await apiFetch<{ id: number; phone: string }>(`/api/users/${userId}/phone`, {
        method: 'PUT',
        body: JSON.stringify({ phone: editPhoneValue }),
      });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, phone: result.phone } : u));
      setEditingPhoneId(null);
      setEditPhoneValue('');
      setUserMsg(t('phone_saved'));
    } catch (err: unknown) {
      setUserMsg(err instanceof Error ? err.message : t('phone_taken'));
    } finally {
      setSavingPhone(false);
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
    'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const btnSecondary =
    'rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50';

  // ── Section groups for sidebar nav ──────────────────────────────────
  const NAV_GROUPS = [
    { id: 'general', label: t('settings_general') },
    { id: 'integrations', label: t('settings_integrations') },
    { id: 'security', label: t('settings_security') },
    { id: 'content', label: t('settings_content') },
    { id: 'team', label: t('settings_team') },
  ] as const;

  const [activeSection, setActiveSection] = useState<string>('general');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll-spy via Intersection Observer
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const ids = NAV_GROUPS.map((g) => g.id);

    ids.forEach((id) => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function scrollTo(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      {/* ── Sticky header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 -mt-6 mb-6 border-b border-gray-200 bg-gray-50/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t('settings')}</h1>
          {hasChanges && !loading && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm font-medium text-amber-600 sm:inline">{t('unsaved_changes')}</span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-primary-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? t('saving') : t('save_settings')}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Mobile pill nav (< md) ───────────────────────────── */}
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {NAV_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => scrollTo(g.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  activeSection === g.id
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="mx-auto flex max-w-5xl gap-8">
            {/* ── Sidebar nav (md+) ──────────────────────────────── */}
            <nav className="hidden md:block md:w-44 lg:w-48 shrink-0">
              <div className="sticky top-24 space-y-1">
                {NAV_GROUPS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => scrollTo(g.id)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      activeSection === g.id
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </nav>

            {/* ── Main content ────────────────────────────────────── */}
            <div className="min-w-0 flex-1 space-y-10 pb-24">
              {/* ════ General ═══════════════════════════════════════ */}
              <section ref={(el) => { sectionRefs.current.general = el; }} id="general">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('settings_general')}</h2>
                <div className="space-y-6">
                  <ClubProfileForm
                    settings={settings}
                    onUpdate={update}
                    onLogoUpload={handleLogoUpload}
                    onLogoRemove={handleLogoRemove}
                    uploadingLogo={uploadingLogo}
                    logoMsg={logoMsg}
                  />
                  <HomepageAppearanceCard settings={settings} onUpdate={update} />

                  {/* Bot Language */}
                  <div className={cardClass}>
                    <h2 className="mb-4 text-lg font-semibold text-gray-900">
                      {t('bot_language')}
                    </h2>
                    <p className="mb-3 text-sm text-gray-500">
                      {t('bot_language_desc')}
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
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{lang.label}</span>
                        </label>
                      ))}
                    </div>

                    {settings.bot_language && BOT_PREVIEW_MESSAGES[settings.bot_language] && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                          {t('preview')}
                        </p>
                        <div className="mx-auto max-w-xs rounded-lg bg-[#e5ddd5] p-3 space-y-2"
                             style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M0 20h40M20 0v40\' fill=\'none\' stroke=\'%23d4ccc4\' stroke-width=\'.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill=\'url(%23p)\' width=\'200\' height=\'200\'/%3E%3C/svg%3E")' }}>
                          <div className="flex justify-end">
                            <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-1.5 shadow-sm">
                              <p className="text-sm text-gray-900">
                                {BOT_PREVIEW_MESSAGES[settings.bot_language].userMsg}
                              </p>
                              <p className="mt-0.5 text-right text-[10px] text-gray-500">09:14</p>
                            </div>
                          </div>
                          <div className="flex justify-start">
                            <div className="max-w-[80%] rounded-lg rounded-tl-none bg-white px-3 py-1.5 shadow-sm">
                              <p className="text-sm text-gray-900">
                                {BOT_PREVIEW_MESSAGES[settings.bot_language].botMsg}
                              </p>
                              <p className="mt-0.5 text-right text-[10px] text-gray-500">09:14</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* ════ Integrations ══════════════════════════════════ */}
              <section ref={(el) => { sectionRefs.current.integrations = el; }} id="integrations">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('settings_integrations')}</h2>
                <div className="space-y-6">
                  <LlmConfigForm settings={settings} onUpdate={update} onSaveKeys={saveKeys} />
                  <WahaConfigForm settings={settings} onUpdate={update} />
                  <BotSettingsForm settings={settings} onUpdate={update} onSaveKeys={saveKeys} />
                  <BotActivityLog />
                  <SmtpForm settings={settings} onUpdate={update} onSaveKeys={saveKeys} />

                  {/* Holiday Sources */}
                  <div id="holidays" className={cardClass}>
                    <h2 className="mb-4 text-lg font-semibold text-gray-900">
                      {t('holiday_sources')}
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="holiday_preset" className={labelClass}>
                          {t('school_holiday_region')}
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
                            {syncing ? t('syncing') : t('sync')}
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

                      <div className="border-t border-gray-200 pt-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('or_import_manually')}
                        </p>
                        <div className="space-y-3">
                          <div>
                            <label htmlFor="import_url" className={labelClass}>
                              {t('import_from_url')}
                            </label>
                            <div className="flex gap-2">
                              <input
                                id="import_url"
                                type="text"
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                placeholder={t('paste_url')}
                                className={inputClass}
                              />
                              <button
                                onClick={handleImportUrl}
                                disabled={importingUrl || !importUrl.trim()}
                                className={btnSecondary + ' whitespace-nowrap'}
                              >
                                {importingUrl ? t('importing') : t('import_btn')}
                              </button>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="upload_ics" className={labelClass}>
                              {t('upload_ics')}
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

                      <div className="border-t border-gray-200 pt-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('missing_region')}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={suggestion}
                            onChange={(e) => setSuggestion(e.target.value)}
                            placeholder={t('describe_region')}
                            className={inputClass}
                          />
                          <button
                            onClick={handleSuggestSource}
                            disabled={!suggestion.trim()}
                            className={btnSecondary + ' whitespace-nowrap'}
                          >
                            {t('suggest')}
                          </button>
                        </div>
                      </div>

                      {holidayMsg && (
                        <p
                          className={`text-sm font-medium ${
                            holidayMsg.includes('Failed')
                              ? 'text-red-600'
                              : 'text-primary-600'
                          }`}
                        >
                          {holidayMsg}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* ════ Security ══════════════════════════════════════ */}
              <section ref={(el) => { sectionRefs.current.security = el; }} id="security">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('settings_security')}</h2>
                <div className="space-y-6">
                  {/* Security Audit */}
                  <div className={cardClass}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-gray-900">{t('security_audit')}</h2>
                        {auditResult && (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            auditResult.summary.fail > 0
                              ? 'bg-red-100 text-red-700'
                              : auditResult.summary.warn > 0
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-primary-100 text-primary-700'
                          }`}>
                            {auditResult.summary.fail > 0
                              ? `${auditResult.summary.fail} ${t('issues')}`
                              : auditResult.summary.warn > 0
                                ? `${auditResult.summary.warn} ${t('warnings')}`
                                : t('all_clear')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={handleRunAudit}
                        disabled={runningAudit}
                        className={btnSecondary}
                      >
                        {runningAudit ? t('running') : auditResult ? t('rerun_audit') : t('run_audit')}
                      </button>
                    </div>
                    <p className="mb-3 text-sm text-gray-500">
                      {t('security_audit_desc')}
                    </p>

                    {auditResult && (
                      <>
                        <div className="mb-3 flex items-center gap-4 text-sm">
                          <span className="text-primary-600 font-medium">{auditResult.summary.pass} {t('passed')}</span>
                          {auditResult.summary.warn > 0 && (
                            <span className="text-amber-600 font-medium">{auditResult.summary.warn} {t('warnings')}</span>
                          )}
                          {auditResult.summary.fail > 0 && (
                            <span className="text-red-600 font-medium">{auditResult.summary.fail} {t('failed')}</span>
                          )}
                          {auditResult.summary.info > 0 && (
                            <span className="text-gray-500 font-medium">{auditResult.summary.info} {t('skipped')}</span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setAuditExpanded(!auditExpanded)}
                          className="text-xs text-gray-500 hover:text-gray-700 mb-2"
                        >
                          {auditExpanded ? `▾ ${t('hide_details')}` : `▸ ${t('show_details')}`}
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
                          {t('last_run')}: {new Date(auditResult.timestamp).toLocaleString()}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Bot Protection (Captcha) */}
                  <div className={cardClass}>
                    <h2 className="mb-4 text-lg font-semibold text-gray-900">
                      {t('bot_protection')}
                    </h2>
                    <p className="mb-4 text-sm text-gray-500">
                      {t('captcha_desc')}
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="captcha_provider" className={labelClass}>
                          {t('captcha_provider_label')}
                        </label>
                        <select
                          id="captcha_provider"
                          value={settings.captcha_provider || 'altcha'}
                          onChange={(e) => update('captcha_provider', e.target.value)}
                          className={inputClass}
                        >
                          {CAPTCHA_PROVIDERS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {t(p.labelKey)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(settings.captcha_provider || 'altcha') === 'altcha' && (
                        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-gray-700">
                          <p className="mb-2 font-semibold text-primary-800">{t('captcha_altcha_title')}</p>
                          <ul className="list-inside list-disc space-y-1 text-gray-600">
                            <li><strong>{t('captcha_how_it_works')}</strong> {t('captcha_altcha_how')}</li>
                            <li><strong>{t('captcha_privacy')}</strong> {t('captcha_altcha_privacy')}</li>
                            <li><strong>{t('captcha_cost')}</strong> {t('captcha_altcha_cost')}</li>
                            <li><strong>{t('captcha_strength')}</strong> {t('captcha_altcha_strength')}</li>
                            <li><strong>{t('captcha_best_for')}</strong> {t('captcha_altcha_best')}</li>
                          </ul>
                        </div>
                      )}

                      {settings.captcha_provider === 'hcaptcha' && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
                          <p className="mb-2 font-semibold text-blue-800">{t('captcha_hcaptcha_title')}</p>
                          <ul className="list-inside list-disc space-y-1 text-gray-600">
                            <li><strong>{t('captcha_how_it_works')}</strong> {t('captcha_hcaptcha_how')}</li>
                            <li><strong>{t('captcha_privacy')}</strong> {t('captcha_hcaptcha_privacy')}</li>
                            <li><strong>{t('captcha_cost')}</strong> {t('captcha_hcaptcha_cost')}</li>
                            <li><strong>{t('captcha_strength')}</strong> {t('captcha_hcaptcha_strength')}</li>
                            <li><strong>{t('captcha_best_for')}</strong> {t('captcha_hcaptcha_best')}</li>
                          </ul>
                          <p className="mt-3 text-xs text-blue-600">
                            {t('captcha_hcaptcha_not_impl')}
                          </p>
                        </div>
                      )}

                      {settings.captcha_provider === 'friendly' && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-gray-700">
                          <p className="mb-2 font-semibold text-purple-800">{t('captcha_friendly_title')}</p>
                          <ul className="list-inside list-disc space-y-1 text-gray-600">
                            <li><strong>{t('captcha_how_it_works')}</strong> {t('captcha_friendly_how')}</li>
                            <li><strong>{t('captcha_privacy')}</strong> {t('captcha_friendly_privacy')}</li>
                            <li><strong>{t('captcha_cost')}</strong> {t('captcha_friendly_cost')}</li>
                            <li><strong>{t('captcha_strength')}</strong> {t('captcha_friendly_strength')}</li>
                            <li><strong>{t('captcha_best_for')}</strong> {t('captcha_friendly_best')}</li>
                          </ul>
                          <p className="mt-3 text-xs text-purple-600">
                            {t('captcha_friendly_not_impl')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <SecurityContactForm settings={settings} onUpdate={update} />
                </div>
              </section>

              {/* ════ Content ═══════════════════════════════════════ */}
              <section ref={(el) => { sectionRefs.current.content = el; }} id="content">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('settings_content')}</h2>
                <div className="space-y-6">
                  {/* Public Feeds */}
                  <div id="feeds" className={cardClass}>
                    <h2 className="mb-4 text-lg font-semibold text-gray-900">
                      {t('public_feeds')}
                    </h2>
                    <p className="mb-3 text-sm text-gray-500">
                      {t('feeds_desc')}
                    </p>
                    <div className="space-y-3">
                      {[
                        { key: 'feeds_enabled', label: t('all_feeds_master'), hint: t('all_feeds_master_hint') },
                        { key: 'feed_rss_enabled', label: t('feed_rss'), hint: t('feed_rss_hint') },
                        { key: 'feed_atom_enabled', label: t('feed_atom'), hint: t('feed_atom_hint') },
                        { key: 'feed_ics_enabled', label: t('feed_ics'), hint: t('feed_ics_hint') },
                        { key: 'feed_activitypub_enabled', label: t('feed_activitypub'), hint: t('feed_activitypub_hint') },
                        { key: 'feed_atprotocol_enabled', label: t('feed_atprotocol'), hint: t('feed_atprotocol_hint') },
                        { key: 'feed_sitemap_enabled', label: t('feed_sitemap'), hint: t('feed_sitemap_hint') },
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
                              settings[key] === 'false' ? 'bg-gray-300' : 'bg-primary-500'
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

                  <SeoSocialForm settings={settings} onUpdate={update} />
                  <LegalPrivacyForm settings={settings} onUpdate={update} />
                </div>
              </section>

              {/* ════ Team ══════════════════════════════════════════ */}
              <section ref={(el) => { sectionRefs.current.team = el; }} id="team">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('settings_team')}</h2>
                <div className="space-y-6">
                  <div className={cardClass}>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-gray-900">{t('users')}</h2>
                      <button
                        onClick={() => setShowInviteForm(!showInviteForm)}
                        className={btnSecondary}
                      >
                        {showInviteForm ? t('cancel') : t('invite_user')}
                      </button>
                    </div>

                    {showInviteForm && (
                      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <div>
                          <label className={labelClass}>{t('name')}</label>
                          <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className={inputClass} placeholder="Jane Doe" />
                        </div>
                        <div>
                          <label className={labelClass}>{t('email')}</label>
                          <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass} placeholder="jane@example.com" type="email" />
                        </div>
                        <div>
                          <label className={labelClass}>{t('phone')} ({t('optional')})</label>
                          <input value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} className={inputClass} placeholder="+41 79 123 45 67" type="tel" />
                        </div>
                        <div>
                          <label className={labelClass}>{t('role')}</label>
                          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className={inputClass}>
                            <option value="coach">{t('coach')}</option>
                            {isAdmin && <option value="admin">{t('admin')}</option>}
                          </select>
                        </div>
                        <button onClick={handleInvite} disabled={inviting || !inviteName.trim() || !inviteEmail.trim()} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50">
                          {inviting ? t('sending') : t('send_invite')}
                        </button>
                      </div>
                    )}

                    {userMsg && (
                      <p className={`mb-3 text-sm font-medium ${userMsg.includes('Failed') ? 'text-red-600' : 'text-primary-600'}`}>
                        {userMsg}
                      </p>
                    )}

                    {loadingUsers ? (
                      <p className="text-sm text-gray-500">{t('loading_users')}</p>
                    ) : users.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('no_users')}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="pb-2 font-medium">{t('name')}</th>
                              <th className="pb-2 font-medium">{t('email')}</th>
                              <th className="pb-2 font-medium">{t('phone')}</th>
                              <th className="pb-2 font-medium">{t('role')}</th>
                              {isAdmin && <th className="pb-2 font-medium">{t('actions')}</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {users.map((u) => (
                              <tr key={u.id}>
                                <td className="py-2">{u.name || '\u2014'}</td>
                                <td className="py-2 text-gray-600">{u.email}</td>
                                <td className="py-2 text-gray-600">
                                  {editingPhoneId === u.id ? (
                                    <div className="flex gap-1">
                                      <input
                                        type="tel"
                                        value={editPhoneValue}
                                        onChange={(e) => setEditPhoneValue(e.target.value)}
                                        placeholder="+41 79 123 45 67"
                                        className="w-36 rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
                                        onKeyDown={(e) => e.key === 'Enter' && handleSavePhone(u.id)}
                                      />
                                      <button
                                        onClick={() => handleSavePhone(u.id)}
                                        disabled={savingPhone || !editPhoneValue.trim()}
                                        className="rounded bg-primary-500 px-2 py-1 text-xs text-white hover:bg-primary-600 disabled:opacity-50"
                                      >
                                        {savingPhone ? '...' : t('save')}
                                      </button>
                                      <button
                                        onClick={() => setEditingPhoneId(null)}
                                        className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                                      >
                                        x
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      className={`inline-flex cursor-pointer items-center gap-1 hover:text-primary-600 ${u.phone ? '' : 'text-gray-400 italic'}`}
                                      onClick={() => { setEditingPhoneId(u.id); setEditPhoneValue(u.phone || ''); }}
                                      title={t('edit_phone')}
                                    >
                                      {u.phone || t('edit_phone')}
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-gray-400">
                                        <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.05 10.476a.75.75 0 0 0-.188.335l-.758 2.86a.75.75 0 0 0 .918.918l2.86-.758a.75.75 0 0 0 .335-.188l7.963-7.963a1.75 1.75 0 0 0 0-2.475l-.692-.692ZM11.72 3.22a.25.25 0 0 1 .354 0l.692.692a.25.25 0 0 1 0 .354L5.95 11.08l-1.59.422.422-1.59 6.938-6.692Z" />
                                      </svg>
                                    </span>
                                  )}
                                </td>
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
                                          <option value="coach">{t('coach')}</option>
                                          <option value="admin">{t('admin')}</option>
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
                                                {t('last_admin_warning')}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })() : (
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-primary-100 text-primary-700'}`}>
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
                                      {t('reset_password_btn')}
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
                </div>
              </section>
            </div>
          </div>

          {/* ── Floating save bar ─────────────────────────────────── */}
          {hasChanges && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
              <div className="mx-auto flex max-w-5xl items-center justify-between">
                <span className="text-sm font-medium text-amber-600">{t('unsaved_changes')}</span>
                <div className="flex items-center gap-3">
                  {saveMsg && (
                    <span
                      className={`text-sm font-medium ${
                        saveMsg.includes('Failed')
                          ? 'text-red-600'
                          : 'text-primary-600'
                      }`}
                    >
                      {saveMsg}
                    </span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saving ? t('saving') : t('save_settings')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
