'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, checkTokenLink, setToken } from '@/lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Handle passwordless token link (?token=...)
    const linkToken = checkTokenLink();
    if (linkToken) {
      setToken(linkToken);
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }

    if (!isAuthenticated()) {
      // Check if first-time setup is needed
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      fetch(`${API_URL}/api/setup/status`)
        .then(r => r.json())
        .then(({ needsSetup }: { needsSetup: boolean }) => {
          router.replace(needsSetup ? '/setup/' : '/login/');
        })
        .catch(() => router.replace('/login/'));
    } else {
      // Check if onboarding is complete (skip check if already on /onboarding)
      if (!window.location.pathname.startsWith('/onboarding')) {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const token = localStorage.getItem('token');
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
            // If the check fails, let them through (don't block the app)
            setChecked(true);
          });
      } else {
        setChecked(true);
      }
    }
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
