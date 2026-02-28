# Blueprint: Club Branding & Customisation Module

> **PRD reference:** Section 4.5.13 — Club Branding & Customisation
> **Design system:** See `CICD.md` for colours, typography, components, layout, and dark mode
> **Status:** Partially implemented (see "Current Implementation" below)
> **Priority:** High (every page and every WhatsApp message depends on branding data)
>
> ## Current Implementation (as of Mar 2026)
>
> The following parts of this blueprint are already implemented and diverge from the original design below:
>
> - **Settings storage:** Uses the existing `settings` key-value table (not a separate `club_settings` table). Keys: `club_name`, `club_description`, `club_logo`, `og_title`, `og_description`, `og_image`, `twitter_title`, `twitter_description`, `twitter_handle`, `meta_keywords`, `security_contact_email`, `security_contact_url`, `security_pgp_key_url`, `security_policy_url`, `security_acknowledgments_url`, `security_preferred_languages`, `security_canonical_url`.
> - **Homepage:** Displays club logo, club name, and club description from settings. No hardcoded "OpenKick" text on the homepage. Values come from `window.__CLUB_SETTINGS__` (injected server-side).
> - **Server-side HTML injection:** An Express middleware (`server/src/middleware/html-injector.ts`) reads each HTML file from disk, injects `<title>`, `<meta>` (description, keywords, OG, Twitter), favicon `<link>` tags, and a `<script>window.__CLUB_SETTINGS__={...}</script>` into `<head>` before serving. Crawlers and social media bots see correct branding in the raw HTML.
> - **Favicon generation:** On logo upload (`POST /api/settings/upload-logo`), `sharp` generates favicon.ico, 16×16, 32×32, apple-touch-icon (180×180), Android Chrome (192×192, 512×512), and `site.webmanifest`. Cleanup on logo removal.
> - **Dynamic security.txt:** `GET /.well-known/security.txt` is dynamically generated from settings (RFC 9116). Includes club owner contacts + hardcoded open-source project contact.
> - **Footer:** Shows club name in copyright, links to feeds, data endpoints, API, login, imprint, privacy.
> - **Settings UI:** "Club Profile", "SEO & Social Media", and "Security Contact" sections in the admin settings page.
> - **Frontend hook:** `useClubSettings()` reads from `window.__CLUB_SETTINGS__` (no API fetch).
>
> **Not yet implemented from this blueprint:** tint colour system, imprint page, SVG sanitisation, WhatsApp bot identity sync, branding middleware headers, colour palette generation.

---

## 1. Module Overview

Every OpenKick instance must feel like the club's own tool, not a generic platform. This module lets administrators configure:

- Club name, subtitle, and logo
- A single tint colour from which dark, light, and contrast variants are auto-generated
- Official contact information (address, email, phone, website)
- A legal imprint page (Impressum) as required by Swiss law (Art. 3 UWG)
- The WhatsApp bot display name and greeting message
- A footer shown on every page

All settings are stored in a single `club_settings` database table. A public API endpoint exposes branding data so the frontend can apply it at load time via CSS custom properties. An in-memory cache ensures fast reads; any admin update invalidates the cache immediately.

---

## 2. Dependencies

Add to `server/package.json`:

```jsonc
{
  "sharp": "^0.33.x",       // Image processing — resize logo to standard sizes, convert formats
  "chroma-js": "^2.6.x",    // Colour manipulation — darken, lighten, luminance/contrast calculation
  "@types/chroma-js": "^2.4.x"  // TypeScript types (devDependency)
}
```

**Why these libraries:**

- `sharp` — fast, production-grade image resizer. Handles PNG, JPG, SVG (via librsvg). Outputs multiple sizes in one pipeline pass.
- `chroma-js` — lightweight colour library with WCAG luminance helpers. Avoids pulling in a full CSS-in-JS framework.

Also depends on `multer` (already likely available or add it) for multipart file uploads.

