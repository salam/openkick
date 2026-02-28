# Design: Administrative Checklists (PRD 4.5.10)

> **Date:** 2026-03-01
> **Blueprint:** `docs/blueprints/CHECKLISTS.md`
> **Scope:** Backend only (no frontend, no reminder/n8n integration)

---

## Overview

Interactive to-do lists for three contexts: semester-based admin checklists, per-training checklists, and per-tournament checklists. Items are filtered by the club's active classifications (Sportamt Zurich, SFV, FVRZ). Custom items survive semester resets.

## Data Model

Four new tables in `database.ts` SCHEMA:

- **`club_classifications`** — which official bodies a club belongs to. Unique on `(club_id, classification)`.
- **`checklist_templates`** — reusable template definitions with type, classification filter (nullable comma-separated), and JSON items array.
- **`checklist_instances`** — concrete checklists: one per semester for admin type, one per event for training/tournament. FK to `template_id` and optionally `event_id`.
- **`checklist_items`** — individual items with completion tracking (`completed`, `completed_at`, `completed_by`) and `is_custom` flag.

Three indexes: `event_id`, `semester`, `instance_id`.

## Semester Logic

- Spring: Feb 1 – Jul 31 → `"YYYY-spring"`
- Autumn: Aug 1 – Jan 31 → `"YYYY-autumn"` (January = previous year's autumn)
- Admin checklists auto-reset on app startup when semester changes

## Classification Filtering

- Templates have nullable `classification_filter` (comma-separated tags)
- `null` = universal (applies to all clubs)
- Only templates matching at least one of the club's active classifications are included
- Mid-semester classification changes: adds new items, never removes existing ones

## Auto-Creation on Events

After `POST /api/events`:
- `type === "training"` → `ensureTrainingChecklist(eventId)` (idempotent)
- `type === "tournament"` → `ensureTournamentChecklist(eventId)` (idempotent)

## Custom Items

- Users add custom items (`is_custom = 1`) to any checklist
- Preserved across semester resets (copied unchecked to new instance)
- Only custom items can be deleted; template items return 403

## API Endpoints

All under `/api/admin/checklists`, requiring auth (coach or admin role):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/checklists` | List instances (filter: type, eventId, status) |
| GET | `/checklists/:id` | Instance with all items |
| POST | `/checklists` | Create custom checklist |
| PUT | `/checklists/:id/items/:itemId` | Toggle completion / update label |
| POST | `/checklists/:id/items` | Add custom item |
| DELETE | `/checklists/:id/items/:itemId` | Delete custom item only |
| PUT | `/checklists/:id/reorder` | Reorder items |

Classification management (admin only):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/classifications` | Get active classifications |
| PUT | `/admin/classifications` | Update classifications + refilter active admin checklist |

## File Structure

| File | Action |
|------|--------|
| `server/src/database.ts` | Add 4 tables + 3 indexes + template seeding |
| `server/src/models/checklist.model.ts` | **New** — TypeScript interfaces |
| `server/src/data/checklist-templates.ts` | **New** — seed data array |
| `server/src/services/checklist.service.ts` | **New** — business logic |
| `server/src/services/__tests__/checklist.test.ts` | **New** — unit tests |
| `server/src/routes/checklists.routes.ts` | **New** — Express router |
| `server/src/routes/__tests__/checklists.test.ts` | **New** — route tests |
| `server/src/routes/events.ts` | **Modify** — hook auto-creation |
| `server/src/index.ts` | **Modify** — register router |

## Out of Scope

- Reminder/n8n integration (no `deadline` column)
- Frontend UI
