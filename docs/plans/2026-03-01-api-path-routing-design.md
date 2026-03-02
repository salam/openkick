# Unified `/api/*` Path Routing

**Date:** 2026-03-01
**Status:** Approved

## Problem

In local development, the frontend calls the API on a separate port (`http://localhost:3001/api/*`), while production routes everything through the same origin via Apache `.htaccess` proxy. This mismatch can cause subtle CORS and configuration differences between environments.

## Solution

Use Next.js `rewrites()` to proxy `/api/*` requests to the Express backend in development, and change the default `API_URL` to empty string (same-origin). This makes dev match production.

## Changes

### 1. `web/next.config.ts`

Add `rewrites()`:

```ts
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: 'http://localhost:3001/api/:path*',
    },
  ];
}
```

Only active in dev — static export in production ignores rewrites.

### 2. `web/src/lib/api.ts`

Change default API_URL:

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
```

Empty string = same-origin requests, matching production behavior.

## What stays the same

- Express server on port 3001 (configurable via `PORT`)
- Production Apache `.htaccess` proxy
- All `apiFetch('/api/...')` call sites
- CORS config on Express (kept for flexibility)

## Rollback

Set `NEXT_PUBLIC_API_URL=http://localhost:3001` to revert instantly.