```jsonc
{
  "multer": "^1.4.x",
  "@types/multer": "^1.4.x"  // devDependency
}
```

---

## 3. File Structure

All new files live under `server/src/`. No existing files are deleted; only `server/src/index.ts` and `server/src/database.ts` receive small additions.

```
server/src/
├── models/
│   └── club-settings.model.ts        # TypeScript interfaces + DB column map
├── services/
│   └── club-settings.service.ts      # CRUD, logo upload/resize, colour generation, cache
├── routes/
│   ├── admin/
│   │   └── club-settings.routes.ts   # GET/PUT settings, POST/DELETE logo (auth required)
│   └── public/
│       └── club-info.routes.ts       # GET /api/public/club-info, GET /api/public/logo/:size
├── middleware/
│   └── branding.middleware.ts         # Optionally inject X-Club-Name / X-Tint-Color headers; cache layer
└── utils/
    └── svg-sanitize.ts               # Strip scripts/event handlers from uploaded SVGs
```

### Integration points (edits to existing files)

| File | Change |
|---|---|
| `server/src/database.ts` | Add `CREATE TABLE IF NOT EXISTS club_settings` to `SCHEMA`. Seed default row in `initDB`. |
| `server/src/index.ts` | Import and mount `clubSettingsAdminRouter` at `/api/admin` and `clubInfoRouter` at `/api/public`. Optionally apply `brandingMiddleware` globally. Serve `uploads/` as static directory. |

---

## 4. Database Schema

Use a **single-row table** rather than key-value, so every field has an explicit column and type. The table always has exactly one row (`id = 1`); `INSERT OR IGNORE` seeds it on first boot.

```sql
CREATE TABLE IF NOT EXISTS club_settings (
  id                        INTEGER PRIMARY KEY CHECK (id = 1) DEFAULT 1,

  -- Identity
  club_name                 TEXT    NOT NULL DEFAULT 'My Club',
  club_subtitle             TEXT    NOT NULL DEFAULT '',

  -- Logo
  logo_path                 TEXT,  -- relative path inside uploads/logos/, NULL if no logo

  -- Colour
  tint_color                TEXT    NOT NULL DEFAULT '#10B981',  -- hex, validated on write (jade green, see CICD.md)

  -- Contact
  contact_address           TEXT    NOT NULL DEFAULT '',
  contact_city              TEXT    NOT NULL DEFAULT '',
  contact_email             TEXT    NOT NULL DEFAULT '',
  contact_phone             TEXT    NOT NULL DEFAULT '',
  contact_website           TEXT    NOT NULL DEFAULT '',

  -- Imprint (Impressum)
  imprint_responsible_person TEXT   NOT NULL DEFAULT '',
  imprint_association_type   TEXT   NOT NULL DEFAULT 'Verein nach Art. 60 ZGB',
  imprint_uid               TEXT   NOT NULL DEFAULT '',   -- UID / commercial register number
  imprint_dpo               TEXT   NOT NULL DEFAULT '',   -- Data protection officer

  -- WhatsApp bot
  whatsapp_greeting         TEXT   NOT NULL DEFAULT 'Hallo! Schreib mir den Vornamen deines Kindes, um loszulegen.',
  whatsapp_bot_name         TEXT   NOT NULL DEFAULT 'OpenKick Bot',

  -- Metadata
  updated_at                TEXT   NOT NULL DEFAULT (datetime('now'))
);

-- Ensure exactly one row exists
INSERT OR IGNORE INTO club_settings (id) VALUES (1);
```

**Migration note:** Since the project uses sql.js with `CREATE TABLE IF NOT EXISTS`, append this table definition to the `SCHEMA` constant in `database.ts`. The `INSERT OR IGNORE` seeds the default row.

---

## 5. TypeScript Interfaces

Place in `server/src/models/club-settings.model.ts`:

