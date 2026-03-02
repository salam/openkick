'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { t, getLanguage } from '@/lib/i18n';
import LanguageToggle from '@/components/LanguageToggle';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface LegalSettings {
  legal_org_name: string;
  legal_address: string;
  legal_email: string;
  legal_phone: string;
  legal_responsible: string;
  contact_info: string;
  club_name: string;
  imprint_extra: string;
}

export default function ImprintPage() {
  const [s, setS] = useState<LegalSettings | null>(null);
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
          legal_phone: '', legal_responsible: '', contact_info: '',
          club_name: '', imprint_extra: '',
        });
      }
    }
    load();
  }, []);

  if (!s) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </main>
    );
  }

  // Data cascade — resolve effective values
  const placeholder = t('imprint_to_be_completed');
  const orgName = s.legal_org_name || s.club_name || placeholder;
  const email = s.legal_email || (s.contact_info && s.contact_info.includes('@') ? s.contact_info : '');
  const address = s.legal_address || placeholder;
  const responsible = s.legal_responsible || placeholder;
  const phone = s.legal_phone || '';

  // Determine if contact_info was consumed as email fallback
  const contactInfoUsedAsEmail = !s.legal_email && s.contact_info && s.contact_info.includes('@');

  // Determine incompleteness
  const isIncomplete =
    orgName === placeholder ||
    address === placeholder ||
    responsible === placeholder ||
    !email;

  return (
    <main className="relative mx-auto max-w-2xl px-6 py-16">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <Link href="/" className="mb-8 inline-block text-sm text-emerald-600 hover:text-emerald-800">
        &larr; {s.club_name || 'Home'}
      </Link>

      <h1 className="mb-2 text-3xl font-bold">{t('imprint_title')}</h1>
      <p className="mb-8 text-sm text-gray-500">{t('imprint_legal_ref')}</p>

      {/* Responsible entity — always shown */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy_responsible')}</h2>
        <div className="space-y-1 text-gray-700">
          <p className={`font-medium${orgName === placeholder ? ' italic text-gray-400' : ''}`}>
            {orgName}
          </p>
          <p className={responsible === placeholder ? 'italic text-gray-400' : ''}>
            {responsible}
          </p>
          <p className={`whitespace-pre-line${address === placeholder ? ' italic text-gray-400' : ''}`}>
            {address}
          </p>
        </div>
      </section>

      {/* Contact — always shown */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('imprint_contact')}</h2>
        <div className="space-y-1 text-gray-700">
          {email ? (
            <p>
              E-Mail:{' '}
              <a href={`mailto:${email}`} className="text-emerald-600 hover:underline">
                {email}
              </a>
            </p>
          ) : (
            <p className="italic text-gray-400">{placeholder}</p>
          )}
          {phone && <p>{t('legal_phone')}: {phone}</p>}
          {s.contact_info && !contactInfoUsedAsEmail && (
            <p>
              {s.contact_info.startsWith('http') ? (
                <a href={s.contact_info} className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">
                  {s.contact_info}
                </a>
              ) : (
                <a href={`mailto:${s.contact_info}`} className="text-emerald-600 hover:underline">
                  {s.contact_info}
                </a>
              )}
            </p>
          )}
        </div>
      </section>

      {/* Extra imprint content — only if set */}
      {s.imprint_extra && (
        <section className="mb-8">
          <div className="whitespace-pre-line text-gray-700">{s.imprint_extra}</div>
        </section>
      )}

      {/* Incomplete notice */}
      {isIncomplete && (
        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {email
            ? t('imprint_incomplete_notice').replace('{email}', email)
            : t('imprint_incomplete_notice_no_email')}
        </div>
      )}
    </main>
  );
}
