'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';
import ClubProfileForm from '@/components/settings/ClubProfileForm';
import SmtpForm from '@/components/settings/SmtpForm';
import LlmConfigForm from '@/components/settings/LlmConfigForm';
import WahaConfigForm from '@/components/settings/WahaConfigForm';
import InviteTeamForm from '@/components/settings/InviteTeamForm';

const STEPS = [
  {
    key: 'clubProfile',
    titleKey: 'step_club',
    descKey: 'step_club_desc',
    required: true,
  },
  {
    key: 'email',
    titleKey: 'step_email',
    descKey: 'step_email_desc',
    required: false,
  },
  {
    key: 'llm',
    titleKey: 'step_ai',
    descKey: 'step_ai_desc',
    required: false,
  },
  {
    key: 'waha',
    titleKey: 'step_whatsapp',
    descKey: 'step_whatsapp_desc',
    required: false,
  },
  {
    key: 'invite',
    titleKey: 'step_invite',
    descKey: 'step_invite_desc',
    required: false,
  },
];

const STEP_KEYS: Record<string, string[]> = {
  clubProfile: ['club_name', 'club_description', 'contact_info', 'club_logo'],
  email: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'],
  llm: ['llm_provider', 'llm_model', 'llm_api_key', 'llm_product_id'],
  waha: ['waha_url'],
};

type SettingsMap = Record<string, string>;

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [original, setOriginal] = useState<SettingsMap>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');
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
    // Check onboarding status
    apiFetch<{ onboardingCompleted: boolean }>('/api/onboarding/status')
      .then((data) => {
        if (data.onboardingCompleted) {
          router.push('/dashboard/');
        }
      })
      .catch(() => {
        // ignore
      });

    loadSettings();
  }, [loadSettings, router]);

  function update(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function saveKeys(keys: string[]) {
    await Promise.all(
      keys
        .filter((k) => settings[k] !== original[k])
        .map((key) =>
          apiFetch(`/api/settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value: settings[key] || '' }),
          }),
        ),
    );
    setOriginal((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = settings[k];
      });
      return next;
    });
  }

  async function handleLogoUpload(base64: string) {
    setUploadingLogo(true);
    setLogoMsg('');
    try {
      const res = await apiFetch<{ key: string; value: string }>(
        '/api/settings/upload-logo',
        { method: 'POST', body: JSON.stringify({ data: base64, filename: 'logo.jpg' }) },
      );
      update('club_logo', res.value);
      setLogoMsg(t('logo_uploaded'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setLogoMsg(msg ? `${t('failed_upload_logo')}: ${msg}` : t('failed_upload_logo'));
    } finally {
      setUploadingLogo(false);
      setTimeout(() => setLogoMsg(''), 5000);
    }
  }

  async function handleLogoRemove() {
    setUploadingLogo(true);
    try {
      await apiFetch('/api/settings/remove-logo', { method: 'DELETE' });
      update('club_logo', '');
      setLogoMsg(t('logo_removed'));
    } catch {
      setLogoMsg(t('failed_remove_logo'));
    } finally {
      setUploadingLogo(false);
      setTimeout(() => setLogoMsg(''), 3000);
    }
  }

  async function handleSaveAndContinue() {
    setSaving(true);
    try {
      const stepKey = STEPS[currentStep].key;
      const keys = STEP_KEYS[stepKey];
      if (keys) {
        await saveKeys(keys);
      }

      if (currentStep < STEPS.length - 1) {
        setCurrentStep((prev) => prev + 1);
      } else {
        // Last step — complete onboarding
        await apiFetch('/api/onboarding/complete', { method: 'POST' });
        router.push('/dashboard/');
      }
    } catch {
      // save failed — stay on current step
    } finally {
      setSaving(false);
    }
  }

  const step0Disabled =
    !settings.club_name || settings.club_name === 'My Club';

  const canSave = currentStep !== 0 || !step0Disabled;

  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return (
          <ClubProfileForm
            settings={settings}
            onUpdate={update}
            onLogoUpload={handleLogoUpload}
            onLogoRemove={handleLogoRemove}
            uploadingLogo={uploadingLogo}
            logoMsg={logoMsg}
          />
        );
      case 1:
        return (
          <SmtpForm
            settings={settings}
            onUpdate={update}
            onSaveKeys={saveKeys}
          />
        );
      case 2:
        return (
          <LlmConfigForm
            settings={settings}
            onUpdate={update}
            onSaveKeys={saveKeys}
          />
        );
      case 3:
        return (
          <WahaConfigForm
            settings={settings}
            onUpdate={update}
          />
        );
      case 4:
        return <InviteTeamForm />;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">OpenKick</h1>
        <span className="text-sm text-gray-500">
          {t('step_of')} {currentStep + 1} {t('of')} {STEPS.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-8 flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentStep ? 'bg-primary-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Step title and description */}
      <div className="mb-4">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">
          {t(STEPS[currentStep].titleKey)}
        </h2>
        <p className="text-gray-600">{t(STEPS[currentStep].descKey)}</p>
      </div>

      {/* Step content */}
      <div className="mb-8">{renderStepContent()}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          {currentStep > 0 && (
            <button
              onClick={() => setCurrentStep((prev) => prev - 1)}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              &larr; {t('back')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {!STEPS[currentStep].required && !isLastStep && (
            <button
              onClick={() => setCurrentStep((prev) => prev + 1)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {t('skip_for_now')}
            </button>
          )}
          <button
            onClick={handleSaveAndContinue}
            disabled={saving || !canSave}
            className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50"
          >
            {saving
              ? t('saving')
              : isLastStep
                ? t('finish')
                : t('save_continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