```typescript
/**
 * Full database row — used internally by the service layer.
 */
export interface ClubSettings {
  id: 1;

  // Identity
  club_name: string;
  club_subtitle: string;

  // Logo
  logo_path: string | null;

  // Colour (raw hex stored in DB)
  tint_color: string;

  // Contact
  contact_address: string;
  contact_city: string;
  contact_email: string;
  contact_phone: string;
  contact_website: string;

  // Imprint
  imprint_responsible_person: string;
  imprint_association_type: string;
  imprint_uid: string;
  imprint_dpo: string;

  // WhatsApp
  whatsapp_greeting: string;
  whatsapp_bot_name: string;

  // Meta
  updated_at: string;
}

/**
 * Colour variants auto-generated from `tint_color`.
 * Maps to Tailwind-compatible tokens used by the frontend (see CICD.md §2.1).
 * The default jade green (#10B981) produces the exact Tailwind emerald scale;
 * custom club tints are approximated via chroma-js.
 */
export interface ColourPalette {
  primary: string;          // the original tint_color (maps to primary-500)
  primary50: string;        // very light tint (backgrounds, hover states)
  primary100: string;       // light fills, badges
  primary200: string;       // borders, dividers
  primary300: string;       // icons, secondary elements
  primary400: string;       // active states, links
  primary600: string;       // hover on primary
  primary700: string;       // pressed state, button shadow
  primary800: string;       // dark mode primary surface
  primary900: string;       // dark mode hover
  primaryContrast: string;  // '#FFFFFF' or '#000000' based on luminance
}

/**
 * Public API response returned by GET /api/public/club-info.
 * Contains everything the frontend needs to render branding — no secrets, no internal IDs.
 */
export interface ClubBrandingResponse {
  clubName: string;
  clubSubtitle: string;

  // Logo URLs (null if no logo uploaded — frontend falls back to OpenKick default)
  logoUrl: string | null;       // 200px header logo
  logoSmallUrl: string | null;  // 64px footer logo
  faviconUrl: string | null;    // 48px favicon

  // Colour system
  colours: ColourPalette;

  // Contact
  contact: {
    address: string;
    city: string;
    email: string;
    phone: string;
    website: string;
  };

  // Imprint
  imprint: {
    responsiblePerson: string;
    associationType: string;
    uid: string;
    dpo: string;
  };

  // Footer (precomputed convenience fields)
  footerText: string;  // e.g. "FC Example — Junioren E"
  poweredBy: string;   // always "Powered by OpenKick"
}

/**
 * Shape of the PUT /api/admin/club-settings request body.
 * Every field is optional — only provided fields are updated.
 */
export type ClubSettingsUpdatePayload = Partial<
  Omit<ClubSettings, 'id' | 'logo_path' | 'updated_at'>
>;
```

---

## 6. API Endpoints

### 6.1 Public (no authentication)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/public/club-info` | Returns `ClubBrandingResponse` JSON. Served from in-memory cache. |
| `GET` | `/api/public/logo/:size` | Serves the logo image. `:size` is one of `header` (200px), `footer` (64px), `favicon` (48px). Returns 404 if no logo is uploaded. Sets `Cache-Control: public, max-age=86400`. Content-Type is `image/png` (or `image/svg+xml` for SVGs). |
| `GET` | `/api/public/imprint` | Returns the imprint fields as JSON (for an SPA) or could return rendered HTML. Discuss with frontend team. |

### 6.2 Admin (requires authentication — role `admin` or `coach`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/club-settings` | Returns the full `ClubSettings` row (all fields). |
| `PUT` | `/api/admin/club-settings` | Accepts `ClubSettingsUpdatePayload` JSON. Validates fields (see section 12). Updates only provided fields. Invalidates cache. Returns the updated `ClubSettings`. |
| `POST` | `/api/admin/club-settings/logo` | Multipart form upload (`field name: logo`). Accepts SVG/PNG/JPG, max 2 MB. Processes and stores resized versions. Invalidates cache. Returns `{ logoUrl, logoSmallUrl, faviconUrl }`. |
| `DELETE` | `/api/admin/club-settings/logo` | Removes all logo files from disk, sets `logo_path` to NULL. Invalidates cache. Returns 204. |

