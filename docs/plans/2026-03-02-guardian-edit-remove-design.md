# Design: Edit & Remove Guardians from Players

**Date:** 2026-03-02

## Problem

Guardians can be added/linked to players, but there is no way to edit guardian details, unlink a guardian from a player, or delete a guardian entirely.

## Solution

### Backend — 3 new endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/guardians/:id` | PUT | Edit guardian details (name, phone, email) |
| `/api/guardians/:guardianId/players/:playerId` | DELETE | Unlink guardian from player (junction row only) |
| `/api/guardians/:id` | DELETE | Delete guardian entirely (all links + record) |

**Constraints:**
- `DELETE /api/guardians/:id` rejects if guardian has `coach` or `admin` role (prevent accidental lockout).
- `PUT /api/guardians/:id` enforces phone uniqueness (existing DB constraint).

### Frontend — Player edit modal

Each linked guardian row in the player edit form gets:
- **Edit icon** — inline editing for name, phone, email
- **Unlink button** (X) — removes guardian-player link with confirmation
- **Delete button** (trash) — deletes guardian entirely with strong warning

**Confirmation dialogs:**
- Unlink: "Remove [guardian] from [player]?"
- Delete: "This will permanently delete [guardian] and remove them from all linked players. Cannot be undone." Blocked for coach/admin roles.

### Tests

- Unlink: verify junction row removed, guardian still exists
- Delete: verify guardian + all links removed
- Delete: reject for coach/admin role
- Edit: verify fields update, phone uniqueness enforced
- Frontend: buttons render, confirmations appear, state refreshes
