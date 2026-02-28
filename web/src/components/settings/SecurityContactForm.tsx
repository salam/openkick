'use client';
import type { SettingsFormProps } from './ClubProfileForm';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

const FIELDS = [
  { key: 'security_contact_email', label: 'Security Contact Email', placeholder: 'security@yourclub.com' },
  { key: 'security_contact_url', label: 'Security Contact URL', placeholder: 'https://yourclub.com/security' },
  { key: 'security_pgp_key_url', label: 'PGP Key URL', placeholder: 'https://...' },
  { key: 'security_policy_url', label: 'Security Policy URL', placeholder: 'https://...' },
  { key: 'security_acknowledgments_url', label: 'Acknowledgments URL', placeholder: 'https://...' },
  { key: 'security_preferred_languages', label: 'Preferred Languages', placeholder: 'en, de' },
  { key: 'security_canonical_url', label: 'Canonical URL', placeholder: 'https://yourclub.com/.well-known/security.txt' },
] as const;

export default function SecurityContactForm({ settings, onUpdate }: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">Security Contact</h2>
      <p className="mb-4 text-sm text-gray-500">
        Configure your security.txt file (RFC 9116).
        The open-source project contact is always included automatically.
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