---

## 7. Service Layer — `club-settings.service.ts`

This is the core module. It owns the cache, colour generation, and logo processing.

### 7.1 In-Memory Cache

```typescript
let _cachedBranding: ClubBrandingResponse | null = null;

export function invalidateBrandingCache(): void {
  _cachedBranding = null;
}

export function getCachedBranding(): ClubBrandingResponse | null {
  return _cachedBranding;
}
```

Every write operation (`updateSettings`, `uploadLogo`, `deleteLogo`) calls `invalidateBrandingCache()`. The `getClubInfo()` function rebuilds the cache on the next read if it is null.

### 7.2 Colour Generation

Use `chroma-js`:

```typescript
import chroma from 'chroma-js';

export function generateColourPalette(hex: string): ColourPalette {
  const base = chroma(hex);
  return {
    primary: base.hex(),                                          // 500
    primary50: base.brighten(2.8).desaturate(0.3).hex(),          // very light
    primary100: base.brighten(2.4).desaturate(0.2).hex(),         // light fill
    primary200: base.brighten(1.8).hex(),                         // border
    primary300: base.brighten(1.2).hex(),                         // icon
    primary400: base.brighten(0.5).hex(),                         // active
    primary600: base.darken(0.5).hex(),                           // hover
    primary700: base.darken(1.0).hex(),                           // pressed
    primary800: base.darken(1.5).hex(),                           // dark surface
    primary900: base.darken(2.0).hex(),                           // dark hover
    primaryContrast: base.luminance() > 0.179 ? '#000000' : '#FFFFFF',
  };
}
```

The luminance threshold (`0.179`) follows the WCAG 2.1 contrast-ratio guideline — if the colour is bright enough, black text is used; otherwise white.

### 7.3 Logo Upload Pipeline

```typescript
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

const LOGO_SIZES = {
  header: 200,   // px width, aspect ratio preserved
  footer: 64,
  favicon: 48,
} as const;

const UPLOAD_DIR = path.resolve('uploads/logos');

export async function processAndStoreLogo(
  fileBuffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<string> {
  // 1. If SVG, sanitize first (see section 12)
  // 2. For raster images, use sharp to resize
  // 3. Write to UPLOAD_DIR with names like `logo-header.png`, `logo-footer.png`, `logo-favicon.png`
  // 4. Return the base path (e.g. 'logo') stored in club_settings.logo_path

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const baseName = 'club-logo';  // single-instance, no club-ID prefix needed for v1

  if (mimeType === 'image/svg+xml') {
    // Store sanitized SVG as-is for all sizes (vector scales freely)
    const sanitized = sanitizeSvg(fileBuffer.toString('utf-8'));
    await fs.writeFile(path.join(UPLOAD_DIR, `${baseName}.svg`), sanitized);
  } else {
    // Raster: resize to each target size
    for (const [sizeName, width] of Object.entries(LOGO_SIZES)) {
      await sharp(fileBuffer)
        .resize(width, width, { fit: 'inside', withoutEnlargement: true })
        .png()   // normalise to PNG for consistency
        .toFile(path.join(UPLOAD_DIR, `${baseName}-${sizeName}.png`));
    }
  }

  return baseName;
}
```

### 7.4 CRUD Operations

