'use client';

import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Props {
  tintColor: string;
  bgImage: string;
  onUpdate: (key: string, value: string) => void;
}

export default function HomepageCustomizer({ tintColor, bgImage, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(tintColor || '#10b981');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setColor(tintColor || '#10b981');
  }, [tintColor]);

  function handleColorInput(value: string) {
    setColor(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      document.documentElement.style.setProperty('--tint', value);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleSaveColor() {
    setSaving(true);
    try {
      await apiFetch(`/api/settings/tint_color`, { method: 'PUT', body: JSON.stringify({ value: color }), headers: { 'Content-Type': 'application/json' } });
      onUpdate('tint_color', color);
    } catch { /* ignore */ }
    setSaving(false);
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

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-gray-200 bg-white/80 p-2 text-gray-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-primary-600"
        title={t('customize')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M17 2.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5zM17 15.75a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0v-1.5zM3.75 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zM4.5 2.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5zM10 11a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0v-5.5A.75.75 0 0110 11zM10.75 2.75a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0v-1.5zM10 6a2 2 0 100 4 2 2 0 000-4zM3.75 10a2 2 0 100 4 2 2 0 000-4zM16.25 10a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">{t('customize')}</h3>

          {/* Tint color */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('tint_color')}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorInput(e.target.value)}
                className="h-8 w-8 min-w-8 cursor-pointer appearance-none rounded border border-gray-300 p-0.5"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => handleColorInput(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
                maxLength={7}
              />
              <button
                onClick={handleSaveColor}
                disabled={saving || color === tintColor}
                className="rounded-md bg-primary-500 px-2 py-1 text-xs font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? '...' : t('save')}
              </button>
            </div>
          </div>

          {/* Background image */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('background_image')}</label>
            {bgImage ? (
              <div className="space-y-2">
                <img
                  src={`${API_URL}${bgImage}`}
                  alt=""
                  className="h-20 w-full rounded-lg object-cover"
                />
                <button
                  onClick={handleRemoveBg}
                  disabled={uploading}
                  className="w-full rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  {uploading ? '...' : t('remove_image')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
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
      )}
    </div>
  );
}
