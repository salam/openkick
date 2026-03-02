'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setToken, setPasswordWarnings } from '@/lib/auth';
import { t, getLanguage } from '@/lib/i18n';
import AltchaWidget from '@/components/AltchaWidget';

interface LoginResponse {
  token: string;
  piiAccessLevel?: 'full' | 'restricted';
  passwordWarnings?: string[];
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaPayload, setCaptchaPayload] = useState('');
  const [checking, setChecking] = useState(true);
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API_URL}/api/setup/status`)
      .then(r => r.json())
      .then(({ needsSetup }: { needsSetup: boolean }) => {
        if (needsSetup) router.replace('/setup/');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleCaptchaVerify = useCallback((payload: string) => {
    setCaptchaPayload(payload);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch<LoginResponse>('/api/guardians/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, captcha: captchaPayload }),
      });

      setToken(data.token);
      setPasswordWarnings(data.passwordWarnings ?? []);
      router.push('/dashboard/');
    } catch {
      setError(t('login_error'));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-600">OpenKick</h1>
          <p className="mt-1 text-sm text-gray-500">{t('youth_football_mgmt')}</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-6 shadow-md"
        >
          <h2 className="mb-6 text-xl font-semibold text-gray-800">
            {t('login')}
          </h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

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

          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('password')}
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="••••••••"
            autoComplete="current-password"
          />

          <div className="mb-6 text-right">
            <a href="/forgot-password/" className="text-sm text-primary-600 hover:underline">
              {t('forgot_password')}
            </a>
          </div>

          <div className="mb-4">
            <AltchaWidget onVerify={handleCaptchaVerify} />
          </div>

          <button
            type="submit"
            disabled={loading || !captchaPayload}
            className="w-full rounded-xl bg-primary-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? '...' : t('login')}
          </button>
        </form>
      </div>
    </main>
  );
}