```typescript
export function getSettings(): ClubSettings { /* SELECT * FROM club_settings WHERE id = 1 */ }

export function updateSettings(payload: ClubSettingsUpdatePayload): ClubSettings {
  // 1. Validate tint_color if provided (must match /^#[0-9A-Fa-f]{6}$/)
  // 2. Build dynamic UPDATE SET clause from provided keys only
  // 3. Set updated_at = datetime('now')
  // 4. Run UPDATE
  // 5. invalidateBrandingCache()
  // 6. Return getSettings()
}

export async function uploadLogo(file: Express.Multer.File): Promise<{ logoUrl; logoSmallUrl; faviconUrl }> {
  // 1. Validate MIME type (image/svg+xml, image/png, image/jpeg)
  // 2. Validate size <= 2 MB
  // 3. Call processAndStoreLogo()
  // 4. UPDATE club_settings SET logo_path = baseName
  // 5. invalidateBrandingCache()
  // 6. Return URLs
}

export async function deleteLogo(): Promise<void> {
  // 1. Read current logo_path
  // 2. Delete files from disk
  // 3. UPDATE club_settings SET logo_path = NULL
  // 4. invalidateBrandingCache()
}
```

### 7.5 WhatsApp Bot Identity Sync

On every `updateSettings` call, if `whatsapp_bot_name` or `whatsapp_greeting` changed, call the WAHA API to update the bot profile:

```typescript
async function syncWhatsAppProfile(settings: ClubSettings): Promise<void> {
  const wahaUrl = getSettingValue('waha_url');  // from the existing settings table
  if (!wahaUrl) return;  // WAHA not configured, skip silently

  try {
    // Update bot display name
    await fetch(`${wahaUrl}/api/contacts/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: settings.whatsapp_bot_name }),
    });

    // If logo was uploaded, also update profile picture
    if (settings.logo_path) {
      const logoBuffer = await fs.readFile(
        path.join(UPLOAD_DIR, `${settings.logo_path}-header.png`)
      );
      // WAHA expects base64 or multipart — adapt to WAHA version
    }
  } catch (err) {
    // Log but don't fail the settings update — WAHA may be offline
    console.warn('Failed to sync WhatsApp profile:', err);
  }
}
```

---

## 8. Routes

### 8.1 Admin Routes — `server/src/routes/admin/club-settings.routes.ts`

```typescript
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../auth.js';
import * as service from '../../services/club-settings.service.js';

export const clubSettingsAdminRouter = Router();
const upload = multer({ limits: { fileSize: 2 * 1024 * 1024 } }); // 2 MB

// All routes require admin role
clubSettingsAdminRouter.use(requireAuth, requireRole('admin'));

clubSettingsAdminRouter.get('/club-settings', (req, res) => { ... });
clubSettingsAdminRouter.put('/club-settings', (req, res) => { ... });
clubSettingsAdminRouter.post('/club-settings/logo', upload.single('logo'), (req, res) => { ... });
clubSettingsAdminRouter.delete('/club-settings/logo', (req, res) => { ... });
```

**Note on auth:** The existing `server/src/auth.ts` provides `requireAuth`. If `requireRole` does not exist yet, implement it as a small middleware that checks `req.user.role`.

### 8.2 Public Routes — `server/src/routes/public/club-info.routes.ts`

```typescript
import { Router } from 'express';
import * as service from '../../services/club-settings.service.js';

export const clubInfoRouter = Router();

clubInfoRouter.get('/club-info', (req, res) => {
  const branding = service.getClubBrandingResponse();
  res.json(branding);
});

clubInfoRouter.get('/logo/:size', (req, res) => {
  // size must be 'header' | 'footer' | 'favicon'
  // Read file from uploads/logos/ and stream it
  // Set Cache-Control: public, max-age=86400
  // 404 if no logo uploaded
});

clubInfoRouter.get('/imprint', (req, res) => {
  const settings = service.getSettings();
  res.json({
    clubName: settings.club_name,
    responsiblePerson: settings.imprint_responsible_person,
    associationType: settings.imprint_association_type,
    uid: settings.imprint_uid,
    dpo: settings.imprint_dpo,
    contact: {
      address: settings.contact_address,
      city: settings.contact_city,
      email: settings.contact_email,
      phone: settings.contact_phone,
      website: settings.contact_website,
    },
  });
});
```

### 8.3 Mount in `index.ts`

```typescript
import { clubSettingsAdminRouter } from './routes/admin/club-settings.routes.js';
import { clubInfoRouter } from './routes/public/club-info.routes.js';

