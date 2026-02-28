# Dynamic Club Branding, Meta Tags, Favicon & Security.txt — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded "OpenKick" branding with dynamic club settings, generate favicons from uploaded logos, add configurable OG/Twitter meta tags, and serve a dynamic security.txt from structured settings.

**Architecture:** Client-side hook (`useClubSettings`) fetches settings from `GET /api/settings` with localStorage cache for instant rendering. Server generates favicon variants via `sharp` on logo upload. Security.txt is dynamically rendered by a new Express route. All new config fields are stored in the existing `settings` table.

**Tech Stack:** React hooks, sharp (server-side image processing), Express routes, Tailwind CSS v4, vitest

---

### Task 1: Add `sharp` and `png-to-ico` to server dependencies

**Files:**
- Modify: `server/package.json`

**Step 1: Install sharp and png-to-ico**

Run: `cd server && npm install sharp png-to-ico && cd ..`

**Step 2: Commit**

Commit `server/package.json` and `server/package-lock.json` with message: `feat: add sharp and png-to-ico for favicon generation`

---

### Task 2: Add new default settings to database seed

**Files:**
- Modify: `server/src/database.ts:273-289` (the `DEFAULT_SETTINGS` object)

**Step 1: Add new keys to DEFAULT_SETTINGS**

Add these entries to the `DEFAULT_SETTINGS` object at `server/src/database.ts:273`:

```typescript
const DEFAULT_SETTINGS: Record<string, string> = {
  // ... existing keys unchanged ...
  // SEO & Social Media
  og_title: "",
  og_description: "",
  og_image: "",
  twitter_title: "",
  twitter_description: "",
  twitter_handle: "",
  meta_keywords: "",
  // Security contact
  security_contact_email: "",
  security_contact_url: "",
  security_pgp_key_url: "",
  security_policy_url: "",
  security_acknowledgments_url: "",
  security_preferred_languages: "en, de",
  security_canonical_url: "",
};
```

**Step 2: Commit**

Commit `server/src/database.ts` with message: `feat: add SEO, social media, and security.txt default settings`

---

### Task 3: Generate favicon variants on logo upload

**Files:**
- Modify: `server/src/routes/settings.ts:60-95` (the `upload-logo` endpoint)

**Step 1: Write the failing test**

