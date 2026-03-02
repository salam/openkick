'use client';

import { useState, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { SettingsFormProps } from './ClubProfileForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

function applyTint(color: string) {
  document.documentElement.style.setProperty('--tint', color);
}

export default function HomepageAppearanceCard({ settings, onUpdate }: SettingsFormProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleColorChange(value: string) {
    onUpdate('tint_color', value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      applyTint(value);
    }
  }

  async function handleUploadBg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await apiFetch<{ value: string }>('/api/settings/upload-bg', {
          method: 'POST',
          body: JSON.stringify({ data: base64, filename: file.name }),
          headers: { 'Content-Type': 'application/json' },
        });
        onUpdate('homepage_bg_image', res.value);
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  }

  async function handleRemoveBg() {
    setUploading(true);
    try {
      await apiFetch('/api/settings/remove-bg', { method: 'DELETE' });
      onUpdate('homepage_bg_image', '');
    } catch { /* ignore */ }
    setUploading(false);
  }

  const bgImage = settings.homepage_bg_image || '';

  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t('homepage_appearance')}</h2>
      <p className="mb-4 text-sm text-gray-500">{t('homepage_appearance_desc')}</p>

      <div className="space-y-4">
        {/* Tint color */}
        <div>
          <label className={labelClass}>{t('tint_color')}</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.tint_color || '#10b981'}
              onChange={(e) => handleColorChange(e.target.value)}
              className="h-10 w-10 min-w-10 cursor-pointer appearance-none rounded-lg border border-gray-300 p-0.5"
            />
            <input
              type="text"
              value={settings.tint_color || '#10b981'}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-28 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              maxLength={7}
            />
          </div>
        </div>

        {/* Background image */}
        <div>
          <label className={labelClass}>{t('background_image')}</label>
          {bgImage ? (
            <div className="space-y-2">
              <img
                src={`${API_URL}${bgImage}`}
                alt=""
                className="h-32 w-full rounded-lg object-cover"
              />
              <button
                onClick={handleRemoveBg}
                disabled={uploading}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                {uploading ? '...' : t('remove_image')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? '...' : t('upload_image')}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleUploadBg}
          />
        </div>
      </div>
    </div>
  );
}