// ... after existing routes
app.use('/api/admin', clubSettingsAdminRouter);
app.use('/api/public', clubInfoRouter);

// Serve uploaded logos as static files (fallback for direct URL access)
app.use('/uploads', express.static(path.resolve('uploads')));
```

---

## 9. Branding Middleware — `server/src/middleware/branding.middleware.ts`

Optional middleware that attaches branding data to every response. Useful if the frontend fetches pages server-side or if you want custom HTTP headers.

```typescript
import { Request, Response, NextFunction } from 'express';
import * as service from '../services/club-settings.service.js';

export function brandingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const branding = service.getClubBrandingResponse();

  // Attach as custom headers (lightweight, no body modification)
  res.setHeader('X-Club-Name', branding.clubName);
  res.setHeader('X-Tint-Color', branding.colours.primary);

  // Also make available on req for downstream handlers
  (req as any).branding = branding;

  next();
}
```

Mount globally in `index.ts` if needed: `app.use(brandingMiddleware);`

This is **optional** — the frontend can also just call `/api/public/club-info` on startup and cache locally.

---

## 10. Imprint Page

The imprint (Impressum) is required by Swiss law for any website operated commercially or by an association. At minimum it must include:

- Name of the responsible person or organization
- Address
- Email / contact method
- UID (if registered)

The data is served by `GET /api/public/imprint`. The frontend renders it at the `/imprint` route. The footer on every page links to `/imprint`.

**Content template (rendered by frontend):**

```
{clubName}
{imprint_association_type}

Verantwortlich: {imprint_responsible_person}

{contact_address}
{contact_city}

E-Mail: {contact_email}
Telefon: {contact_phone}
Web: {contact_website}

UID: {imprint_uid}
Datenschutz: {imprint_dpo}
```

---

## 11. Footer

Every page rendered by the frontend must include a footer with:

- Club logo (64px, the `footer` size) — falls back to OpenKick default
- Club name
- Links: Imprint | Privacy Policy | Contact
- "Powered by OpenKick"

The footer data comes from the `ClubBrandingResponse`. The frontend fetches it once on app init and stores it in a global state (context / store).

---

## 12. Edge Cases & Validation

| Case | Handling |
|---|---|
| **No logo uploaded** | `logo_path` is NULL. `logoUrl`, `logoSmallUrl`, `faviconUrl` are all `null` in `ClubBrandingResponse`. Frontend shows a default OpenKick logo bundled in the client assets. |
| **Invalid hex colour** | The `PUT /api/admin/club-settings` endpoint validates `tint_color` against `/^#[0-9A-Fa-f]{6}$/`. Reject with 400 and message `"tint_color must be a valid 6-digit hex colour (e.g. #10B981)"`. |
| **Very long club name** | Database stores full name (no truncation). The `ClubBrandingResponse` returns it as-is. The **frontend** is responsible for truncating or ellipsizing in the header (CSS `text-overflow: ellipsis`, max ~40 characters visible). Backend does not enforce a max length beyond what SQLite allows. |
| **SVG sanitization (XSS prevention)** | Before storing an uploaded SVG, strip all `<script>` elements, `on*` event-handler attributes (onclick, onerror, etc.), `javascript:` URIs, and `<foreignObject>` elements. Use a simple regex-based sanitizer or a library like `DOMPurify` (with jsdom). Place logic in `server/src/utils/svg-sanitize.ts`. If sanitization fails or the SVG is malformed, reject with 400. |
| **Unsupported file type** | Reject uploads that are not `image/svg+xml`, `image/png`, or `image/jpeg` with 400. Check both the `Content-Type` header and the file's magic bytes (first few bytes). |
| **File too large** | `multer` enforces the 2 MB limit. On overflow, return 413 with `"Logo file must be under 2 MB"`. |
| **WAHA offline** | `syncWhatsAppProfile` catches errors and logs a warning. The settings update still succeeds. A future improvement could queue the sync and retry. |
| **Concurrent settings updates** | The single-row design with `WHERE id = 1` means SQLite's write lock handles serialization. Last write wins. Acceptable for a single-admin use case. |

