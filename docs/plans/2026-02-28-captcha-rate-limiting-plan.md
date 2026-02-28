# Captcha & Rate Limiting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Altcha proof-of-work captcha and express-rate-limit to protect login and attendance endpoints from bot abuse.

**Architecture:** Three-tier rate limiting (general, auth, mutation) applied as Express middleware. Altcha captcha with pluggable provider interface protects login and attendance POST endpoints. HMAC secret auto-generated and stored in settings table.

**Tech Stack:** altcha-lib (server), altcha (client widget), express-rate-limit, Express.js, Vitest, Next.js/React

---

### Task 1: Install server dependencies

**Files:**
- Modify: `server/package.json`

**Step 1: Install packages**

Run: `cd server && npm install express-rate-limit altcha-lib`

**Step 2: Verify build**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

Commit `server/package.json` and `server/package-lock.json` with message: `feat: add express-rate-limit and altcha-lib dependencies`

---

### Task 2: Rate limiter middleware — tests

**Files:**
- Create: `server/src/__tests__/rateLimiter.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import express from "express";
import { generalLimiter, authLimiter, mutationLimiter } from "../middleware/rateLimiter.js";

function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use(limiter);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  app.post("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

async function fetchApp(app: express.Express, method: string, path: string) {
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, { method });
      const body = await res.json();
      server.close();
      resolve({ status: res.status, body });
    });
  });
}

describe("generalLimiter", () => {
  it("allows requests under the limit", async () => {
    const app = buildApp(generalLimiter);
    const res = await fetchApp(app, "GET", "/test");
    expect(res.status).toBe(200);
  });
});

describe("authLimiter", () => {
  it("returns 429 after exceeding 10 requests", async () => {
    const app = buildApp(authLimiter);
    let lastStatus = 200;
    for (let i = 0; i < 12; i++) {
      const res = await fetchApp(app, "GET", "/test");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe("mutationLimiter", () => {
  it("returns 429 after exceeding 30 requests", async () => {
    const app = buildApp(mutationLimiter);
    let lastStatus = 200;
    for (let i = 0; i < 32; i++) {
      const res = await fetchApp(app, "POST", "/test");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/rateLimiter.test.ts`
Expected: FAIL — cannot find module `../middleware/rateLimiter.js`

---

### Task 3: Rate limiter middleware — implementation

**Files:**
- Create: `server/src/middleware/rateLimiter.ts`

**Step 1: Implement the three rate limiters**

```typescript
import { rateLimit } from "express-rate-limit";

// General: 100 requests per 15 minutes for all /api/* routes
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Auth: 10 requests per 15 minutes for login endpoint
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

// Mutation: 30 requests per 15 minutes for POST/PUT/DELETE
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
```

**Step 2: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/rateLimiter.test.ts`
Expected: PASS

**Step 3: Verify build**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

Commit `server/src/middleware/rateLimiter.ts` and `server/src/__tests__/rateLimiter.test.ts` with message: `feat: add rate limiter middleware with three tiers`

---

### Task 4: Captcha provider — tests

**Files:**
- Create: `server/src/__tests__/captcha.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { AltchaCaptchaProvider } from "../middleware/captcha.js";

const HMAC_KEY = "test-hmac-secret-key-for-testing";

