'use client';

import { useState, useEffect } from 'react';

export interface ClubSettings {
  club_name: string;
  club_description: string;
  club_logo: string;
  tint_color: string;
  homepage_bg_image: string;
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_title: string;
  twitter_description: string;
  twitter_handle: string;
  meta_keywords: string;
}

const DEFAULTS: ClubSettings = {
  club_name: '',
  club_description: '',
  club_logo: '',
  tint_color: '#10b981',
  homepage_bg_image: '',
  og_title: '',
  og_description: '',
  og_image: '',
  twitter_title: '',
  twitter_description: '',
  twitter_handle: '',
  meta_keywords: '',
};

const SETTINGS_KEYS: (keyof ClubSettings)[] = [
  'club_name',
  'club_description',
  'club_logo',
  'tint_color',
  'homepage_bg_image',
  'og_title',
  'og_description',
  'og_image',
  'twitter_title',
  'twitter_description',
  'twitter_handle',
  'meta_keywords',
];

declare global {
  interface Window {
    __CLUB_SETTINGS__?: Partial<ClubSettings>;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Shared cache so multiple components don't each trigger a fetch. */
let fetchedSettings: ClubSettings | null = null;
let fetchPromise: Promise<void> | null = null;

function fetchSettings(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch(`${API_URL}/api/settings`)
    .then((res) => (res.ok ? res.json() : {}))
    .then((data: Record<string, string>) => {
      const partial: Partial<ClubSettings> = {};
      for (const key of SETTINGS_KEYS) {
        if (data[key]) partial[key] = data[key];
      }
      fetchedSettings = { ...DEFAULTS, ...partial };
    })
    .catch(() => {
      fetchedSettings = { ...DEFAULTS };
    });
  return fetchPromise;
}

/**
 * Reads club settings from server-injected window.__CLUB_SETTINGS__ (production)
 * or fetches from /api/settings (development).
 */
export function useClubSettings(): ClubSettings {
  const injected =
    typeof window !== 'undefined' ? window.__CLUB_SETTINGS__ : undefined;

  const [settings, setSettings] = useState<ClubSettings>(() => {
    if (injected && Object.keys(injected).length > 0) {
      return { ...DEFAULTS, ...injected };
    }
    if (fetchedSettings) return fetchedSettings;
    return DEFAULTS;
  });

  useEffect(() => {
    if (injected && Object.keys(injected).length > 0) {
      setSettings({ ...DEFAULTS, ...injected });
      return;
    }
    if (fetchedSettings) {
      setSettings(fetchedSettings);
      return;
    }
    fetchSettings().then(() => {
      if (fetchedSettings) setSettings(fetchedSettings);
    });
  }, [injected]);

  return settings;
}
