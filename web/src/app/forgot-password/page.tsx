'use client';

import { useState, useEffect, FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always show success message regardless of server response
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-600">OpenKick</h1>
          <p className="mt-1 text-sm text-gray-500">{t('youth_football_mgmt')}</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-md">
          <h2 className="mb-6 text-xl font-semibold text-gray-800">
            {t('forgot_password')}
          </h2>

          {submitted ? (
            <div>
              <p className="mb-4 text-sm text-gray-700">
                {t('forgot_password_sent')}
              </p>
              <a
                href="/login/"
                className="text-sm text-primary-600 hover:underline"
              >
                {t('back_to_login')}
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('email')}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="you@example.com"
                autoComplete="email"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? '...' : t('send_reset_link')}
              </button>

              <div className="mt-4 text-center">
                <a
                  href="/login/"
                  className="text-sm text-primary-600 hover:underline"
                >
                  {t('back_to_login')}
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
