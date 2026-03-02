'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';
import { t, getLanguage } from '@/lib/i18n';
import WahaWizard from './waha-wizard';

interface SetupStatusResponse {
  needsSetup: boolean;
}

interface SetupResponse {
  token: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [setupPhase, setSetupPhase] = useState<'admin' | 'waha'>('admin');
  const [authToken, setAuthToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const goToDashboard = useCallback(() => {
    router.push('/onboarding/');
  }, [router]);

  useEffect(() => {
    apiFetch<SetupStatusResponse>('/api/setup/status')
      .then(({ needsSetup }) => {
        if (!needsSetup) {
          router.replace('/login/');
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        router.replace('/login/');
      });
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('passwords_no_match'));
      return;
    }

    setLoading(true);

    try {
      const data = await apiFetch<SetupResponse>('/api/setup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });

      setToken(data.token);
      setAuthToken(data.token);
      setSetupPhase('waha');
    } catch {
      setError(t('setup_failed'));
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

  if (setupPhase === 'waha') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <WahaWizard
          authToken={authToken}
          onComplete={goToDashboard}
          onSkip={goToDashboard}
        />
      </main>
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
          <h2 className="mb-1 text-xl font-semibold text-gray-800">
            {t('setup_title')}
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            {t('setup_hint')}
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('name')}
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Your name"
            autoComplete="name"
          />

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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="••••••••"
            autoComplete="new-password"
          />

          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('setup_password_confirm')}
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mb-6 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="••••••••"
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? '...' : t('setup_submit')}
          </button>
        </form>
      </div>
    </main>
  );
}
