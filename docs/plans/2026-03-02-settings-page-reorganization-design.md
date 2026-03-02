# Settings Page Reorganization — Design

**Date:** 2026-03-02

## Problem

The settings page has 14 flat sections in a single scroll. The header and save button scroll out of view, and there is no navigation to jump between sections.

## Solution

Three changes:

### 1. Sticky Header + Floating Save Bar

- The page title "Settings" sticks to the top of the viewport when scrolling (below the Navbar).
- A bottom floating bar appears when there are unsaved changes, containing the save button and status message. Always reachable.

### 2. Sidebar Navigation with Scroll-Spy

- A left sidebar lists the 5 section groups as nav links.
- Clicking a link smooth-scrolls to the section.
- The currently visible section is highlighted (Intersection Observer).
- On mobile (< md breakpoint), the sidebar collapses into a horizontal scrollable pill bar above the content.

### 3. Logical Section Grouping

14 sections → 5 groups:

| Group | Sections |
|---|---|
| **General** | Club Profile, Homepage Appearance, Bot Language |
| **Integrations** | LLM Configuration, WAHA, SMTP / Email, Holiday Sources |
| **Security** | Security Audit, Bot Protection, Security Contact |
| **Content** | Public Feeds, SEO & Social Media, Legal & Privacy |
| **Team** | Users |

Each group gets a heading (h2) and its sections are cards below it.

## Technical Approach

- All changes in `web/src/app/settings/page.tsx` and `web/src/app/settings/layout.tsx`.
- No new dependencies — Intersection Observer is native browser API.
- i18n keys added for group names.
- Mobile-first: pill bar on small screens, sidebar on md+.

## Non-Goals

- No tab-based routing (all sections stay on one page, URL doesn't change per section).
- No per-section save — the global save button remains.
