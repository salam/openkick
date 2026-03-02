'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import ImageCropUpload from '@/components/ImageCropUpload';

export interface SettingsFormProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

interface ClubProfileFormProps extends SettingsFormProps {
  onLogoUpload: (base64: string) => void;
  onLogoRemove: () => void;
  uploadingLogo: boolean;
  logoMsg: string;
}

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

export default function ClubProfileForm({
  settings,
  onUpdate,
  onLogoUpload,
  onLogoRemove,
  uploadingLogo,
  logoMsg,
}: ClubProfileFormProps) {
  const [address, setAddress] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');

  function handleGeolocate() {
    if (!navigator.geolocation) return;
    setLookupBusy(true);
    setLookupError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onUpdate('latitude', String(pos.coords.latitude));
        onUpdate('longitude', String(pos.coords.longitude));
        setLookupBusy(false);
      },
      () => {
        setLookupError(t('club_lookup_not_found'));
        setLookupBusy(false);
      },
    );
  }

  async function handleLookup() {
    if (!address.trim()) return;
    setLookupBusy(true);
    setLookupError('');
    try {
      const coords = await apiFetch<{ latitude: number; longitude: number }>(
        '/api/settings/geocode',
        { method: 'POST', body: JSON.stringify({ address: address.trim() }) },
      );
      onUpdate('latitude', String(coords.latitude));
      onUpdate('longitude', String(coords.longitude));
    } catch {
      setLookupError(t('club_lookup_not_found'));
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {t('club_profile')}
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        {t('club_profile_desc')}
      </p>
      <div className="space-y-4">
        <div>
          <label htmlFor="club_name" className={labelClass}>
            {t('club_name')}
          </label>
          <input
            id="club_name"
            type="text"
            value={settings.club_name || ''}
            onChange={(e) => onUpdate('club_name', e.target.value)}
            placeholder="FC My Club"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="club_description" className={labelClass}>
            {t('club_description')}
          </label>
          <textarea
            id="club_description"
            value={settings.club_description || ''}
            onChange={(e) => onUpdate('club_description', e.target.value)}
            placeholder="A short description of your club..."
            rows={3}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="contact_info" className={labelClass}>
            {t('contact_info')}
          </label>
          <input
            id="contact_info"
            type="text"
            value={settings.contact_info || ''}
            onChange={(e) => onUpdate('contact_info', e.target.value)}
            placeholder="info@yourclub.ch or a URL"
            className={inputClass}
          />
        </div>

        {/* Address lookup → auto-fill lat/lon */}
        <div>
          <label htmlFor="club_address" className={labelClass}>
            {t('club_address_lookup')}
          </label>
          <div className="flex gap-2">
            <input
              id="club_address"
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setLookupError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookup(); } }}
              placeholder={t('club_address_placeholder')}
              className={inputClass}
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={lookupBusy || !address.trim()}
              className="shrink-0 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {lookupBusy ? '...' : t('club_lookup_button')}
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {lookupError && (
              <span className="text-xs text-red-500">{lookupError}</span>
            )}
            <button
              type="button"
              onClick={handleGeolocate}
              disabled={lookupBusy}
              className="ml-auto text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
            >
              {t('club_use_my_location')}
            </button>
          </div>
        </div>

        {/* Latitude / Longitude */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="latitude" className={labelClass}>
              {t('club_latitude')}
            </label>
            <input
              id="latitude"
              type="number"
              step="any"
              value={settings.latitude || ''}
              onChange={(e) => onUpdate('latitude', e.target.value)}
              placeholder="47.3769"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="longitude" className={labelClass}>
              {t('club_longitude')}
            </label>
            <input
              id="longitude"
              type="number"
              step="any"
              value={settings.longitude || ''}
              onChange={(e) => onUpdate('longitude', e.target.value)}
              placeholder="8.5417"
              className={inputClass}
            />
          </div>
          <p className="col-span-2 text-xs text-gray-400">
            {t('club_coordinates_hint')}
          </p>
        </div>
        <div>
          <label className={labelClass}>{t('club_logo')}</label>
          <ImageCropUpload
            shape="round"
            outputSize={200}
            onCrop={onLogoUpload}
            onRemove={onLogoRemove}
            initialImage={
              settings.club_logo
                ? `${process.env.NEXT_PUBLIC_API_URL || ''}${settings.club_logo}`
                : undefined
            }
            disabled={uploadingLogo}
          />
          {logoMsg && (
            <p
              className={`mt-2 text-sm font-medium ${
                logoMsg.includes('Failed') ? 'text-red-600' : 'text-primary-600'
              }`}
            >
              {logoMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
