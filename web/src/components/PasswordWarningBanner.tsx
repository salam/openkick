'use client';

import { getPiiAccessLevel, getPasswordWarnings, getUserRole } from '@/lib/auth';
import { t } from '@/lib/i18n';

export default function PasswordWarningBanner() {
  const isAdmin = getUserRole() === 'admin';
  const restricted = getPiiAccessLevel() === 'restricted';

  if (!isAdmin || !restricted) return null;

  const warnings = getPasswordWarnings();

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">{t('weak_password_banner')}</p>
          {warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
        <a href="/settings/#security" className="shrink-0 text-sm font-medium text-amber-700 underline hover:text-amber-900">
          {t('weak_password_banner_link')}
        </a>
      </div>
    </div>
  );
}
