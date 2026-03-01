'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

interface ProviderConfig {
  id: string;
  enabled: boolean;
  testMode: boolean;
  config: Record<string, string>;
}

interface UseCaseConfig {
  id: string;
  enabled: boolean;
  provider: string | null;
  currency: string;
}

interface SettingsData {
  providers: ProviderConfig[];
  useCases: UseCaseConfig[];
}

const PROVIDER_FIELDS: Record<string, { key: string; label: string; secret?: boolean }[]> = {
  stripe: [
    { key: 'testSecretKey', label: 'Test Secret Key', secret: true },
    { key: 'testWebhookSecret', label: 'Test Webhook Secret', secret: true },
    { key: 'liveSecretKey', label: 'Live Secret Key', secret: true },
    { key: 'liveWebhookSecret', label: 'Live Webhook Secret', secret: true },
  ],
  datatrans: [
    { key: 'merchantId', label: 'Merchant ID' },
    { key: 'testApiPassword', label: 'Test API Password', secret: true },
    { key: 'liveApiPassword', label: 'Live API Password', secret: true },
    { key: 'hmacKey', label: 'HMAC Key', secret: true },
  ],
};

const PROVIDER_NAMES: Record<string, string> = {
  stripe: 'Stripe',
  datatrans: 'Datatrans',
};

const PROVIDER_HELP: Record<string, { steps: { i18nKey: string; url?: string }[] }> = {
  stripe: {
    steps: [
      { i18nKey: 'payments_help_stripe_signup', url: 'https://dashboard.stripe.com/register' },
      { i18nKey: 'payments_help_stripe_keys', url: 'https://dashboard.stripe.com/apikeys' },
      { i18nKey: 'payments_help_stripe_webhooks', url: 'https://dashboard.stripe.com/webhooks' },
      { i18nKey: 'payments_help_stripe_twint' },
    ],
  },
  datatrans: {
    steps: [
      { i18nKey: 'payments_help_datatrans_signup', url: 'https://www.datatrans.ch/en/contact' },
      { i18nKey: 'payments_help_datatrans_admin', url: 'https://admin.sandbox.datatrans.com' },
      { i18nKey: 'payments_help_datatrans_keys' },
      { i18nKey: 'payments_help_datatrans_twint' },
    ],
  },
};

const USE_CASE_LABELS: Record<string, string> = {
  tournament_fee: 'payments_tournament_fee',
  survey_order: 'payments_merchandise',
  donation: 'payments_donation',
};

export default function PaymentSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Re-render on language change
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    apiFetch<SettingsData>('/api/admin/payments/settings')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  function updateProvider(id: string, updates: Partial<ProviderConfig>) {
    if (!data) return;
    setData({
      ...data,
      providers: data.providers.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
  }

  function updateProviderConfig(id: string, key: string, value: string) {
    if (!data) return;
    setData({
      ...data,
      providers: data.providers.map((p) =>
        p.id === id ? { ...p, config: { ...p.config, [key]: value } } : p
      ),
    });
  }

  function updateUseCase(id: string, updates: Partial<UseCaseConfig>) {
    if (!data) return;
    setData({
      ...data,
      useCases: data.useCases.map((uc) =>
        uc.id === id ? { ...uc, ...updates } : uc
      ),
    });
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await apiFetch('/api/admin/payments/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!data) return <p className="text-red-600">Failed to load payment settings.</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('payments_settings')}</h1>
        <Link
          href="/dashboard/payments/"
          className="text-sm text-emerald-600 hover:text-emerald-800"
        >
          &larr; {t('payments_title')}
        </Link>
      </div>

      {/* Providers */}
      <h2 className="mb-3 text-lg font-semibold text-gray-800">{t('payments_provider')}</h2>
      <div className="space-y-6 mb-8">
        {data.providers.map((prov) => (
          <div key={prov.id} className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-medium text-gray-900">{PROVIDER_NAMES[prov.id] || prov.id}</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={prov.enabled}
                    onChange={(e) => updateProvider(prov.id, { enabled: e.target.checked })}
                    className="rounded border-gray-300 text-emerald-600"
                  />
                  {t('payments_enabled')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={prov.testMode}
                    onChange={(e) => updateProvider(prov.id, { testMode: e.target.checked })}
                    className="rounded border-gray-300 text-emerald-600"
                  />
                  {t('payments_test_mode')}
                </label>
              </div>
            </div>

            {prov.enabled && PROVIDER_HELP[prov.id] && (
              <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3">
                <p className="mb-2 text-xs font-semibold text-blue-800">{t('payments_help_title')}</p>
                <ol className="list-inside list-decimal space-y-1 text-xs text-blue-700">
                  {PROVIDER_HELP[prov.id].steps.map((step) => (
                    <li key={step.i18nKey}>
                      {step.url ? (
                        <a href={step.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
                          {t(step.i18nKey)}
                        </a>
                      ) : (
                        t(step.i18nKey)
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {prov.enabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                {(PROVIDER_FIELDS[prov.id] || []).map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs font-medium text-gray-500">{field.label}</label>
                    <input
                      type={field.secret ? 'password' : 'text'}
                      value={prov.config[field.key] || ''}
                      onChange={(e) => updateProviderConfig(prov.id, field.key, e.target.value)}
                      placeholder={field.secret ? '••••••••' : ''}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Use Cases */}
      <h2 className="mb-3 text-lg font-semibold text-gray-800">{t('payments_use_cases')}</h2>
      <div className="space-y-4 mb-8">
        {data.useCases.map((uc) => (
          <div key={uc.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 min-w-[160px]">
              <input
                type="checkbox"
                checked={uc.enabled}
                onChange={(e) => updateUseCase(uc.id, { enabled: e.target.checked })}
                className="rounded border-gray-300 text-emerald-600"
              />
              {t(USE_CASE_LABELS[uc.id] || uc.id)}
            </label>
            {uc.enabled && (
              <>
                <select
                  value={uc.provider || ''}
                  onChange={(e) => updateUseCase(uc.id, { provider: e.target.value || null })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('payments_none')}</option>
                  {data.providers.filter((p) => p.enabled).map((p) => (
                    <option key={p.id} value={p.id}>{PROVIDER_NAMES[p.id] || p.id}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={uc.currency}
                  onChange={(e) => updateUseCase(uc.id, { currency: e.target.value.toUpperCase() })}
                  placeholder="CHF"
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <span className="text-xs text-gray-400">{t('payments_currency')}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
