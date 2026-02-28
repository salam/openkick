'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
          <h1 className="text-3xl font-bold text-green-700">OpenKick</h1>
          <p className="mt-1 text-sm text-gray-500">Youth Football Management</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-md">
          <h2 className="mb-6 text-xl font-semibold text-gray-800">
            Forgot Password
          </h2>

          {submitted ? (
            <div>
              <p className="mb-4 text-sm text-gray-700">
                If an account with that email exists, we&apos;ve sent a reset link.
              </p>
              <a
                href="/login/"
                className="text-sm text-green-600 hover:underline"
              >
                Back to Login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                placeholder="you@example.com"
                autoComplete="email"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? '...' : 'Send Reset Link'}
              </button>

              <div className="mt-4 text-center">
                <a
                  href="/login/"
                  className="text-sm text-green-600 hover:underline"
                >
                  Back to Login
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
