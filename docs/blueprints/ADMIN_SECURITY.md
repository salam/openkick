# Blueprint: Admin Password Security & PII Gating

> **PRD reference:** Section 4.5.5 (Data & Privacy — zero-trust data exposure)
> **Integration research:** `docs/INTEGRATION_RESEARCH.md` section 7 (HIBP & Password Strength)

---

## 1. Module Overview

OpenKick follows a **zero-trust data exposure** model: all personally identifiable information (PII) — phone numbers, full names, email addresses — is **write-only by default**. PII is accepted on input but masked or omitted on output across every surface: API responses, WhatsApp messages, web UI, and logs.

The single exception is an **admin with a verified strong password**. On every login, the admin's password is evaluated against complexity rules, an entropy estimator (zxcvbn), and the Have I Been Pwned (HIBP) breached-passwords database. If the password passes all checks, the session is granted `piiAccessLevel = 'full'`. If any check fails, the session is downgraded to `piiAccessLevel = 'restricted'` and PII remains masked even for admins.

Non-admin roles (parent, coach) never receive unmasked PII regardless of password strength.

### Design Principles

- **Defence in depth:** Even a compromised admin session with a weak password cannot exfiltrate PII.
- **No PII in the database layer changes:** Masking is applied exclusively at the API serialisation layer. The database stores raw values.
- **Fail open for availability, fail closed for PII:** If the HIBP API is unreachable, the login succeeds (fail open) but PII access is restricted (fail closed). A warning is logged.

---

## 2. Dependencies

### npm packages to install

```bash
npm install @zxcvbn-ts/core @zxcvbn-ts/language-common @zxcvbn-ts/language-en
```

### Built-in (no install needed)

| Module | Purpose |
|--------|---------|
| `node:crypto` | SHA-1 hashing for HIBP k-anonymity |
| `fetch` (global in Node 18+) | HIBP range API calls |

---

## 3. File Structure

All files live under `server/src/`. Existing files that need modification are marked with **(edit)**.

```
server/src/
├── services/
│   └── password-check.service.ts      # NEW — HIBP + zxcvbn + complexity rules
├── middleware/
│   └── pii-gate.middleware.ts          # NEW — Express middleware, masks PII on responses
├── utils/
│   └── pii-mask.ts                    # NEW — Pure functions to mask phone/name/email
├── auth.ts                            # (edit) — call password check on login, set piiAccessLevel on JWT
├── routes/
│   └── players.ts                     # (edit) — guardians & players endpoints go through PII gate
└── index.ts                           # (edit) — initialise zxcvbn at startup
```

Test files (create alongside implementation):

```
server/src/services/__tests__/password-check.test.ts
server/src/middleware/__tests__/pii-gate.test.ts
server/src/utils/__tests__/pii-mask.test.ts
```

---

## 4. Password Check Flow

Run on **every admin login** (`POST /api/guardians/login`). The check runs against the plaintext password before it is discarded.

### 4.1 Sequence

```
Client                     Server                          HIBP API
  |  POST /guardians/login   |                                |
  |------------------------->|                                |
  |                          | 1. Verify email + bcrypt hash  |
  |                          | 2. checkAdminPassword(plain)   |
  |                          |   a. Complexity rules           |
  |                          |   b. zxcvbn(plain)              |
  |                          |   c. SHA-1 → prefix/suffix     |
  |                          |   GET /range/{prefix} --------->|
  |                          |   <--- hash list ---------------|
  |                          |   d. timing-safe suffix compare |
  |                          | 3. Encode piiAccessLevel in JWT |
  |  <--- { token, warnings }|                                |
```

### 4.2 Complexity Rules

| Rule | Requirement |
|------|-------------|
| Minimum length | 12 characters |
| Lowercase letter | At least one `[a-z]` |
| Uppercase letter | At least one `[A-Z]` |
| Digit | At least one `[0-9]` |
| Special character | At least one character not in `[a-zA-Z0-9]` |

### 4.3 zxcvbn Score

- Minimum acceptable score: **3** (out of 4).
- Score 0–2: password is considered weak.
- Include `zResult.feedback.warning` in the reasons array when score < 3.

