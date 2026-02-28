import type { Metadata } from 'next';
import './globals.css';
import { detectLanguage } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'OpenKick - Youth Football Management',
  description:
    'Open-source platform for managing youth football teams, events, attendance, and more.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={detectLanguage()} suppressHydrationWarning>
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
