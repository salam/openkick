/**
 * Mask a phone number: keep country code / area prefix and last 2 digits.
 * "+41 79 123 45 67" → "+41 79 *** ** 67"
 * "+41791234567"     → "+4179*****67"
 */
export function maskPhone(phone: string): string {
  if (!phone) return phone;
  const digits = phone.replace(/[\s\-()]/g, '');
  if (digits.length < 6) return '***';
  const prefix = digits.slice(0, 5);
  const suffix = digits.slice(-2);
  const maskedMiddle = '*'.repeat(digits.length - 7);
  if (phone.includes(' ')) {
    return `${phone.split(' ').slice(0, 2).join(' ')} ${'*** **'} ${suffix}`;
  }
  return `${prefix}${maskedMiddle}${suffix}`;
}

/**
 * Mask a full name: show only initials.
 * "Luca Müller" → "L. M."
 */
export function maskName(name: string): string {
  if (!name) return name;
  return name
    .split(/\s+/)
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}.` : ''))
    .join(' ');
}

/**
 * Mask an email: show first char of local part, mask rest, keep domain.
 * "matthias@example.com" → "m***@example.com"
 */
export function maskEmail(email: string): string {
  if (!email) return email;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const firstChar = local.length > 0 ? local[0] : '';
  return `${firstChar}***@${domain}`;
}

const PII_FIELDS: Record<string, (value: string) => string> = {
  phone: maskPhone,
  email: maskEmail,
  name: maskName,
};

/**
 * Recursively walk a JSON-serialisable object and mask all PII fields.
 * Returns a new object (does not mutate).
 */
export function maskPiiFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(maskPiiFields);
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key in PII_FIELDS && typeof value === 'string') {
        result[key] = PII_FIELDS[key](value);
      } else if (typeof value === 'object') {
        result[key] = maskPiiFields(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}
