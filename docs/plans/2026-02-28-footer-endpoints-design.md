# Footer with Public Endpoints

**Date:** 2026-02-28

## Problem

1. RSS/Atom/Calendar feed links in SubscribeCard use `window.location.origin` (port 3000) instead of the API backend (port 3001), causing 404s in dev.
2. `llms.txt` and `sitemap.xml` exist on the backend but aren't discoverable from the frontend.
3. No footer exists listing public endpoints.
4. Duplicate `robots.txt` — static file in `public/` conflicts with dynamic Express route.

## Solution

### 1. Footer Component (`web/src/components/Footer.tsx`)

- Global footer in root layout, visible on every page
- Groups: Feeds (RSS, Atom, Calendar) · Discovery (Sitemap, llms.txt, robots.txt) · API (Health, MCP) · Security (security.txt)
- All links use `NEXT_PUBLIC_API_URL` as base
- Compact design: `text-xs`, gray text, border-top separator

### 2. SubscribeCard URL Fix

- Replace `window.location.origin` with `NEXT_PUBLIC_API_URL || 'http://localhost:3001'`

### 3. robots.txt Cleanup

- Delete static `public/robots.txt` (Express backend serves a dynamic version)

## Files

| Action | Path |
|--------|------|
| Create | `web/src/components/Footer.tsx` |
| Edit   | `web/src/app/layout.tsx` |
| Edit   | `web/src/components/SubscribeCard.tsx` |
| Delete | `public/robots.txt` |
