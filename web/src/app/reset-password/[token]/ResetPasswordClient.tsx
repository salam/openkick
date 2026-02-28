'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';

interface ResetPasswordResponse {
  token: string;
}

export default function ResetPasswordClient() {
  const router = useRouter();
  const [tokenValue, setTokenValue] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const segments = window.location.pathname.split('/');
    const resetIndex = segments.indexOf('reset-password');
    if (resetIndex !== -1 && segments[resetIndex + 1]) {
      setTokenValue(segments[resetIndex + 1]);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const data = await apiFetch<ResetPasswordResponse>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: tokenValue, password }),
      });

      setToken(data.token);
      router.push('/dashboard/');
    } catch {
      setError('invalid_or_expired');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-700">OpenKick</h1>
          <p className="mt-1 text-sm text-gray-500">Youth Football Management</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-md">
          <h2 className="mb-6 text-xl font-semibold text-gray-800">
            Reset Password
          </h2>

          {error === 'invalid_or_expired' ? (
            <div>
              <p className="mb-4 text-sm text-red-700">
                Invalid or expired link. Please request a new one.
              </p>
              <a
                href="/forgot-password/"
                className="text-sm text-green-600 hover:underline"
              >
                Request a new reset link
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <label className="mb-1 block text-sm font-medium text-gray-700">
                New Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-4 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                placeholder="••••••••"
                autoComplete="new-password"
              />

              <label className="mb-1 block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mb-6 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                placeholder="••••••••"
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? '...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
