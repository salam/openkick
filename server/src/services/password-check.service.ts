import crypto from 'node:crypto';
import { zxcvbn } from '@zxcvbn-ts/core';

export interface PasswordCheckResult {
  acceptable: boolean;
  reasons: string[];
  zxcvbnScore: number;
  pwnedCount: number;
}

/**
 * Check a password against HIBP using k-anonymity.
 * SHA-1 the password, send only the first 5 hex chars to the API,
 * compare the remaining suffix locally using timing-safe comparison.
 */
export async function checkPwnedPassword(
  password: string
): Promise<{ isPwned: boolean; count: number }> {
  const sha1 = crypto
    .createHash('sha1')
    .update(password)
    .digest('hex')
    .toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  let body: string;
  try {
    const res = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'openkick-server/1.0',
        },
      }
    );
    if (!res.ok) {
      throw new Error(`HIBP returned ${res.status}`);
    }
    body = await res.text();
  } catch (err) {
    console.warn('[password-check] HIBP API unreachable:', err);
    return { isPwned: false, count: -1 };
  }

  for (const line of body.split('\n')) {
    const [hashSuffix, countStr] = line.split(':');
    const trimmedSuffix = hashSuffix.trim();

    if (trimmedSuffix.length === suffix.length) {
      const a = Buffer.from(trimmedSuffix);
      const b = Buffer.from(suffix);
      if (crypto.timingSafeEqual(a, b)) {
        return { isPwned: true, count: parseInt(countStr.trim(), 10) };
      }
    }
  }

  return { isPwned: false, count: 0 };
}

/**
 * Full admin password check: complexity + zxcvbn + HIBP.
 */
export async function checkAdminPassword(
  password: string
): Promise<PasswordCheckResult> {
  const reasons: string[] = [];

  // 1. Complexity rules
  if (password.length < 12)
    reasons.push('Must be at least 12 characters');
  if (!/[a-z]/.test(password))
    reasons.push('Must contain a lowercase letter');
  if (!/[A-Z]/.test(password))
    reasons.push('Must contain an uppercase letter');
  if (!/[0-9]/.test(password))
    reasons.push('Must contain a digit');
  if (!/[^a-zA-Z0-9]/.test(password))
    reasons.push('Must contain a special character');

  // 2. Entropy / pattern check
  const zResult = zxcvbn(password);
  if (zResult.score < 3) {
    const warning = zResult.feedback.warning || '';
    reasons.push(
      `Too weak (strength ${zResult.score}/4).${warning ? ' ' + warning : ''}`
    );
  }

  // 3. Breach check
  const pwned = await checkPwnedPassword(password);
  if (pwned.isPwned) {
    reasons.push(
      `Appeared in ${pwned.count.toLocaleString()} data breaches`
    );
  }

  return {
    acceptable: reasons.length === 0 && pwned.count !== -1,
    reasons,
    zxcvbnScore: zResult.score,
    pwnedCount: pwned.count,
  };
}
