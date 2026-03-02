'use client';

import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
