'use client';

import { useEffect } from 'react';
import { useClubSettings } from '@/hooks/useClubSettings';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function DynamicHead() {
  const { club_name, club_description, club_logo } = useClubSettings();

  useEffect(() => {
    if (club_name) {
      document.title = club_description
        ? `${club_name} — ${club_description}`
        : club_name;
    }

    if (club_logo) {
      const iconUrl = `${API_URL}${club_logo}`;
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = iconUrl;
    }

    if (club_description) {
      let meta = document.querySelector<HTMLMetaElement>("meta[name='description']");
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = club_description;
    }
  }, [club_name, club_description, club_logo]);

  return null;
}
