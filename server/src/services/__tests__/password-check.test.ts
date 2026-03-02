import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';
import {
  checkPwnedPassword,
  checkAdminPassword,
} from '../password-check.service.js';

zxcvbnOptions.setOptions({
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommon.dictionary,
    ...zxcvbnEn.dictionary,
  },
});

/** Helper: compute the SHA-1 suffix (chars 5+) for a given password. */
function sha1Suffix(password: string): string {
  return crypto
    .createHash('sha1')
    .update(password)
    .digest('hex')
    .toUpperCase()
    .slice(5);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Complexity rules
// ---------------------------------------------------------------------------
describe('checkAdminPassword – complexity rules', () => {
  /** Mock HIBP to return "not pwned" so only complexity is tested. */
  function mockHibpClean(): void {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\n', { status: 200 })
    );
  }

  it('rejects passwords shorter than 12 characters', async () => {
    mockHibpClean();
    const result = await checkAdminPassword('Ab1!xyZ');
    expect(result.acceptable).toBe(false);
    expect(result.reasons).toContain('Must be at least 12 characters');
  });

  it('rejects passwords missing a lowercase letter', async () => {
    mockHibpClean();
    const result = await checkAdminPassword('ABCDEFGH1234!@');
    expect(result.acceptable).toBe(false);
    expect(result.reasons).toContain('Must contain a lowercase letter');
  });

  it('rejects passwords missing an uppercase letter', async () => {
    mockHibpClean();
    const result = await checkAdminPassword('abcdefgh1234!@');
    expect(result.acceptable).toBe(false);
    expect(result.reasons).toContain('Must contain an uppercase letter');
  });

  it('rejects passwords missing a digit', async () => {
    mockHibpClean();
    const result = await checkAdminPassword('Abcdefghijkl!@');
    expect(result.acceptable).toBe(false);
    expect(result.reasons).toContain('Must contain a digit');
  });

  it('rejects passwords missing a special character', async () => {
    mockHibpClean();
    const result = await checkAdminPassword('Abcdefgh1234AB');
    expect(result.acceptable).toBe(false);
    expect(result.reasons).toContain('Must contain a special character');
  });

  it('passes all complexity rules with a strong password', async () => {
    mockHibpClean();
    const result = await checkAdminPassword('G@lax!esTr0ng#2024');
    const complexityReasons = result.reasons.filter((r) =>
      r.startsWith('Must ')
    );
    expect(complexityReasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. checkPwnedPassword
// ---------------------------------------------------------------------------
describe('checkPwnedPassword', () => {
  it('detects a password found in a breach', async () => {
    const testPassword = 'password123';
    const suffix = sha1Suffix(testPassword);

    // Build a response containing the matching suffix with a breach count
    const responseBody = [
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5',
      `${suffix}:37615`,
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:2',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(responseBody, { status: 200 })
    );

    const result = await checkPwnedPassword(testPassword);
    expect(result.isPwned).toBe(true);
    expect(result.count).toBe(37615);
  });

  it('returns not pwned when the suffix is absent', async () => {
    const responseBody = [
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5',
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC:12',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(responseBody, { status: 200 })
    );

    const result = await checkPwnedPassword('some-unique-password-xyz');
    expect(result.isPwned).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns count -1 when the HIBP API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Network error')
    );

    const result = await checkPwnedPassword('anything');
    expect(result.isPwned).toBe(false);
    expect(result.count).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 3. checkAdminPassword – integration
// ---------------------------------------------------------------------------
describe('checkAdminPassword – integration', () => {
  it('accepts a strong, non-breached password', async () => {
    const strongPassword = 'G@lax!esTr0ng#2024';
    const suffix = sha1Suffix(strongPassword);

    // Return a response that does NOT contain the suffix
    const responseBody = [
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:2',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(responseBody, { status: 200 })
    );

    const result = await checkAdminPassword(strongPassword);
    expect(result.acceptable).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.pwnedCount).toBe(0);
    expect(result.zxcvbnScore).toBeGreaterThanOrEqual(3);
  });

  it('rejects a weak, short, common password', async () => {
    const weakPassword = 'pass';
    const suffix = sha1Suffix(weakPassword);

    const responseBody = [
      `${suffix}:9999`,
      'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD:1',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(responseBody, { status: 200 })
    );

    const result = await checkAdminPassword(weakPassword);
    expect(result.acceptable).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Must be at least 12 characters'),
      ])
    );
  });

  it('rejects when HIBP is unreachable even if complexity passes', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Network error')
    );

    const result = await checkAdminPassword('G@lax!esTr0ng#2024');
    expect(result.acceptable).toBe(false);
    expect(result.pwnedCount).toBe(-1);
  });
});
