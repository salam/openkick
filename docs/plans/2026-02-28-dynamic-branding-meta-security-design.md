# Design: Dynamic Club Branding, Meta Tags, Favicon & Security.txt

**Date:** 2026-02-28

## 1. Dynamic Homepage Branding

**Approach:** Client-side fetch with localStorage cache.

- Create a `useClubSettings()` hook that:
  1. Reads `club_name`, `club_description`, `club_logo` from localStorage on mount (instant render)
  2. Fetches fresh values from `GET /api/settings` in background
  3. Updates localStorage + state if values changed
- Replace hardcoded "OpenKick" / "Youth Football Management" on homepage with values from this hook
- Replace hardcoded "OpenKick" in Footer.tsx copyright
- Fallback: show "OpenKick" / "Youth Football Management" if no settings loaded yet

## 2. Favicon Generation (Server-side)

**On logo upload** (`POST /api/settings/upload-logo`):
- Use `sharp` to generate:
  - `favicon.ico` — 32x32 ICO format
  - `favicon-16x16.png` — 16x16
  - `favicon-32x32.png` — 32x32
  - `apple-touch-icon.png` — 180x180
  - `android-chrome-192x192.png` — 192x192
  - `android-chrome-512x512.png` — 512x512
- Save all to `public/uploads/` alongside the original logo
- Generate a `site.webmanifest` JSON file with icon references
- Serve these at standard paths via Express static middleware

**On the frontend:**
- `layout.tsx` links to these favicon paths (they'll 404 gracefully until a logo is uploaded)
- The `useClubSettings` hook also dynamically updates `<link rel="icon">` in the document head

## 3. Meta Tags & OG Tags

**New settings keys:**

| Key | Default | Purpose |
|-----|---------|---------|
| `og_title` | `""` (falls back to club_name) | Open Graph title |
| `og_description` | `""` (falls back to club_description) | Open Graph description |
| `og_image` | `""` (falls back to club_logo) | Open Graph image URL |
| `twitter_title` | `""` (falls back to og_title) | Twitter card title |
| `twitter_description` | `""` (falls back to og_description) | Twitter card description |
| `twitter_handle` | `""` | Twitter @handle |
| `meta_keywords` | `""` | SEO keywords, comma-separated |

**Fallback chain:** twitter_* → og_* → club_* settings → hardcoded defaults

**Frontend:** The `useClubSettings` hook dynamically injects `<meta>` tags into `<head>` using `document.head` manipulation (since static export can't do server-side metadata).

**Settings UI:** New "SEO & Social" section in the settings page with fields for each.

## 4. Security.txt (Dynamic, Structured)

**New settings keys:**

| Key | Default |
|-----|---------|
| `security_contact_email` | `""` |
| `security_contact_url` | `""` |
| `security_pgp_key_url` | `""` |
| `security_policy_url` | `""` |
| `security_acknowledgments_url` | `""` |
| `security_preferred_languages` | `"en, de"` |
| `security_canonical_url` | `""` |

**Server endpoint:** `GET /.well-known/security.txt` — dynamically generated from settings. Always includes:
- The club owner's contact (from settings)
- The open-source project contact (hardcoded: `https://github.com/mho/openkick/security/advisories/new`)
- Auto-calculated `Expires` (1 year from now)

**Settings UI:** New "Security Contact" section in settings with the structured form fields.

**Remove** the static `public/.well-known/security.txt` file.

## 5. Settings Page Organization

Add two new sections to the existing settings page:
1. **"SEO & Social Media"** — og_title, og_description, og_image, twitter_title, twitter_description, twitter_handle, meta_keywords
2. **"Security Contact"** — security_contact_email, security_contact_url, security_pgp_key_url, security_policy_url, security_acknowledgments_url, security_preferred_languages, security_canonical_url
