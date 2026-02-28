'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const CACHE_KEY = 'openkick_club_settings';

interface ClubSettings {
  club_name: string;
  club_description: string;
  club_logo: string;
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_title: string;
  twitter_description: string;
  twitter_handle: string;
  meta_keywords: string;
}

const DEFAULTS: ClubSettings = {
  club_name: 'OpenKick',
  club_description: 'Youth Football Management',
  club_logo: '',
  og_title: '',
  og_description: '',
  og_image: '',
  twitter_title: '',
  twitter_description: '',
  twitter_handle: '',
  meta_keywords: '',
};

export function useClubSettings(): ClubSettings {
  const [settings, setSettings] = useState<ClubSettings>(() => {
    if (typeof window === 'undefined') return DEFAULTS;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return { ...DEFAULTS, ...JSON.parse(cached) };
    } catch { /* ignore */ }
    return DEFAULTS;
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/settings`)
      .then((r) => r.json())
      .then((all: Record<string, string>) => {
        if (cancelled) return;
        const next: ClubSettings = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS) as (keyof ClubSettings)[]) {
          if (all[k]) next[k] = all[k];
        }
        setSettings(next);
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      })
      .catch(() => { /* use cached or defaults */ });
    return () => { cancelled = true; };
  }, []);

  return settings;
}
