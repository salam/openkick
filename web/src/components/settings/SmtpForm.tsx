'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { SettingsFormProps } from './ClubProfileForm';

interface SmtpFormProps extends SettingsFormProps {
  onSaveKeys: (keys: string[]) => Promise<void>;
}

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
const btnSecondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50';

export default function SmtpForm({
  settings,
  onUpdate,
  onSaveKeys,
}: SmtpFormProps) {
  const [smtpTestTo, setSmtpTestTo] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleTestSmtp() {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      // Save SMTP settings first
      await onSaveKeys(['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from']);
      const res = await apiFetch<{ success: boolean; message?: string }>(
        '/api/settings/test-smtp',
        { method: 'POST', body: JSON.stringify({ to: smtpTestTo }) },
      );
      setSmtpTestResult({ ok: res.success, msg: res.message || t('smtp_test_sent') });
    } catch {
      setSmtpTestResult({ ok: false, msg: t('smtp_test_failed') });
    } finally {
      setTestingSmtp(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {t('smtp_settings')}
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        {t('smtp_required')}
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="smtp_host" className={labelClass}>
              {t('smtp_host')}
            </label>
            <input
              id="smtp_host"
              type="text"
              value={settings.smtp_host || ''}
              onChange={(e) => onUpdate('smtp_host', e.target.value)}
              placeholder="mail.example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="smtp_port" className={labelClass}>
              {t('smtp_port')}
            </label>
            <input
              id="smtp_port"
              type="number"
              value={settings.smtp_port || '587'}
              onChange={(e) => onUpdate('smtp_port', e.target.value)}
              placeholder="587"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="smtp_user" className={labelClass}>
            {t('smtp_username')}
          </label>
          <input
            id="smtp_user"
            type="text"
            value={settings.smtp_user || ''}
            onChange={(e) => onUpdate('smtp_user', e.target.value)}
            placeholder="user@example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="smtp_pass" className={labelClass}>
            {t('password')}
          </label>
          <input
            id="smtp_pass"
            type="password"
            value={settings.smtp_pass || ''}
            onChange={(e) => onUpdate('smtp_pass', e.target.value)}
            placeholder={t('smtp_password_placeholder')}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="smtp_from" className={labelClass}>
            {t('smtp_from')}
          </label>
          <input
            id="smtp_from"
            type="email"
            value={settings.smtp_from || ''}
            onChange={(e) => onUpdate('smtp_from', e.target.value)}
            placeholder="noreply@yourclub.com"
            className={inputClass}
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="email"
            value={smtpTestTo}
            onChange={(e) => setSmtpTestTo(e.target.value)}
            placeholder={t('smtp_send_test')}
            className={inputClass + ' max-w-xs'}
          />
          <button
            onClick={handleTestSmtp}
            disabled={testingSmtp || !smtpTestTo}
            className={btnSecondary + ' whitespace-nowrap'}
          >
            {testingSmtp ? t('sending') : t('smtp_test')}
          </button>
        </div>
        {smtpTestResult && (
          <p
            className={`text-sm font-medium ${
              smtpTestResult.ok ? 'text-primary-600' : 'text-red-600'
            }`}
          >
            {smtpTestResult.msg}
          </p>
        )}
      </div>
    </div>
  );
}
