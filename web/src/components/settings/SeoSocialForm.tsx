'use client';
import type { SettingsFormProps } from './ClubProfileForm';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

const FIELDS = [
  { key: 'og_title', label: 'OG Title', placeholder: 'Falls back to club name' },
  { key: 'og_description', label: 'OG Description', placeholder: 'Falls back to club description' },
  { key: 'og_image', label: 'OG Image URL', placeholder: 'Falls back to club logo' },
  { key: 'twitter_title', label: 'Twitter/X Title', placeholder: 'Falls back to OG title' },
  { key: 'twitter_description', label: 'Twitter/X Description', placeholder: 'Falls back to OG description' },
  { key: 'twitter_handle', label: 'Twitter/X Handle', placeholder: '@yourclub' },
  { key: 'meta_keywords', label: 'Meta Keywords', placeholder: 'football, youth, club' },
] as const;

export default function SeoSocialForm({ settings, onUpdate }: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">SEO &amp; Social Media</h2>
      <p className="mb-4 text-sm text-gray-500">
        Customize how your site appears in search engines and when shared on social media.
        Empty fields fall back to club profile values.
      </p>
      <div className="space-y-4">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
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