---

## 13. SVG Sanitizer — `server/src/utils/svg-sanitize.ts`

```typescript
/**
 * Sanitize an SVG string to prevent XSS when serving user-uploaded logos.
 *
 * Removes:
 * - <script> elements
 * - on* event-handler attributes (onclick, onerror, onload, etc.)
 * - javascript: / data: URIs in href / xlink:href / src attributes
 * - <foreignObject> elements (can embed arbitrary HTML)
 *
 * Returns the sanitized SVG string.
 * Throws if the input is not valid XML-ish SVG.
 */
export function sanitizeSvg(raw: string): string {
  let svg = raw;

  // Remove <script>...</script> (including multiline)
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove on* attributes
  svg = svg.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  // Remove javascript: and data: URIs
  svg = svg.replace(/(href|src|xlink:href)\s*=\s*["']?\s*(javascript|data):[^"'\s>]*/gi, '');

  // Remove <foreignObject>
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

  // Basic check: must still contain <svg
  if (!/<svg[\s>]/i.test(svg)) {
    throw new Error('Invalid SVG after sanitization');
  }

  return svg;
}
```

**Note:** For production hardening, consider adding `DOMPurify` with `jsdom` for a proper DOM-based sanitization pass. The regex approach above covers the most common attack vectors.

---

## 14. Caching Strategy

```
  ┌─────────────┐       cache miss       ┌──────────────────┐
  │   Frontend   │ ───── GET /club-info ──►  Service Layer   │
  │              │ ◄──── JSON response ───│  (in-memory var)  │
  └─────────────┘       cache hit        └──────────────────┘
                                                 │
                                           cache invalidated
                                           on any PUT/POST/DELETE
                                                 │
                                          ┌──────▼──────────┐
                                          │   SQLite read    │
                                          │   + rebuild      │
                                          └─────────────────┘
```

- The cache is a single module-level variable (`_cachedBranding`).
- On read: return cached value if non-null; otherwise query SQLite, build `ClubBrandingResponse`, store in cache, return.
- On write: set `_cachedBranding = null`. Next read rebuilds it.
- No TTL needed — invalidation is explicit.
- This is safe because OpenKick is a single-process Node.js server (no clustering).

---

## 15. Frontend Integration Notes

> **See also:** `CICD.md` for the full corporate design system (colours, typography, components, layout, dark mode).

The frontend uses **Next.js (App Router) + Tailwind CSS 4 + shadcn/ui + next-themes** (see `CICD.md` §11).

The frontend should:

1. Call `GET /api/public/club-info` on app initialization (e.g. in the root `layout.tsx`).
2. Store the response in a React context provider.
3. Apply the club's tint colour as CSS custom properties on `<html>`, mapping to Tailwind tokens:

```typescript
// lib/apply-branding.ts
export function applyBrandingTokens(colours: ColourPalette) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary-50', colours.primary50);
  root.style.setProperty('--color-primary-100', colours.primary100);
  root.style.setProperty('--color-primary-200', colours.primary200);
  root.style.setProperty('--color-primary-300', colours.primary300);
  root.style.setProperty('--color-primary-400', colours.primary400);
  root.style.setProperty('--color-primary-500', colours.primary);
  root.style.setProperty('--color-primary-600', colours.primary600);
  root.style.setProperty('--color-primary-700', colours.primary700);
  root.style.setProperty('--color-primary-800', colours.primary800);
  root.style.setProperty('--color-primary-900', colours.primary900);
  root.style.setProperty('--color-primary-contrast', colours.primaryContrast);
}
```

