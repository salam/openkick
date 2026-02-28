import type { Metadata } from 'next';
import './globals.css';
import { detectLanguage } from '@/lib/i18n';
import Footer from '@/components/Footer';
import DynamicHead from '@/components/DynamicHead';

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
      <body className="flex min-h-screen flex-col bg-white text-gray-900 antialiased">
        <DynamicHead />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
