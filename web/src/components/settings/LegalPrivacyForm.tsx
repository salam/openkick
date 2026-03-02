'use client';
import type { SettingsFormProps } from './ClubProfileForm';
import { t } from '@/lib/i18n';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

const FIELDS = [
  { key: 'legal_org_name', placeholder: 'FC Muster' },
  { key: 'legal_address', placeholder: 'Musterstr. 1, 8000 Zürich' },
  { key: 'legal_responsible', placeholder: 'Max Mustermann' },
  { key: 'legal_email', placeholder: 'info@yourclub.ch' },
  { key: 'legal_phone', placeholder: '+41 44 123 45 67' },
  { key: 'dpo_name', placeholder: 'Lisa Muster' },
  { key: 'dpo_email', placeholder: 'datenschutz@yourclub.ch' },
] as const;

export default function LegalPrivacyForm({ settings, onUpdate }: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">{t('legal_privacy_settings')}</h2>
      <p className="mb-4 text-sm text-gray-500">{t('legal_privacy_desc')}</p>
      <div className="space-y-4">
        {FIELDS.map(({ key, placeholder }) => (
          <div key={key}>
            <label className={labelClass}>{t(key)}</label>
            <input
              type="text"
              className={inputClass}
              value={settings[key] || ''}
              placeholder={placeholder}
              onChange={(e) => onUpdate(key, e.target.value)}
            />
          </div>
        ))}
        <div>
          <label className={labelClass}>{t('imprint_extra')}</label>
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={settings.imprint_extra || ''}
            placeholder="..."
            onChange={(e) => onUpdate('imprint_extra', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>{t('privacy_extra')}</label>
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={settings.privacy_extra || ''}
            placeholder="..."
            onChange={(e) => onUpdate('privacy_extra', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
