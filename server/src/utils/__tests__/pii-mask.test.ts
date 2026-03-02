import { describe, it, expect } from 'vitest';

import { maskEmail, maskName, maskPhone, maskPiiFields } from '../pii-mask.js';

describe('maskPhone', () => {
  it('masks a phone number with spaces', () => {
    expect(maskPhone('+41 79 123 45 67')).toBe('+41 79 *** ** 67');
  });

  it('masks a phone number without spaces', () => {
    expect(maskPhone('+41791234567')).toBe('+4179*****67');
  });

  it('returns "***" for short numbers (<6 chars)', () => {
    expect(maskPhone('+4179')).toBe('***');
    expect(maskPhone('123')).toBe('***');
  });

  it('returns empty string for empty input', () => {
    expect(maskPhone('')).toBe('');
  });
});

describe('maskName', () => {
  it('masks a two-part name to initials', () => {
    expect(maskName('Luca Müller')).toBe('L. M.');
  });

  it('masks a three-part name to initials', () => {
    expect(maskName('Anna Maria Rossi')).toBe('A. M. R.');
  });

  it('masks a single name to initial', () => {
    expect(maskName('Luca')).toBe('L.');
  });

  it('returns empty string for empty input', () => {
    expect(maskName('')).toBe('');
  });
});

describe('maskEmail', () => {
  it('masks a standard email', () => {
    expect(maskEmail('matthias@example.com')).toBe('m***@example.com');
  });

  it('masks a single-char local part', () => {
    expect(maskEmail('a@b.com')).toBe('a***@b.com');
  });

  it('returns "***" when there is no @ sign', () => {
    expect(maskEmail('invalid-email')).toBe('***');
  });

  it('returns empty string for empty input', () => {
    expect(maskEmail('')).toBe('');
  });
});

describe('maskPiiFields', () => {
  it('masks PII fields in a flat object', () => {
    const input = { name: 'Luca Müller', email: 'luca@example.com', phone: '+41791234567' };
    const result = maskPiiFields(input);
    expect(result).toEqual({
      name: 'L. M.',
      email: 'l***@example.com',
      phone: '+4179*****67',
    });
  });

  it('leaves non-PII fields untouched', () => {
    const input = { id: 42, role: 'admin', name: 'Luca Müller' };
    const result = maskPiiFields(input) as Record<string, unknown>;
    expect(result.id).toBe(42);
    expect(result.role).toBe('admin');
    expect(result.name).toBe('L. M.');
  });

  it('masks PII fields in nested objects', () => {
    const input = {
      player: {
        name: 'Anna Rossi',
        contact: { email: 'anna@example.com', phone: '+41 79 999 88 77' },
      },
    };
    const result = maskPiiFields(input) as Record<string, unknown>;
    const player = result.player as Record<string, unknown>;
    expect(player.name).toBe('A. R.');
    const contact = player.contact as Record<string, unknown>;
    expect(contact.email).toBe('a***@example.com');
    expect(contact.phone).toBe('+41 79 *** ** 77');
  });

  it('masks PII fields inside arrays', () => {
    const input = [
      { name: 'Luca Müller', age: 10 },
      { name: 'Anna Rossi', age: 11 },
    ];
    const result = maskPiiFields(input) as Array<Record<string, unknown>>;
    expect(result[0].name).toBe('L. M.');
    expect(result[0].age).toBe(10);
    expect(result[1].name).toBe('A. R.');
    expect(result[1].age).toBe(11);
  });

  it('passes null and undefined through unchanged', () => {
    expect(maskPiiFields(null)).toBeNull();
    expect(maskPiiFields(undefined)).toBeUndefined();
  });

  it('does not mutate the original object', () => {
    const input = { name: 'Luca Müller', email: 'luca@example.com' };
    maskPiiFields(input);
    expect(input.name).toBe('Luca Müller');
    expect(input.email).toBe('luca@example.com');
  });
});