### 4.4 HIBP Breach Check

See section 9 below for full implementation details.

### 4.5 Outcome

| All checks pass | Any check fails |
|-----------------|-----------------|
| `piiAccessLevel = 'full'` | `piiAccessLevel = 'restricted'` |
| No warnings | `passwordWarnings: string[]` returned to client |

The `piiAccessLevel` is encoded into the JWT payload so it is available on every subsequent request without a database lookup. The JWT payload becomes: `{ id, role, piiAccessLevel }`.

### 4.6 Implementation: `password-check.service.ts`

```typescript
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
    // HIBP API is down — fail open for login, but restrict PII access.
    // The caller handles this by seeing isPwned = false but we log the error.
    console.warn('[password-check] HIBP API unreachable:', err);
    return { isPwned: false, count: -1 }; // count -1 signals "unknown"
  }

  for (const line of body.split('\n')) {
    const [hashSuffix, countStr] = line.split(':');
    const trimmedSuffix = hashSuffix.trim();

    // Timing-safe comparison to prevent side-channel leakage
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
 * Returns an object describing whether the password is acceptable
 * and, if not, the specific reasons.
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
```

**Key detail:** When `pwned.count === -1` (HIBP unreachable), the password is treated as **not acceptable** even if complexity and zxcvbn pass. This ensures PII access is restricted when the breach database cannot be consulted. A warning reason is not added (the admin sees a generic "could not verify password safety" message), but the `acceptable` field is `false`.

---

## 5. PII Masking Rules

### 5.1 Masking Specifications

| Field | Raw value | Masked output | Rule |
|-------|-----------|---------------|------|
| Phone number | `+41 79 123 45 67` | `+41 79 *** ** 67` | Keep country code + area code prefix, show last 2 digits |
| Full name | `Luca Müller` | `L. M.` | Show only initials of each name part |
| Email | `matthias@example.com` | `m***@example.com` | Show first character of local part, mask rest, keep domain |

### 5.2 When Masking Is Applied

- **At the API serialisation layer only.** The database always stores the full unmasked value.
- Masking is applied in the `pii-gate` middleware **after** the route handler has built the response body but **before** it is sent to the client.
- Masking is **not** applied to write operations (POST/PUT request bodies).

### 5.3 Implementation: `pii-mask.ts`

```typescript
/**
 * Pure utility functions for masking PII fields.
 * These never touch the database — they operate on serialised response objects.
 */

/**
 * Mask a phone number: keep country code / area prefix and last 2 digits.
 * Examples:
 *   "+41 79 123 45 67" → "+41 79 *** ** 67"
 *   "+41791234567"     → "+4179*****67"
 */
export function maskPhone(phone: string): string {
  if (!phone) return phone;

  // Strip all whitespace and dashes for uniform processing
  const digits = phone.replace(/[\s\-()]/g, '');

  if (digits.length < 6) return '***';

  // Keep first 4 chars (e.g. "+417") and last 2 digits
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-2);
  const maskedMiddle = '*'.repeat(digits.length - 6);

  // If original had spaces, format with spaces
  if (phone.includes(' ')) {
    return `${phone.split(' ').slice(0, 2).join(' ')} ${'*** **'} ${suffix}`;
  }

  return `${prefix}${maskedMiddle}${suffix}`;
}

/**
 * Mask a full name: show only initials.
 * "Luca Müller" → "L. M."
 * "Anna Maria Rossi" → "A. M. R."
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
 * "a@b.com"              → "a***@b.com"
 */
export function maskEmail(email: string): string {
  if (!email) return email;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const firstChar = local.length > 0 ? local[0] : '';
  return `${firstChar}***@${domain}`;
}

/**
 * The set of field names that contain PII and should be masked.
 */
const PII_FIELDS: Record<string, (value: string) => string> = {
  phone: maskPhone,
  email: maskEmail,
  name: maskName,
};

/**
 * Recursively walk a JSON-serialisable object and mask all PII fields.
 * Works on plain objects and arrays. Returns a new object (does not mutate).
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
```

