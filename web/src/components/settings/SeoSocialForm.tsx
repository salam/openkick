'use client';
import type { SettingsFormProps } from './ClubProfileForm';
import { t } from '@/lib/i18n';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

const FIELDS = [
  { key: 'og_title', label: 'OG Title', fallbackKey: 'club_name', fallbackLabel: 'club name' },
  { key: 'og_description', label: 'OG Description', fallbackKey: 'club_description', fallbackLabel: 'club description' },
  { key: 'og_image', label: 'OG Image URL', fallbackKey: 'club_logo', fallbackLabel: 'club logo' },
  { key: 'twitter_title', label: 'Twitter/X Title', fallbackKey: 'og_title', fallbackLabel: 'OG title' },
  { key: 'twitter_description', label: 'Twitter/X Description', fallbackKey: 'og_description', fallbackLabel: 'OG description' },
  { key: 'twitter_handle', label: 'Twitter/X Handle', placeholder: '@yourclub' },
  { key: 'meta_keywords', label: 'Meta Keywords', placeholder: 'football, youth, club' },
] as const;

export default function SeoSocialForm({ settings, onUpdate }: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">{t('seo_social')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        {t('seo_social_desc')}
      </p>
      <div className="space-y-4">
        {FIELDS.map((field) => {
          let placeholder: string;
          if ('placeholder' in field) {
            placeholder = field.placeholder;
          } else {
            const fallbackValue = settings[field.fallbackKey];
            if (fallbackValue) {
              placeholder = `${fallbackValue} (${t('seo_fallback_hint')} ${field.fallbackLabel})`;
            } else {
              // Resolve chained fallback (e.g. twitter_title → og_title → club_name)
              const parent = FIELDS.find((f) => f.key === field.fallbackKey);
              const hasChain = parent && 'fallbackKey' in parent;
              const grandparentValue = hasChain ? settings[parent.fallbackKey] : undefined;
              placeholder = grandparentValue && hasChain
                ? `${grandparentValue} (${t('seo_fallback_hint')} ${field.fallbackLabel} → ${parent.fallbackLabel})`
                : `${t('seo_fallback_hint')} ${field.fallbackLabel}`;
            }
          }
          return (
            <div key={field.key}>
              <label className={labelClass}>{field.label}</label>
              <input
                type="text"
                className={inputClass}
                value={settings[field.key] || ''}
                placeholder={placeholder}
                onChange={(e) => onUpdate(field.key, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
