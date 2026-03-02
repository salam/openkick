'use client';
import type { SettingsFormProps } from './ClubProfileForm';
import { t } from '@/lib/i18n';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

const FIELDS = [
  { key: 'security_contact_email', labelKey: 'security_contact_email_label', placeholder: 'security@yourclub.com' },
  { key: 'security_contact_url', labelKey: 'security_contact_url_label', placeholder: 'https://yourclub.com/security' },
  { key: 'security_pgp_key_url', labelKey: 'security_pgp_key_url_label', placeholder: 'https://...' },
  { key: 'security_policy_url', labelKey: 'security_policy_url_label', placeholder: 'https://...' },
  { key: 'security_acknowledgments_url', labelKey: 'security_acknowledgments_url_label', placeholder: 'https://...' },
  { key: 'security_preferred_languages', labelKey: 'security_preferred_languages_label', placeholder: 'en, de' },
  { key: 'security_canonical_url', labelKey: 'security_canonical_url_label', placeholder: 'https://yourclub.com/.well-known/security.txt' },
] as const;

export default function SecurityContactForm({ settings, onUpdate }: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">{t('security_contact_title')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        {t('security_contact_desc')}
      </p>
      <div className="space-y-4">
        {FIELDS.map(({ key, labelKey, placeholder }) => (
          <div key={key}>
            <label className={labelClass}>{t(labelKey)}</label>
            <input
              type="text"
              className={inputClass}
              value={settings[key] || ''}
              placeholder={placeholder}
              onChange={(e) => onUpdate(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
