'use client';

export interface ClubSettings {
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

declare global {
  interface Window {
    __CLUB_SETTINGS__?: Partial<ClubSettings>;
  }
}

/** Reads club settings injected server-side into window.__CLUB_SETTINGS__. */
export function useClubSettings(): ClubSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  return { ...DEFAULTS, ...window.__CLUB_SETTINGS__ };
}
