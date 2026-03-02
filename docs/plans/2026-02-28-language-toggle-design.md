# Language Toggle Design

**Date:** 2026-02-28

## Summary

Add a globe icon + dropdown language toggle to the Navbar, next to the logout button. Persists the user's choice in localStorage.

## Changes

### 1. `web/src/lib/i18n.ts` — add persistence

- `getLanguage()`: reads `localStorage` key `openkick_lang`, falls back to `detectLanguage()`
- `setLanguage(lang)`: writes to `localStorage`, dispatches a `storage` event for reactivity
- `t()` uses `getLanguage()` instead of raw `detectLanguage()`

### 2. New component `web/src/components/LanguageToggle.tsx`

- Globe SVG icon button, opens a small dropdown on click
- Three options: Deutsch, English, Français — checkmark on active
- Calls `setLanguage()`, triggers re-render
- Click-outside closes dropdown
- Matches Navbar styling (gray-600, hover:bg-gray-50, text-sm)

### 3. `web/src/components/Navbar.tsx` — integrate

- Desktop: `<LanguageToggle />` to the left of the logout button
- Mobile: language options inside hamburger menu, below nav links, above logout

### 4. `web/src/app/layout.tsx` — `<html lang>`

- Use `getLanguage()` so the lang attribute respects saved choice

## Non-goals

- No new dependencies
- No URL-based locale routing
- No server-side translation changes
- No new languages
