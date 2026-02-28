'use client';

import { useEffect } from 'react';
import { useClubSettings } from '@/hooks/useClubSettings';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function setMeta(property: string, content: string, attr = 'property') {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string, extra?: Record<string, string>) {
  if (!href) return;
  const selector = extra?.sizes ? `link[rel="${rel}"][sizes="${extra.sizes}"]` : `link[rel="${rel}"]`;
  let el = document.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (extra) Object.entries(extra).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.href = href;
}

export default function DynamicHead() {
  const s = useClubSettings();

  useEffect(() => {
    const title = s.og_title || s.club_name || 'OpenKick';
    const description = s.og_description || s.club_description || '';
    const image = s.og_image || (s.club_logo ? `${API_URL}${s.club_logo}` : '');
    const twitterTitle = s.twitter_title || title;
    const twitterDesc = s.twitter_description || description;

    document.title = `${title} - ${s.club_description || 'Youth Football Management'}`;

    setMeta('description', description, 'name');
    if (s.meta_keywords) setMeta('keywords', s.meta_keywords, 'name');

    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:type', 'website');
    if (image) setMeta('og:image', image);

    setMeta('twitter:card', image ? 'summary_large_image' : 'summary', 'name');
    setMeta('twitter:title', twitterTitle, 'name');
    setMeta('twitter:description', twitterDesc, 'name');
    if (image) setMeta('twitter:image', image, 'name');
    if (s.twitter_handle) setMeta('twitter:site', s.twitter_handle, 'name');

    setLink('icon', `${API_URL}/uploads/favicon.ico`);
    setLink('icon', `${API_URL}/uploads/favicon-16x16.png`, { type: 'image/png', sizes: '16x16' });
    setLink('icon', `${API_URL}/uploads/favicon-32x32.png`, { type: 'image/png', sizes: '32x32' });
    setLink('apple-touch-icon', `${API_URL}/uploads/apple-touch-icon.png`, { sizes: '180x180' });
    setLink('manifest', `${API_URL}/uploads/site.webmanifest`);
  }, [s]);

  return null;
}
