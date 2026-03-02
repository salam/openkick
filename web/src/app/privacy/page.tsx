'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { t, getLanguage } from '@/lib/i18n';
import LanguageToggle from '@/components/LanguageToggle';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface PrivacySettings {
  legal_org_name: string;
  legal_address: string;
  legal_email: string;
  legal_responsible: string;
  dpo_name: string;
  dpo_email: string;
  club_name: string;
  contact_info: string;
  privacy_extra: string;
  _admin_email?: string;
}

export default function PrivacyPage() {
  const [s, setS] = useState<PrivacySettings | null>(null);
  const [, setLang] = useState(() => getLanguage());

  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/settings`);
        const data = await res.json();
        setS(data);
      } catch {
        setS({
          legal_org_name: '', legal_address: '', legal_email: '',
          legal_responsible: '', dpo_name: '', dpo_email: '',
          club_name: '', contact_info: '', privacy_extra: '',
        });
      }
    }
    load();
  }, []);

  const contactEmail = s?.dpo_email || s?.legal_email || s?.contact_info || s?._admin_email || '';

  if (!s) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto max-w-2xl px-6 py-16">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <Link href="/" className="mb-8 inline-block text-sm text-primary-600 hover:text-primary-800">
        &larr; {s.club_name || 'Home'}
      </Link>

      <h1 className="mb-8 text-3xl font-bold">{t('privacy_title')}</h1>

      {/* Responsible entity */}
      {(s.legal_org_name || s.legal_address || s.legal_responsible) && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{t('privacy_responsible')}</h2>
          <div className="space-y-1 text-gray-700">
            {s.legal_org_name && <p className="font-medium">{s.legal_org_name}</p>}
            {s.legal_responsible && <p>{s.legal_responsible}</p>}
            {s.legal_address && <p className="whitespace-pre-line">{s.legal_address}</p>}
            {s.legal_email && (
              <p>
                <a href={`mailto:${s.legal_email}`} className="text-primary-600 hover:underline">
                  {s.legal_email}
                </a>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Data Protection Officer */}
      {(s.dpo_name || s.dpo_email) && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{t('privacy_dpo')}</h2>
          <div className="space-y-1 text-gray-700">
            {s.dpo_name && <p>{s.dpo_name}</p>}
            {s.dpo_email && (
              <p>
                <a href={`mailto:${s.dpo_email}`} className="text-primary-600 hover:underline">
                  {s.dpo_email}
                </a>
              </p>
            )}
          </div>
        </section>
      )}

      {/* What data we collect */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy_data_collected')}</h2>
        <p className="text-gray-700">{t('privacy_data_collected_text')}</p>
      </section>

      {/* Purpose and legal basis */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy_purpose')}</h2>
        <p className="text-gray-700">{t('privacy_purpose_text')}</p>
      </section>

      {/* Data retention */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy_retention')}</h2>
        <p className="text-gray-700">{t('privacy_retention_text')}</p>
      </section>

      {/* Your rights */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy_rights')}</h2>
        <p className="mb-3 text-gray-700">{t('privacy_rights_intro')}</p>
        <ul className="list-inside list-disc space-y-2 text-gray-700">
          <li>{t('privacy_right_access')}</li>
          <li>{t('privacy_right_export')}</li>
          <li>{t('privacy_right_erasure')}</li>
          <li>{t('privacy_right_withdraw')}</li>
          <li>{t('privacy_right_complaint')}</li>
        </ul>
      </section>

      {/* Contact for requests */}
      {contactEmail && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{t('privacy_contact_requests')}</h2>
          <p className="text-gray-700">{t('privacy_contact_requests_text')}</p>
          <p className="mt-2">
            <a href={`mailto:${contactEmail}`} className="text-primary-600 hover:underline">
              {contactEmail}
            </a>
          </p>
        </section>
      )}

      {/* Data request actions */}
      <section className="mb-8">
        <p className="text-gray-700">{t('privacy_request_intro')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={`mailto:${contactEmail || ''}?subject=${encodeURIComponent(t('privacy_request_export_subject'))}`}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-600 px-4 py-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('privacy_request_export')}
          </a>
          <a
            href={`mailto:${contactEmail || ''}?subject=${encodeURIComponent(t('privacy_request_deletion_subject'))}`}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {t('privacy_request_deletion')}
          </a>
        </div>
      </section>

      {/* Custom content */}
      {s.privacy_extra && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{t('privacy_additional')}</h2>
          <div className="whitespace-pre-line text-gray-700">{s.privacy_extra}</div>
        </section>
      )}
    </main>
  );
}
