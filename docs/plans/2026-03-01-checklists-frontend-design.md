# Design: Checklists Frontend UI

> **Date:** 2026-03-01
> **Backend:** Already implemented (API at `/api/admin/checklists`)

---

## Overview

An admin dashboard page for viewing and managing checklists. Three tabs (Admin, Training, Tournament) switch between checklist types. Coaches and admins can toggle item completion, add custom items, and delete custom items.

## Page Location

`web/src/app/dashboard/checklists/page.tsx` — inherits `AuthGuard` + `Navbar` from `dashboard/layout.tsx`.

## Layout

- **Header:** "Checklists" title
- **Tab bar:** Admin | Training | Tournament — active tab has emerald underline
- **Admin tab:** Shows semester-based admin checklists with progress bar
- **Training/Tournament tabs:** Show per-event checklists, each in its own card with event title and date

## Checklist Card

- White card with gray border (`rounded-lg border border-gray-200 bg-white p-6`)
- Header shows checklist context (semester label or event name) + progress (e.g. "3/7 complete")
- Items listed vertically with checkboxes
- Completed items: emerald circle-check SVG, `line-through text-gray-400`
- Unchecked items: gray border circle, normal text
- Custom items: subtle "Custom" badge + delete (x) button
- "Add custom item" inline input at bottom

## Interactions

- **Toggle:** Click item → optimistic update → `PUT /api/admin/checklists/:id/items/:itemId`
- **Add custom:** Enter text + press Enter → `POST /api/admin/checklists/:id/items`
- **Delete custom:** Click x → `DELETE /api/admin/checklists/:id/items/:itemId`
- **Completion info:** Small text below completed items showing who and when

## Styling

Matches existing codebase: Tailwind v4, emerald-500 primary, hand-built components, same card/button/input class constants.

## i18n

Add keys to `de`, `en`, `fr` blocks in `web/src/lib/i18n.ts`.

## Contextual Checklist Widget

A reusable `<EventChecklist>` component that shows a collapsible checklist widget on event detail pages. Appears on training and tournament event detail pages (`EventDetailClient.tsx`).

### Appearance

```
┌─ Checklist ──────────────────── 2/5 ── ▼ ──┐
│ ☑ Balls, cones, bibs packed                │
│ ☑ First-aid kit available                  │
│ ○ Attendance taken                         │
│ ○ Field condition checked                  │
│ ○ Water / drinks reminder sent             │
│ [+ Add item]                               │
└────────────────────────────────────────────┘
```

- Collapsed by default — shows only the header with progress (e.g. "2/5")
- Click header to expand/collapse
- Same toggle, add, delete interactions as the dashboard page
- Only visible to coaches/admins (check `getUserRole()`)
- Fetches checklist by `eventId`: `GET /api/admin/checklists?eventId=X`

### Where it appears

- `web/src/app/events/[id]/EventDetailClient.tsx` — as a new `<section>` after the attendance section, for training and tournament events only
- The component is extracted to `web/src/components/EventChecklist.tsx` for reuse

## Files

| File | Action |
|------|--------|
| `web/src/app/dashboard/checklists/page.tsx` | **New** — main admin page |
| `web/src/components/EventChecklist.tsx` | **New** — reusable collapsible widget |
| `web/src/app/events/[id]/EventDetailClient.tsx` | **Modify** — embed `<EventChecklist>` |
| `web/src/lib/i18n.ts` | **Modify** — add translation keys |

## Out of Scope

- Drag-to-reorder UI
- Classification management UI
- Inline label editing