**Important:** The `name` field masking applies to guardian names (parent/coach names), which are PII. Player names in OpenKick are typically nicknames, not legal names, so they are **not** PII per PRD 4.5.5. If a route returns guardian data nested under `guardians`, those names will be masked. Player `name` fields are also masked for consistency — the implementing agent should add a `nickname` field to the player model if unmasked display names are needed, or exclude `name` from the `PII_FIELDS` map for player objects specifically. **Clarify with the team which player fields count as PII before implementing.**

---

## 6. PII Gate Middleware

### 6.1 Behaviour

The middleware intercepts **every JSON response** on routes that return player or guardian data. It inspects `req.user.piiAccessLevel` (decoded from the JWT) and, if the level is `'restricted'` or absent, runs `maskPiiFields()` on the response body before sending.

### 6.2 Implementation: `pii-gate.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { maskPiiFields } from '../utils/pii-mask.js';

/**
 * Express middleware that intercepts res.json() calls and masks PII
 * when the authenticated user does not have full PII access.
 *
 * Must be registered AFTER authMiddleware (so req.user is populated)
 * and BEFORE route handlers.
 */
export function piiGateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only admin role with piiAccessLevel === 'full' sees unmasked PII
  const user = req.user as
    | { id: number; role: string; piiAccessLevel?: string }
    | undefined;

  const hasFullAccess =
    user?.role === 'admin' && user?.piiAccessLevel === 'full';

  if (hasFullAccess) {
    // Admin with strong password — pass through unmodified
    next();
    return;
  }

  // Override res.json to mask PII before sending
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    const masked = maskPiiFields(body);
    return originalJson(masked);
  };

  next();
}
```

### 6.3 Registration in `index.ts`

```typescript
import { piiGateMiddleware } from './middleware/pii-gate.middleware.js';

