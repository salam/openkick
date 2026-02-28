# Design: Captcha & Rate Limiting for Bot Protection

**Date:** 2026-02-28
**Status:** Approved

## Problem

The app will be public-facing. Currently no rate limiting or bot protection exists.
Login and attendance endpoints are vulnerable to brute-force and automated manipulation.

## Threat Model

- Primary threat: bots abusing public-facing forms (login, attendance responses)
- Secondary: programmatic abuse of mutation endpoints

## Solution Overview

1. **Rate limiting** via `express-rate-limit` (three tiers)
2. **Captcha** via Altcha (self-hosted proof-of-work, invisible to users)
3. **Pluggable architecture** for future captcha providers (hCaptcha, Friendly Captcha)

## Rate Limiting

Three tiers applied as Express middleware:

| Tier       | Window | Max Requests | Applied To                    |
|------------|--------|-------------|-------------------------------|
| General    | 15 min | 100         | All `/api/*` routes           |
| Auth       | 15 min | 10          | `POST /guardians/login`       |
| Mutation   | 15 min | 30          | All POST/PUT/DELETE endpoints |

- In-memory store (sufficient for single-server SQLite app)
- Returns `429 Too Many Requests` with `Retry-After` header
- File: `server/src/middleware/rateLimiter.ts`

## Captcha: Altcha Proof-of-Work

### Flow

1. Client requests challenge: `GET /api/captcha/challenge`
2. Server generates HMAC-based cryptographic challenge with configurable difficulty
3. Altcha widget auto-solves proof-of-work (invisible to user)
4. Client submits solution alongside form data in `captcha` field
5. Server middleware `verifyCaptcha` validates solution before processing

### Server Components

- **Route:** `GET /api/captcha/challenge` — generates challenge (rate-limited: 20/15min)
- **Middleware:** `verifyCaptcha` — validates `captcha` field from request body
- **HMAC secret:** Auto-generated on first run, stored in settings (`captcha_hmac_secret`)
- **Challenge expiry:** 5 minutes (prevents replay attacks)

### Protected Endpoints

- `POST /guardians/login`
- `POST /api/attendance`

### Pluggable Provider Architecture

```typescript
interface CaptchaProvider {
  generateChallenge(): Promise<CaptchaChallenge>;
  verifySolution(payload: string): Promise<boolean>;
}
```

- Default: `AltchaCaptchaProvider`
- Settings key: `captcha_provider` (default: `altcha`)
- Future: `HCaptchaCaptchaProvider`, `FriendlyCaptchaProvider`

## Frontend Integration

- Add `altcha` npm package (widget, ~15KB)
- Embed `<altcha-widget>` in login form and attendance response page
- Widget fetches challenge from `/api/captcha/challenge`
- On solve, populates hidden field; value sent as `captcha` in POST body

## Dependencies

| Package             | Purpose                          | Size   |
|---------------------|----------------------------------|--------|
| `altcha-lib`        | Server: challenge gen & verify   | ~8KB   |
| `altcha`            | Client: proof-of-work widget     | ~15KB  |
| `express-rate-limit` | Rate limiting middleware         | ~12KB  |

## Files to Create/Modify

### New Files
- `server/src/middleware/rateLimiter.ts` — rate limit middleware (3 tiers)
- `server/src/middleware/captcha.ts` — captcha provider interface + Altcha implementation
- `server/src/routes/captcha.ts` — challenge endpoint
- `server/src/__tests__/rateLimiter.test.ts` — rate limiter tests
- `server/src/__tests__/captcha.test.ts` — captcha challenge/verify tests

### Modified Files
- `server/package.json` — add dependencies
- `server/src/index.ts` — register rate limit middleware + captcha routes
- `server/src/routes/players.ts` — apply mutation rate limiter
- `server/src/routes/events.ts` — apply mutation rate limiter
- `server/src/routes/attendance.ts` — apply mutation rate limiter + captcha on POST
- `server/src/routes/guardians.ts` — apply auth rate limiter + captcha on login
- Client attendance page — add Altcha widget
- Client login page — add Altcha widget

## Testing Strategy

- Unit tests for rate limiter (verify 429 after threshold)
- Unit tests for captcha challenge generation and verification
- Unit tests for replay attack prevention (expired challenges)
- Integration test: protected endpoint rejects requests without valid captcha
- Integration test: protected endpoint accepts requests with valid captcha
