/**
 * Server-side settings fetch for use in generateMetadata() and Server Components.
 * Fetches from the Express backend directly (internal URL, not browser-facing).
 */

const INTERNAL_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ServerSettings {
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

const DEFAULTS: ServerSettings = {
  club_name: 'OpenKick',
  club_description: 'Youth Football Management',
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

const SAFE_KEYS = Object.keys(DEFAULTS) as (keyof ServerSettings)[];

export async function fetchSettingsServer(): Promise<ServerSettings> {
  try {
    const res = await fetch(`${INTERNAL_API}/api/settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return DEFAULTS;
    const data = await res.json();
    // Only pick known-safe keys — never spread the full API response,
    // which may contain secrets (API keys, HMAC secrets, etc.)
    const safe = { ...DEFAULTS };
    for (const key of SAFE_KEYS) {
      if (data[key]) safe[key] = data[key];
    }
    return safe;
  } catch {
    return DEFAULTS;
  }
}
