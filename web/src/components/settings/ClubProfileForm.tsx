'use client';

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
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

export default function ClubProfileForm({
  settings,
  onUpdate,
  onLogoUpload,
  onLogoRemove,
  uploadingLogo,
  logoMsg,
}: ClubProfileFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Club Profile
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        Public information shown on your club page, llms.txt, and feeds.
      </p>
      <div className="space-y-4">
        <div>
          <label htmlFor="club_name" className={labelClass}>
            Club Name
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
            Description
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
            Contact Info
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
        <div>
          <label className={labelClass}>Club Logo</label>
          <ImageCropUpload
            shape="round"
            outputSize={200}
            onCrop={onLogoUpload}
            onRemove={onLogoRemove}
            initialImage={
              settings.club_logo
                ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${settings.club_logo}`
                : undefined
            }
            disabled={uploadingLogo}
          />
          {logoMsg && (
            <p
              className={`mt-2 text-sm font-medium ${
                logoMsg.includes('Failed') ? 'text-red-600' : 'text-emerald-600'
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