4. Use `logoUrl` for the header, `logoSmallUrl` for the footer, `faviconUrl` to dynamically set the page favicon.
5. If any logo URL is `null`, fall back to a bundled `/assets/openkick-logo-default.svg`.
6. Render the imprint page at `/imprint` using data from `GET /api/public/imprint`.
7. Render the footer on every page using `footerText`, `logoSmallUrl`, and `poweredBy`.
8. Dark mode is managed via `next-themes` with Tailwind's `class` strategy (see `CICD.md` §8).

---

## 16. Testing Checklist

All tests go in `server/src/__tests__/club-settings.test.ts`.

### Unit tests (service layer)

- [ ] `generateColourPalette('#10B981')` returns correct 50–900 scale and contrast values
- [ ] `generateColourPalette('#FFEB3B')` (bright yellow) returns `primaryContrast: '#000000'`
- [ ] `generateColourPalette('#1A237E')` (dark blue) returns `primaryContrast: '#FFFFFF'`
- [ ] `sanitizeSvg` strips `<script>` tags
- [ ] `sanitizeSvg` strips `onerror` attributes
- [ ] `sanitizeSvg` strips `javascript:` URIs
- [ ] `sanitizeSvg` strips `<foreignObject>`
- [ ] `sanitizeSvg` throws on non-SVG input
- [ ] `updateSettings` rejects invalid hex (`'red'`, `'#GGG'`, `'#12345'`)
- [ ] `updateSettings` accepts valid hex (`'#10B981'`, `'#fff000'`)

### Integration tests (API routes)

- [ ] `GET /api/public/club-info` returns 200 with default branding when no settings configured
- [ ] `GET /api/public/club-info` returns updated values after `PUT /api/admin/club-settings`
- [ ] `PUT /api/admin/club-settings` requires authentication (returns 401 without token)
- [ ] `PUT /api/admin/club-settings` requires admin role (returns 403 for parent role)
- [ ] `PUT /api/admin/club-settings` with partial payload only updates provided fields
- [ ] `POST /api/admin/club-settings/logo` with valid PNG returns logo URLs
- [ ] `POST /api/admin/club-settings/logo` with 3 MB file returns 413
- [ ] `POST /api/admin/club-settings/logo` with `.txt` file returns 400
- [ ] `DELETE /api/admin/club-settings/logo` removes files and returns 204
- [ ] `GET /api/public/logo/header` returns image after upload
- [ ] `GET /api/public/logo/header` returns 404 when no logo uploaded
- [ ] Cache is invalidated: `GET /api/public/club-info` reflects changes after `PUT`

### Edge-case tests

- [ ] Upload SVG with embedded `<script>` — verify it is stripped before storage
- [ ] Upload SVG with `onerror` handler — verify it is stripped
- [ ] Very long club name (500 chars) — stored and returned correctly
- [ ] Empty `tint_color` in PUT — rejected with 400 (field is required if provided)

---

## 17. Implementation Order

Recommended order for the implementer:

1. **Database schema** — add table to `database.ts`, verify migration works
2. **Model file** — create `club-settings.model.ts` with all interfaces
3. **SVG sanitizer** — `utils/svg-sanitize.ts` + unit tests
4. **Service layer** — `club-settings.service.ts` (CRUD, colour generation, caching) + unit tests
5. **Logo processing** — add `sharp` pipeline to service, test with sample images
6. **Public routes** — `club-info.routes.ts` + integration tests
7. **Admin routes** — `club-settings.routes.ts` + integration tests
8. **Branding middleware** — optional, wire up if needed
9. **WhatsApp sync** — add `syncWhatsAppProfile` call inside `updateSettings`
10. **Mount routes in `index.ts`** — register routers, add static file serving for `uploads/`
11. **Full test pass** — run all tests, lint, compile