// After auth middleware, before route handlers:
app.use('/api/players', authMiddleware, piiGateMiddleware);
app.use('/api/guardians', authMiddleware, piiGateMiddleware);
// ... any other routes that return player/parent data
```

### 6.4 Routes That Must Go Through the PII Gate

| Route | Returns PII? | Gate required? |
|-------|-------------|----------------|
| `GET /api/players` | Player names | Yes |
| `GET /api/players/:id` | Player name + guardian phone/name/email | Yes |
| `GET /api/guardians` | Guardian phone/name/email | Yes |
| `GET /api/guardians/:id` | Guardian phone/name/email + player names | Yes |
| `POST /api/guardians` | Returns created guardian (phone/email) | Yes |
| `GET /api/attendance/*` | May include player names | Yes |
| `GET /api/events/*` | May include participant names | Yes |
| `POST /api/guardians/login` | Returns token only (no PII) | No |
| `GET /api/health` | No PII | No |
| `GET /api/settings` | No PII | No |

---

## 7. Database

**No schema changes required.** PII masking is purely at the API response layer.

The JWT payload gains one new field (`piiAccessLevel: 'full' | 'restricted'`), which is stateless — no database column needed.

If the team later wants to persist password-check audit results (when was the last strong-password login, how many weak-password logins), add a table:

```sql
-- Optional future table, not needed for initial implementation
CREATE TABLE IF NOT EXISTS admin_password_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardianId INTEGER NOT NULL REFERENCES guardians(id),
  checkedAt TEXT NOT NULL DEFAULT (datetime('now')),
  acceptable INTEGER NOT NULL,       -- 0 or 1
  zxcvbnScore INTEGER NOT NULL,
  pwnedCount INTEGER NOT NULL,
  reasons TEXT                        -- JSON array of reason strings
);
```

---

## 8. API Impact

### 8.1 Login Response Change

The `POST /api/guardians/login` response changes from:

```json
{ "token": "eyJ..." }
```

to:

```json
{
  "token": "eyJ...",
  "piiAccessLevel": "restricted",
  "passwordWarnings": [
    "Must be at least 12 characters",
    "Too weak (strength 2/4). This is a top-100 common password."
  ]
}
```

The client should display the warnings and prompt the admin to change their password. The client should **not** block access entirely — the admin can still use the system, but PII is masked.

### 8.2 JWT Payload Change

```typescript
// Before
{ id: number; role: string }

// After
{ id: number; role: string; piiAccessLevel: 'full' | 'restricted' }
```

Update the `Express.Request.user` type declaration in `auth.ts` accordingly:

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string; piiAccessLevel?: 'full' | 'restricted' };
    }
  }
}
```

### 8.3 Auth Module Changes (`auth.ts`)

In the `generateJWT` function, accept and encode `piiAccessLevel`:

```typescript
export function generateJWT(payload: {
  id: number;
  role: string;
  piiAccessLevel?: 'full' | 'restricted';
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}
```

In the `verifyJWT` function, extract it:

```typescript
export function verifyJWT(token: string): {
  id: number;
  role: string;
  piiAccessLevel?: 'full' | 'restricted';
} | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    return {
      id: decoded.id as number,
      role: decoded.role as string,
      piiAccessLevel: decoded.piiAccessLevel as 'full' | 'restricted' | undefined,
    };
  } catch {
    return null;
  }
}
```

### 8.4 Login Route Changes (`routes/players.ts`)

After successful bcrypt verification, add the password check for admin users:

```typescript
import { checkAdminPassword } from '../services/password-check.service.js';

// Inside POST /api/guardians/login handler, after bcrypt verification:

let piiAccessLevel: 'full' | 'restricted' = 'restricted';
let passwordWarnings: string[] = [];

if (guardian.role === 'admin') {
  const check = await checkAdminPassword(password);
  if (check.acceptable) {
    piiAccessLevel = 'full';
  } else {
    passwordWarnings = check.reasons;
  }
}

const token = generateJWT({
  id: guardian.id as number,
  role: guardian.role as string,
  piiAccessLevel,
});

res.json({ token, piiAccessLevel, passwordWarnings });
```

---

## 9. HIBP Implementation Details

### 9.1 k-Anonymity Protocol

1. Compute `SHA-1(password)` and convert to uppercase hex.
2. Split into **prefix** (first 5 hex characters) and **suffix** (remaining 35 characters).
3. `GET https://api.pwnedpasswords.com/range/{prefix}` with header `Add-Padding: true`.
4. The response is a text file with one `SUFFIX:COUNT` pair per line.
5. Compare each suffix in the response against the local suffix using `crypto.timingSafeEqual()`.

### 9.2 Why `Add-Padding: true`

The padding header tells the HIBP API to add dummy entries to the response. This prevents an observer from inferring which prefix was queried based on the response size (a form of traffic analysis). Always include this header.

### 9.3 Why Timing-Safe Comparison

Although the HIBP suffix comparison is not a direct authentication check, using `crypto.timingSafeEqual()` prevents any theoretical timing side-channel that could leak information about which suffixes match. This is a defence-in-depth measure.

### 9.4 Error Handling

| Scenario | Behaviour |
|----------|-----------|
| HIBP API returns non-200 | Log warning, return `{ isPwned: false, count: -1 }` |
| HIBP API times out / network error | Log warning, return `{ isPwned: false, count: -1 }` |
| `count: -1` in result | `checkAdminPassword` treats the password as **not acceptable** |
| HIBP API returns 429 (rate limited) | Same as network error — log and restrict |

The principle: **fail open for authentication** (the admin can still log in) but **fail closed for PII** (access level stays restricted).

---

## 10. zxcvbn Initialisation

Call `zxcvbnOptions.setOptions()` **once** at server startup, before any login request is processed. Place this in `index.ts` or in a dedicated `server/src/startup/zxcvbn-init.ts` module.

```typescript
// In server/src/index.ts — add near the top, before main()

import { zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';

zxcvbnOptions.setOptions({
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommon.dictionary,
    ...zxcvbnEn.dictionary,
  },
});
```

This loads the adjacency graphs (keyboard layout patterns like "qwerty") and the common + English dictionaries (common passwords, English words, surnames, etc.) into the zxcvbn engine. The initialisation is synchronous and takes ~50ms.

---

## 11. Edge Cases

### 11.1 HIBP API Down

- **Login:** Succeeds (fail open). The admin can use the system.
- **PII access:** Restricted (fail closed). `checkAdminPassword` returns `acceptable: false` when `pwnedCount === -1`.
- **Logging:** `console.warn` with the error details. The daily data-protection audit script (`tools/data-protection-audit.sh`) should check whether recent logins had HIBP failures and alert the admin.

### 11.2 Password Changed Mid-Session

The `piiAccessLevel` is baked into the JWT. If an admin changes their password during a session:

- The current JWT remains valid with the old `piiAccessLevel` until it expires.
- On next login (or token refresh), the new password is checked and a new JWT is issued.
- **Recommendation:** When the password-change endpoint is implemented, invalidate the old JWT (add it to a short-lived blocklist or reduce JWT expiry to a shorter window like 1 hour for admin tokens).

### 11.3 zxcvbn Score Boundary

- Score 3 is the **minimum acceptable**. Scores 0, 1, 2 are rejected.
- Score 4 is the maximum. There is no special treatment for score 4 vs 3.
- The zxcvbn feedback (`warning` and `suggestions` fields) should be forwarded to the admin to help them choose a stronger password.

### 11.4 Timing-Safe Comparison for HIBP

The `crypto.timingSafeEqual()` call requires both buffers to be the same length. Since all HIBP suffixes are exactly 35 hex characters, this is guaranteed — but the code checks `trimmedSuffix.length === suffix.length` as a guard before calling `timingSafeEqual`.

### 11.5 Non-Admin Login

For non-admin roles (parent, coach), the password check is **skipped entirely**. Their `piiAccessLevel` is always `'restricted'` (or absent from the JWT, which the middleware treats the same way). Parents authenticate via access tokens, not passwords, so the check does not apply to them.

### 11.6 First-Time Admin Setup

During initial setup, the first admin creates their account. The password check runs immediately on the first login. If the admin chooses a weak password during account creation, they can still log in and use the system, but all PII is masked. The login response includes `passwordWarnings` to prompt them to choose a stronger password.

---

## 12. Test Plan

### Unit Tests

| Test file | Covers |
|-----------|--------|
| `password-check.test.ts` | Complexity rules (all 5 individually), zxcvbn scoring, HIBP mock (pwned / not pwned / API down), full `checkAdminPassword` integration |
| `pii-mask.test.ts` | `maskPhone` (with/without spaces, short numbers), `maskName` (single/multi-part, empty), `maskEmail` (normal, single-char local, missing @), `maskPiiFields` (nested objects, arrays, null) |
| `pii-gate.test.ts` | Middleware with full access (pass-through), restricted access (masked), no user (masked), non-admin role (masked) |

### Integration Tests

| Scenario | Expected |
|----------|----------|
| Admin login with strong password → GET /api/guardians | Full PII visible |
| Admin login with weak password → GET /api/guardians | PII masked |
| Coach login → GET /api/guardians | PII masked |
| Parent token auth → GET /api/players/:id | PII masked |
| HIBP API mocked as down → admin login | Login succeeds, PII restricted |

---

## 13. Implementation Checklist

1. [ ] Install npm dependencies (`@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`, `@zxcvbn-ts/language-en`)
2. [ ] Create `server/src/utils/pii-mask.ts` with mask functions
3. [ ] Create `server/src/utils/__tests__/pii-mask.test.ts`
4. [ ] Create `server/src/services/password-check.service.ts`
5. [ ] Create `server/src/services/__tests__/password-check.test.ts`
6. [ ] Create `server/src/middleware/pii-gate.middleware.ts`
7. [ ] Create `server/src/middleware/__tests__/pii-gate.test.ts`
8. [ ] Update `server/src/auth.ts` — expand JWT payload with `piiAccessLevel`, update `Request.user` type
9. [ ] Update `server/src/routes/players.ts` — call `checkAdminPassword` in login route
10. [ ] Update `server/src/index.ts` — add zxcvbn initialisation, register piiGateMiddleware on relevant routes
11. [ ] Run `npx tsc --noEmit` to verify type correctness
12. [ ] Run `npx vitest run` to verify all tests pass
13. [ ] Manual test: login as admin with weak password, confirm PII is masked in API responses
14. [ ] Manual test: login as admin with strong password, confirm PII is visible
