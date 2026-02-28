# Surveys Frontend UI — Design Document

> Date: 2026-03-01
> Depends on: surveys backend (already implemented)

## Overview

Frontend UI for the surveys module. Four pages: list, builder, detail+results (coach, auth required), and public response form (no auth). Top-level nav item alongside Events/Players/Calendar.

## Pages

### 1. Surveys List (`/surveys/`)

Auth required. Header with "New Survey" button + template shortcuts (Trikot Order, Feedback). Filter chips: All/Open/Closed/Archived. Grid of survey cards showing title, status badge, response count, deadline, anonymous indicator.

### 2. Survey Builder (`/surveys/new/`)

Auth required. Form with: title input, anonymous toggle, optional deadline picker. Dynamic question list with add/remove/reorder. Type selector per question (Single Choice, Multi Choice, Star Rating, Free Text, Size Picker). Options editor for choice/size types. Size Picker auto-fills standard sizes. On submit → redirect to detail page.

### 3. Survey Detail + Results (`/surveys/[id]/`)

Auth required. Shows survey info, Close/Archive action buttons. Share section with copyable link + QR code image. Results dashboard: total responses, per-question aggregation (star averages, choice distributions, free text list).

### 4. Public Response Form (`/surveys/respond/[id]/`)

No auth, standalone page (no navbar). Renders questions by type: radio buttons, checkboxes, star selector, textarea, dropdown. Nickname input for identified surveys. Submit → success/error states.

## Navigation

Add "Surveys" to Navbar's navLinks at `/surveys/`.

## Conventions

- Client components (`'use client'`)
- `apiFetch` for auth endpoints, raw `fetch` for public
- `t()` for all user-facing strings
- Tailwind with emerald color scheme
- Inline TypeScript interfaces
- Loading spinner + error states per existing patterns

## Files

- `web/src/app/surveys/layout.tsx`
- `web/src/app/surveys/page.tsx` (list)
- `web/src/app/surveys/new/page.tsx` (builder)
- `web/src/app/surveys/[id]/page.tsx` (detail+results)
- `web/src/app/surveys/respond/[id]/page.tsx` (public form)
- `web/src/components/Navbar.tsx` (add nav link)
- `web/src/lib/i18n.ts` (add ~40 keys)
