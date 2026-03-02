'use client';

const TOKEN_KEY = 'openkick_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Check for token link auth (parent passwordless login via ?token= query param) */
export function checkTokenLink(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

/** Decode the role from the stored JWT (no verification — server is the authority) */
export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

/** Decode the PII access level from the stored JWT */
export function getPiiAccessLevel(): 'full' | 'restricted' | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.piiAccessLevel || null;
  } catch {
    return null;
  }
}

const PW_WARNINGS_KEY = 'openkick_pw_warnings';

export function setPasswordWarnings(warnings: string[]): void {
  if (warnings.length > 0) {
    localStorage.setItem(PW_WARNINGS_KEY, JSON.stringify(warnings));
  } else {
    localStorage.removeItem(PW_WARNINGS_KEY);
  }
}

export function getPasswordWarnings(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PW_WARNINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearPasswordWarnings(): void {
  localStorage.removeItem(PW_WARNINGS_KEY);
}
