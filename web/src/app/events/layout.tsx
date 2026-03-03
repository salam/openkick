'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { isAuthenticated } from '@/lib/auth';

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(isAuthenticated());
  }, []);

  // While determining auth, render children without navbar to avoid flash
  if (authed === null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {authed && <Navbar />}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