describe("AltchaCaptchaProvider", () => {
  const provider = new AltchaCaptchaProvider(HMAC_KEY);

  it("generateChallenge returns a challenge object", async () => {
    const challenge = await provider.generateChallenge();
    expect(challenge).toBeDefined();
    expect(challenge).toHaveProperty("algorithm");
    expect(challenge).toHaveProperty("challenge");
    expect(challenge).toHaveProperty("salt");
    expect(challenge).toHaveProperty("signature");
  });

  it("verifySolution returns false for invalid payload", async () => {
    const result = await provider.verifySolution("invalid-base64-payload");
    expect(result).toBe(false);
  });

  it("verifySolution returns false for empty string", async () => {
    const result = await provider.verifySolution("");
    expect(result).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/captcha.test.ts`
Expected: FAIL — cannot find module `../middleware/captcha.js`

---

### Task 5: Captcha provider — implementation

**Files:**
- Create: `server/src/middleware/captcha.ts`

**Step 1: Implement CaptchaProvider interface and AltchaCaptchaProvider**

```typescript
import { createChallenge, verifySolution } from "altcha-lib";
import type { Request, Response, NextFunction } from "express";

export interface CaptchaChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  maxnumber?: number;
}

export interface CaptchaProvider {
  generateChallenge(): Promise<CaptchaChallenge>;
  verifySolution(payload: string): Promise<boolean>;
}

export class AltchaCaptchaProvider implements CaptchaProvider {
  constructor(private hmacKey: string) {}

  async generateChallenge(): Promise<CaptchaChallenge> {
    const challenge = await createChallenge({
      hmacKey: this.hmacKey,
      maxNumber: 100000,
    });
    return challenge as CaptchaChallenge;
  }

  async verifySolution(payload: string): Promise<boolean> {
    try {
      const ok = await verifySolution(payload, this.hmacKey);
      return ok;
    } catch {
      return false;
    }
  }
}

// Middleware factory: verifies captcha from req.body.captcha
export function verifyCaptchaMiddleware(provider: CaptchaProvider) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const payload = req.body?.captcha;
    if (!payload || typeof payload !== "string") {
      res.status(400).json({ error: "Captcha verification required" });
      return;
    }

    const valid = await provider.verifySolution(payload);
    if (!valid) {
      res.status(403).json({ error: "Captcha verification failed" });
      return;
    }

    next();
  };
}
```

**Step 2: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/captcha.test.ts`
Expected: PASS

**Step 3: Verify build**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

Commit `server/src/middleware/captcha.ts` and `server/src/__tests__/captcha.test.ts` with message: `feat: add captcha provider interface and Altcha implementation`

---

### Task 6: Captcha challenge route

**Files:**
- Create: `server/src/routes/captcha.ts`

**Step 1: Implement the challenge endpoint**

```typescript
import { Router, type Request, type Response } from "express";
import type { CaptchaProvider } from "../middleware/captcha.js";

export function captchaRouter(provider: CaptchaProvider): Router {
  const router = Router();

  // GET /api/captcha/challenge — generate a fresh challenge
  router.get("/captcha/challenge", async (_req: Request, res: Response) => {
    try {
      const challenge = await provider.generateChallenge();
      res.json(challenge);
    } catch {
      res.status(500).json({ error: "Failed to generate captcha challenge" });
    }
  });

  return router;
}
```

**Step 2: Verify build**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

Commit `server/src/routes/captcha.ts` with message: `feat: add captcha challenge endpoint`

---

### Task 7: Wire middleware into index.ts

**Files:**
- Modify: `server/src/index.ts`

**Step 1: Import and apply rate limiters and captcha**

Add imports at top of `server/src/index.ts`:

```typescript
import crypto from "node:crypto";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { AltchaCaptchaProvider, verifyCaptchaMiddleware } from "./middleware/captcha.js";
import { captchaRouter } from "./routes/captcha.js";
```

Inside `main()`, after `await initDB(DB_PATH)`, initialize the captcha provider:

```typescript
const { getDB } = await import("./database.js");
const db = getDB();
let hmacKeyResult = db.exec("SELECT value FROM settings WHERE key = 'captcha_hmac_secret'");
let hmacKey: string;
if (hmacKeyResult.length === 0 || hmacKeyResult[0].values.length === 0) {
  hmacKey = crypto.randomBytes(32).toString("hex");
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["captcha_hmac_secret", hmacKey]);
} else {
  hmacKey = hmacKeyResult[0].values[0][0] as string;
}
const captchaProvider = new AltchaCaptchaProvider(hmacKey);
```

Apply general rate limiter before all routes (add before existing `app.use("/api", ...)` lines):

```typescript
app.use("/api", generalLimiter);
```

Add captcha verification on protected POST endpoints (before routers):

```typescript
app.post("/api/guardians/login", verifyCaptchaMiddleware(captchaProvider));
app.post("/api/attendance", verifyCaptchaMiddleware(captchaProvider));
```

Register captcha router:

```typescript
app.use("/api", captchaRouter(captchaProvider));
```

**Step 2: Verify build**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

Commit `server/src/index.ts` with message: `feat: wire rate limiting and captcha into Express app`

---

### Task 8: Apply auth limiter to login, mutation limiter to attendance

**Files:**
- Modify: `server/src/routes/players.ts` (login route lives here at line 276)
- Modify: `server/src/routes/attendance.ts`

**Step 1: Add auth rate limiter to login**

At top of `server/src/routes/players.ts`, add:

```typescript
import { authLimiter } from "../middleware/rateLimiter.js";
```

Change line 276 from:

```typescript
playersRouter.post("/guardians/login", async (req: Request, res: Response) => {
```

To:

```typescript
playersRouter.post("/guardians/login", authLimiter, async (req: Request, res: Response) => {
```

**Step 2: Add mutation rate limiter to attendance POST**

At top of `server/src/routes/attendance.ts`, add:

```typescript
import { mutationLimiter } from "../middleware/rateLimiter.js";
```

Change line 11 from:

```typescript
attendanceRouter.post("/attendance", (req: Request, res: Response) => {
```

To:

```typescript
attendanceRouter.post("/attendance", mutationLimiter, (req: Request, res: Response) => {
```

**Step 3: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

Commit `server/src/routes/players.ts` and `server/src/routes/attendance.ts` with message: `feat: apply auth and mutation rate limiters to login and attendance`

---

### Task 9: Install frontend Altcha widget

**Files:**
- Modify: `web/package.json`

**Step 1: Install altcha widget**

Run: `cd web && npm install altcha`

**Step 2: Commit**

Commit `web/package.json` and `web/package-lock.json` with message: `feat: add altcha widget dependency to frontend`

---

### Task 10: Create reusable AltchaWidget React component

**Files:**
- Create: `web/src/components/AltchaWidget.tsx`
- Create: `web/src/types/altcha.d.ts`

**Step 1: Create type declarations for altcha custom element**

```typescript
// web/src/types/altcha.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'altcha-widget': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        challengeurl?: string;
        hidefooter?: boolean;
      },
      HTMLElement
    >;
  }
}
```

**Step 2: Create the component**

```tsx
// web/src/components/AltchaWidget.tsx
'use client';

import { useEffect, useRef } from 'react';
import 'altcha';

interface AltchaWidgetProps {
  onVerify: (payload: string) => void;
  challengeUrl?: string;
}

export default function AltchaWidget({
  onVerify,
  challengeUrl,
}: AltchaWidgetProps) {
  const widgetRef = useRef<HTMLElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const url = challengeUrl || `${apiUrl}/api/captcha/challenge`;

  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;

    const handleVerify = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.payload) {
        onVerify(detail.payload);
      }
    };

    el.addEventListener('verification', handleVerify);
    return () => el.removeEventListener('verification', handleVerify);
  }, [onVerify]);

  return (
    <altcha-widget
      ref={widgetRef}
      challengeurl={url}
      hidefooter
    />
  );
}
```

**Step 3: Verify build**

Run: `cd web && npx next build`
Expected: No errors

**Step 4: Commit**

Commit `web/src/components/AltchaWidget.tsx` and `web/src/types/altcha.d.ts` with message: `feat: add reusable AltchaWidget React component`

---

### Task 11: Integrate captcha into login page

**Files:**
- Modify: `web/src/app/login/page.tsx`

**Step 1: Add Altcha widget to login form**

Add import:

```tsx
import AltchaWidget from '@/components/AltchaWidget';
```

Add state for captcha payload:

```tsx
const [captchaPayload, setCaptchaPayload] = useState('');
```

Add widget before the submit button in the form JSX:

```tsx
<div className="mb-4">
  <AltchaWidget onVerify={setCaptchaPayload} />
</div>
```

Modify `handleSubmit` to include captcha in the request body:

```tsx
body: JSON.stringify({ email, password, captcha: captchaPayload }),
```

Disable submit button until captcha is solved:

```tsx
disabled={loading || !captchaPayload}
```

**Step 2: Verify build**

Run: `cd web && npx next build`
Expected: No errors

**Step 3: Commit**

Commit `web/src/app/login/page.tsx` with message: `feat: integrate Altcha captcha into login page`

---

### Task 12: Integrate captcha into event attendance page

**Files:**
- Modify: `web/src/app/events/[id]/EventDetailClient.tsx`

**Step 1: Add Altcha widget to attendance response section**

Find the section where attendance is set (the POST to `/api/attendance`) and:
1. Import and add `AltchaWidget` with `onVerify` state
2. Include `captcha` field in the POST body
3. Disable attendance buttons until captcha is solved

**Step 2: Verify build**

Run: `cd web && npx next build`
Expected: No errors

**Step 3: Commit**

Commit `web/src/app/events/[id]/EventDetailClient.tsx` with message: `feat: integrate Altcha captcha into attendance page`

---

### Task 13: Full integration test and build verification

**Files:** None new

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 2: Verify server TypeScript compilation**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Verify frontend build**

Run: `cd web && npx next build`
Expected: No errors

---

### Task 14: Update documentation and release notes

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`
- Modify: `docs/FAQ.md`

**Step 1: Update FEATURES.md**

Add captcha and rate limiting to the features list.

**Step 2: Update RELEASE_NOTES.md**

Add a new section with:
- Added bot protection with Altcha proof-of-work captcha on login and attendance
- Added rate limiting (100 req/15min general, 10/15min login, 30/15min mutations)
- Captcha is invisible and GDPR-friendly — no tracking cookies

**Step 3: Add FAQ entries**

Add to `docs/FAQ.md`:

**Q: Why do I see a verification step when logging in or responding to attendance?**
A: OpenKick uses an invisible proof-of-work verification to protect against automated bots. It runs automatically in the background — you don't need to do anything. If it takes more than a few seconds, try refreshing the page.

**Q: Does the captcha track me?**
A: No. OpenKick uses Altcha, a self-hosted, privacy-friendly captcha that doesn't use cookies or send data to third parties.

**Step 4: Commit docs**

Commit `FEATURES.md`, `RELEASE_NOTES.md`, and `docs/FAQ.md` with message: `docs: update features, release notes, and FAQ for captcha & rate limiting`