Create `server/src/routes/__tests__/favicon-generation.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { initDB, getDB } from "../../database.js";
import { settingsRouter } from "../settings.js";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use("/api", settingsRouter);

describe("Favicon generation on logo upload", () => {
  let port: number;
  let server: ReturnType<typeof app.listen>;
  const uploadDir = path.resolve(__dirname, "../../../../public/uploads");

  beforeEach(async () => {
    await initDB(); // in-memory
    server = app.listen(0);
    port = (server.address() as any).port;
  });

  afterEach(() => {
    server.close();
    // Clean up generated files
    for (const f of [
      "club-logo.png", "favicon.ico", "favicon-16x16.png",
      "favicon-32x32.png", "apple-touch-icon.png",
      "android-chrome-192x192.png", "android-chrome-512x512.png",
      "site.webmanifest",
    ]) {
      const p = path.join(uploadDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it("generates favicon variants when logo is uploaded", async () => {
    // Create a tiny 64x64 red PNG
    const sharp = (await import("sharp")).default;
    const pngBuffer = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const base64 = pngBuffer.toString("base64");

    const res = await fetch(`http://localhost:${port}/api/settings/upload-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: base64, filename: "logo.png" }),
    });

    expect(res.status).toBe(200);

    // Check that favicon files were generated
    expect(fs.existsSync(path.join(uploadDir, "favicon-32x32.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "favicon-16x16.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "apple-touch-icon.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "android-chrome-192x192.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "android-chrome-512x512.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "favicon.ico"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "site.webmanifest"))).toBe(true);

    // Verify webmanifest content
    const manifest = JSON.parse(fs.readFileSync(path.join(uploadDir, "site.webmanifest"), "utf-8"));
    expect(manifest.icons).toHaveLength(2);
    expect(manifest.icons[0].sizes).toBe("192x192");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/favicon-generation.test.ts`
Expected: FAIL — no favicon files generated (current upload-logo doesn't generate them)

**Step 3: Implement favicon generation in upload-logo**

Modify `server/src/routes/settings.ts`. Add imports at top:

```typescript
import sharp from "sharp";
import pngToIco from "png-to-ico";
```

After saving the original logo file (after line 88 `fs.writeFileSync`), add favicon generation:

```typescript
  // Generate favicon variants from the uploaded logo
  try {
    const logoBuffer = fs.readFileSync(path.join(uploadDir, savedName));
    const sharpInput = sharp(logoBuffer);

    await Promise.all([
      sharpInput.clone().resize(16, 16).png().toFile(path.join(uploadDir, "favicon-16x16.png")),
      sharpInput.clone().resize(32, 32).png().toFile(path.join(uploadDir, "favicon-32x32.png")),
      sharpInput.clone().resize(180, 180).png().toFile(path.join(uploadDir, "apple-touch-icon.png")),
      sharpInput.clone().resize(192, 192).png().toFile(path.join(uploadDir, "android-chrome-192x192.png")),
      sharpInput.clone().resize(512, 512).png().toFile(path.join(uploadDir, "android-chrome-512x512.png")),
    ]);

    // Generate ICO from 32x32 PNG
    const icoBuffer = await pngToIco(path.join(uploadDir, "favicon-32x32.png"));
    fs.writeFileSync(path.join(uploadDir, "favicon.ico"), icoBuffer);

    // Generate site.webmanifest
    const manifest = {
      name: "",
      short_name: "",
      icons: [
        { src: "/uploads/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/uploads/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: "#10b981",
      background_color: "#ffffff",
      display: "standalone",
    };
    fs.writeFileSync(path.join(uploadDir, "site.webmanifest"), JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error("Favicon generation failed:", err);
    // Non-fatal: logo was saved but favicons weren't generated
  }
```

The handler must become `async` since sharp and pngToIco are async.

Also update the `remove-logo` handler to clean up favicon files — after unlinking the logo file add:

```typescript
  // Clean up favicon files
  for (const f of [
    "favicon.ico", "favicon-16x16.png", "favicon-32x32.png",
    "apple-touch-icon.png", "android-chrome-192x192.png",
    "android-chrome-512x512.png", "site.webmanifest",
  ]) {
    const fp = path.join(path.resolve(__dirname, "../../../public/uploads"), f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/favicon-generation.test.ts`
Expected: PASS

**Step 5: Commit**

Commit `server/src/routes/settings.ts` and `server/src/routes/__tests__/favicon-generation.test.ts` with message: `feat: generate favicon variants on logo upload`

---

### Task 4: Dynamic security.txt endpoint

**Files:**
- Create: `server/src/routes/security-txt.ts`
- Modify: `server/src/index.ts` (mount the new route)

**Step 1: Write the failing test**

Create `server/src/routes/__tests__/security-txt.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { initDB, getDB } from "../../database.js";
import { securityTxtRouter } from "../security-txt.js";

const app = express();
app.use(express.json());
app.use(securityTxtRouter);

describe("GET /.well-known/security.txt", () => {
  let port: number;
  let server: ReturnType<typeof app.listen>;

  beforeEach(async () => {
    await initDB();
    server = app.listen(0);
    port = (server.address() as any).port;
  });

  afterEach(() => { server.close(); });

  it("returns RFC 9116 compliant security.txt with defaults", async () => {
    const res = await fetch(`http://localhost:${port}/.well-known/security.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("Contact: https://github.com/mho/openkick/security/advisories/new");
    expect(body).toContain("Expires:");
    expect(body).toContain("Preferred-Languages: en, de");
  });

  it("includes club owner contacts from settings", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["security_contact_email", "security@myclub.com"]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["security_contact_url", "https://myclub.com/security"]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["security_policy_url", "https://myclub.com/policy"]);

    const res = await fetch(`http://localhost:${port}/.well-known/security.txt`);
    const body = await res.text();
    expect(body).toContain("Contact: mailto:security@myclub.com");
    expect(body).toContain("Contact: https://myclub.com/security");
    expect(body).toContain("Policy: https://myclub.com/policy");
  });

  it("omits empty optional fields", async () => {
    const res = await fetch(`http://localhost:${port}/.well-known/security.txt`);
    const body = await res.text();
    expect(body).not.toContain("Encryption:");
    expect(body).not.toContain("Policy:");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/security-txt.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the security-txt route**

Create `server/src/routes/security-txt.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";

export const securityTxtRouter = Router();

function getSetting(key: string): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  return (result[0]?.values[0]?.[0] as string) || "";
}

securityTxtRouter.get("/.well-known/security.txt", (_req: Request, res: Response) => {
  const lines: string[] = [
    "# Security Policy",
    "# This file is dynamically generated. See https://securitytxt.org/",
    "",
  ];

  // Club owner contacts
  const email = getSetting("security_contact_email");
  const url = getSetting("security_contact_url");
  if (email) lines.push(`Contact: mailto:${email}`);
  if (url) lines.push(`Contact: ${url}`);

  // Open-source project contact (always included)
  lines.push("Contact: https://github.com/mho/openkick/security/advisories/new");

  // Expires: 1 year from now
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  lines.push(`Expires: ${expires.toISOString()}`);

  // Optional fields
  const pgp = getSetting("security_pgp_key_url");
  if (pgp) lines.push(`Encryption: ${pgp}`);

  const ack = getSetting("security_acknowledgments_url");
  if (ack) lines.push(`Acknowledgments: ${ack}`);

  const langs = getSetting("security_preferred_languages") || "en, de";
  lines.push(`Preferred-Languages: ${langs}`);

  const canonical = getSetting("security_canonical_url");
  if (canonical) lines.push(`Canonical: ${canonical}`);

  const policy = getSetting("security_policy_url");
  if (policy) lines.push(`Policy: ${policy}`);

  lines.push("");
  res.set("Content-Type", "text/plain; charset=utf-8").send(lines.join("\n"));
});
```

**Step 4: Mount the route in index.ts**

In `server/src/index.ts`, import and mount the router BEFORE the static middleware so it takes priority over the static file:

```typescript
import { securityTxtRouter } from "./routes/security-txt.js";
app.use(securityTxtRouter);
```

**Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/security-txt.test.ts`
Expected: PASS

**Step 6: Commit**

Commit `server/src/routes/security-txt.ts`, `server/src/routes/__tests__/security-txt.test.ts`, and `server/src/index.ts` with message: `feat: dynamic security.txt endpoint from settings`

---

### Task 5: Create `useClubSettings` hook

**Files:**
- Create: `web/src/hooks/useClubSettings.ts`

**Step 1: Write the hook**

Create `web/src/hooks/useClubSettings.ts`:

```typescript
'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const CACHE_KEY = 'openkick_club_settings';

interface ClubSettings {
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

export function useClubSettings(): ClubSettings {
  const [settings, setSettings] = useState<ClubSettings>(() => {
    if (typeof window === 'undefined') return DEFAULTS;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return { ...DEFAULTS, ...JSON.parse(cached) };
    } catch { /* ignore */ }
    return DEFAULTS;
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/settings`)
      .then((r) => r.json())
      .then((all: Record<string, string>) => {
        if (cancelled) return;
        const next: ClubSettings = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS) as (keyof ClubSettings)[]) {
          if (all[k]) next[k] = all[k];
        }
        setSettings(next);
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      })
      .catch(() => { /* use cached or defaults */ });
    return () => { cancelled = true; };
  }, []);

  return settings;
}
```

**Step 2: Commit**

Commit `web/src/hooks/useClubSettings.ts` with message: `feat: add useClubSettings hook with localStorage cache`

---

### Task 6: Dynamic homepage branding

**Files:**
- Modify: `web/src/app/page.tsx`

**Step 1: Convert to client component and use the hook**

Replace `web/src/app/page.tsx` content:

```tsx
'use client';

import Link from 'next/link';
import SubscribeCard from '@/components/SubscribeCard';
import TournamentWidget from '@/components/TournamentWidget';
import { useClubSettings } from '@/hooks/useClubSettings';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const { club_name, club_description, club_logo } = useClubSettings();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {club_logo ? (
        <img src={`${API_URL}${club_logo}`} alt={club_name} className="h-20 w-20 rounded-full object-cover" />
      ) : null}
      <h1 className="text-4xl font-bold">{club_name}</h1>
      <p className="text-lg text-gray-600">{club_description}</p>

      <div className="flex gap-4">
        <Link href="/login/" className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600">
          Login
        </Link>
        <Link href="/dashboard/" className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          Dashboard
        </Link>
      </div>

      <TournamentWidget />
      <SubscribeCard />
    </main>
  );
}
```

**Step 2: Commit**

Commit `web/src/app/page.tsx` with message: `feat: dynamic homepage branding from club settings`

---

### Task 7: Dynamic meta tags and favicon links

**Files:**
- Create: `web/src/components/DynamicHead.tsx`
- Modify: `web/src/app/layout.tsx`

**Step 1: Create DynamicHead component**

Create `web/src/components/DynamicHead.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useClubSettings } from '@/hooks/useClubSettings';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function setMeta(property: string, content: string, attr = 'property') {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string, extra?: Record<string, string>) {
  if (!href) return;
  const selector = extra?.sizes ? `link[rel="${rel}"][sizes="${extra.sizes}"]` : `link[rel="${rel}"]`;
  let el = document.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (extra) Object.entries(extra).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.href = href;
}

export default function DynamicHead() {
  const s = useClubSettings();

  useEffect(() => {
    const title = s.og_title || s.club_name || 'OpenKick';
    const description = s.og_description || s.club_description || '';
    const image = s.og_image || (s.club_logo ? `${API_URL}${s.club_logo}` : '');
    const twitterTitle = s.twitter_title || title;
    const twitterDesc = s.twitter_description || description;

    // Page title
    document.title = `${title} - ${s.club_description || 'Youth Football Management'}`;

    // Standard meta
    setMeta('description', description, 'name');
    if (s.meta_keywords) setMeta('keywords', s.meta_keywords, 'name');

    // Open Graph
    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:type', 'website');
    if (image) setMeta('og:image', image);

    // Twitter Card
    setMeta('twitter:card', image ? 'summary_large_image' : 'summary', 'name');
    setMeta('twitter:title', twitterTitle, 'name');
    setMeta('twitter:description', twitterDesc, 'name');
    if (image) setMeta('twitter:image', image, 'name');
    if (s.twitter_handle) setMeta('twitter:site', s.twitter_handle, 'name');

    // Favicon links
    setLink('icon', `${API_URL}/uploads/favicon.ico`);
    setLink('icon', `${API_URL}/uploads/favicon-16x16.png`, { type: 'image/png', sizes: '16x16' });
    setLink('icon', `${API_URL}/uploads/favicon-32x32.png`, { type: 'image/png', sizes: '32x32' });
    setLink('apple-touch-icon', `${API_URL}/uploads/apple-touch-icon.png`, { sizes: '180x180' });
    setLink('manifest', `${API_URL}/uploads/site.webmanifest`);
  }, [s]);

  return null;
}
```

**Step 2: Add DynamicHead to layout.tsx**

Modify `web/src/app/layout.tsx` — add import and render `<DynamicHead />` as first child of `<body>`:

```tsx
import DynamicHead from '@/components/DynamicHead';
```

Inside the body:
```tsx
<body className="flex min-h-screen flex-col bg-white text-gray-900 antialiased">
  <DynamicHead />
  <div className="flex-1">{children}</div>
  <Footer />
</body>
```

**Step 3: Commit**

Commit `web/src/components/DynamicHead.tsx` and `web/src/app/layout.tsx` with message: `feat: dynamic meta tags, OG tags, Twitter cards, and favicon links`

---

### Task 8: Dynamic footer copyright

**Files:**
- Modify: `web/src/components/Footer.tsx`

**Step 1: Update Footer to use club_name**

Add import and use the hook:

```tsx
import { useClubSettings } from '@/hooks/useClubSettings';
```

Inside the component, add: `const { club_name } = useClubSettings();`

Change the copyright line from:
```tsx
<p className="mt-2 text-center text-xs text-gray-400">&copy; {year} OpenKick</p>
```
to:
```tsx
<p className="mt-2 text-center text-xs text-gray-400">&copy; {year} {club_name}</p>
```

**Step 2: Commit**

Commit `web/src/components/Footer.tsx` with message: `feat: dynamic club name in footer copyright`

---

### Task 9: SEO & Social Media settings form and Security Contact settings form

**Files:**
- Create: `web/src/components/settings/SeoSocialForm.tsx`
- Create: `web/src/components/settings/SecurityContactForm.tsx`
- Modify: `web/src/app/settings/page.tsx` (add section + import + keys)

**Step 1: Create SeoSocialForm component**

Create `web/src/components/settings/SeoSocialForm.tsx`:

```tsx
'use client';
import type { SettingsFormProps } from './ClubProfileForm';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

const FIELDS = [
  { key: 'og_title', label: 'OG Title', placeholder: 'Falls back to club name' },
  { key: 'og_description', label: 'OG Description', placeholder: 'Falls back to club description' },
  { key: 'og_image', label: 'OG Image URL', placeholder: 'Falls back to club logo' },
  { key: 'twitter_title', label: 'Twitter/X Title', placeholder: 'Falls back to OG title' },
  { key: 'twitter_description', label: 'Twitter/X Description', placeholder: 'Falls back to OG description' },
  { key: 'twitter_handle', label: 'Twitter/X Handle', placeholder: '@yourclub' },
  { key: 'meta_keywords', label: 'Meta Keywords', placeholder: 'football, youth, club' },
] as const;

export default function SeoSocialForm({ settings, onUpdate }: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">SEO & Social Media</h2>
      <p className="mb-4 text-sm text-gray-500">
        Customize how your site appears in search engines and when shared on social media.
        Empty fields fall back to club profile values.
      </p>
      <div className="space-y-4">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            <input
              type="text"
              className={inputClass}
              value={settings[key] || ''}
              placeholder={placeholder}
              onChange={(e) => onUpdate(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create SecurityContactForm component**

Create `web/src/components/settings/SecurityContactForm.tsx`:

```tsx
'use client';
import type { SettingsFormProps } from './ClubProfileForm';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

const FIELDS = [
  { key: 'security_contact_email', label: 'Security Contact Email', placeholder: 'security@yourclub.com' },
  { key: 'security_contact_url', label: 'Security Contact URL', placeholder: 'https://yourclub.com/security' },
  { key: 'security_pgp_key_url', label: 'PGP Key URL', placeholder: 'https://...' },
  { key: 'security_policy_url', label: 'Security Policy URL', placeholder: 'https://...' },
  { key: 'security_acknowledgments_url', label: 'Acknowledgments URL', placeholder: 'https://...' },
  { key: 'security_preferred_languages', label: 'Preferred Languages', placeholder: 'en, de' },
  { key: 'security_canonical_url', label: 'Canonical URL', placeholder: 'https://yourclub.com/.well-known/security.txt' },
] as const;

export default function SecurityContactForm({ settings, onUpdate }: SettingsFormProps) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">Security Contact</h2>
      <p className="mb-4 text-sm text-gray-500">
        Configure your security.txt file (RFC 9116).
        The open-source project contact is always included automatically.
      </p>
      <div className="space-y-4">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            <input
              type="text"
              className={inputClass}
              value={settings[key] || ''}
              placeholder={placeholder}
              onChange={(e) => onUpdate(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Update settings page to include new forms and keys**

In `web/src/app/settings/page.tsx`:

1. Add imports:
```tsx
import SeoSocialForm from '@/components/settings/SeoSocialForm';
import SecurityContactForm from '@/components/settings/SecurityContactForm';
```

2. Add new keys to `SETTING_KEYS` array:
```typescript
  'og_title', 'og_description', 'og_image',
  'twitter_title', 'twitter_description', 'twitter_handle',
  'meta_keywords',
  'security_contact_email', 'security_contact_url',
  'security_pgp_key_url', 'security_policy_url',
  'security_acknowledgments_url', 'security_preferred_languages',
  'security_canonical_url',
```

3. Add the form components in the JSX, after the Feeds section:
```tsx
<SeoSocialForm settings={settings} onUpdate={handleUpdate} />
<SecurityContactForm settings={settings} onUpdate={handleUpdate} />
```

Where `handleUpdate` is the existing `(key, value) => setSettings(...)` handler already in the page.

**Step 4: Commit**

Commit all three files with message: `feat: add SEO/social media and security contact settings forms`

---

### Task 10: Compile, lint, test, verify

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 2: Build the web app**

Run: `cd web && npm run build`
Expected: Build succeeds without errors

**Step 3: Fix any issues found**

**Step 4: Commit any fixes**

---

### Task 11: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`

**Step 1: Add release notes**

Add to RELEASE_NOTES.md:
- Club name, description, and logo now appear on the homepage instead of hardcoded "OpenKick"
- Uploaded club logos are automatically converted to favicon, apple-touch-icon, and Android icons
- New SEO & Social Media settings: configure OG tags, Twitter cards, and meta keywords individually
- Dynamic security.txt generated from structured settings (RFC 9116 compliant)
- New Security Contact settings section for configuring security.txt fields
- Footer copyright now shows your club name

**Step 2: Commit**

Commit `FEATURES.md` and `RELEASE_NOTES.md` with message: `docs: update features and release notes for branding, meta tags, and security.txt`
