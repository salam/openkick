'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, checkTokenLink, setToken, clearToken, getToken } from '@/lib/auth';
import PasswordWarningBanner from '@/components/PasswordWarningBanner';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

    // Handle passwordless token link (?token=...)
    const linkToken = checkTokenLink();
    if (linkToken) {
      setToken(linkToken);
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }

    // Always check setup status first — catches stale tokens on a wiped instance
    fetch(`${API_URL}/api/setup/status`)
      .then(r => r.json())
      .then(({ needsSetup }: { needsSetup: boolean }) => {
        if (needsSetup) {
          // No admin/coach exists — clear any stale token and redirect to setup
          clearToken();
          router.replace('/setup/');
          return;
        }

        if (!isAuthenticated()) {
          router.replace('/login/');
          return;
        }

        // Authenticated and setup done — check onboarding completion
        if (window.location.pathname.startsWith('/onboarding')) {
          setChecked(true);
          return;
        }

        const token = getToken();
        fetch(`${API_URL}/api/onboarding/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r => r.json())
          .then(({ onboardingCompleted }) => {
            if (!onboardingCompleted) {
              router.replace('/onboarding');
            } else {
              setChecked(true);
            }
          })
          .catch(() => {
            // If the onboarding check fails, redirect to login rather than letting through
            clearToken();
            router.replace('/login/');
          });
      })
      .catch(() => router.replace('/login/'));
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <PasswordWarningBanner />
      {children}
    </>
  );
}
