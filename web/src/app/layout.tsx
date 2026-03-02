import type { Metadata } from 'next';
import './globals.css';
import { detectLanguage } from '@/lib/i18n';
import Footer from '@/components/Footer';
import DynamicHead from '@/components/DynamicHead';
import { fetchSettingsServer } from '@/lib/settings-server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettingsServer();

  const title = s.og_title || s.club_name;
  const description = s.og_description || s.club_description;
  const image = s.og_image || (s.club_logo ? `${API_URL}${s.club_logo}` : undefined);
  const twitterTitle = s.twitter_title || title;
  const twitterDesc = s.twitter_description || description;

  return {
    title: `${title} — ${s.club_description || 'Youth Football Management'}`,
    description,
    keywords: s.meta_keywords || undefined,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: twitterTitle,
      description: twitterDesc,
      ...(image ? { images: [image] } : {}),
      ...(s.twitter_handle ? { site: s.twitter_handle } : {}),
    },
    icons: s.club_logo
      ? {
          icon: [
            { url: '/uploads/favicon.ico' },
            { url: '/uploads/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
            { url: '/uploads/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
          ],
          apple: [{ url: '/uploads/apple-touch-icon.png', sizes: '180x180' }],
        }
      : undefined,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await fetchSettingsServer();

  const title = s.og_title || s.club_name;
  const description = s.og_description || s.club_description;
  const image = s.og_image || (s.club_logo ? `${API_URL}${s.club_logo}` : undefined);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: title,
    description,
    ...(image ? { logo: image } : {}),
  };

  return (
    <html lang={detectLanguage()} suppressHydrationWarning style={{ '--tint': s.tint_color || '#10b981' } as React.CSSProperties}>
      <head>
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      </head>
      <body className="flex min-h-screen flex-col bg-white text-gray-900 antialiased">
        <DynamicHead />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
