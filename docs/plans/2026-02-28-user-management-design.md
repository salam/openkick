# User Management Widget — Design

**Date:** 2026-02-28
**Location:** Settings page widget (card), consistent with existing settings cards

## Overview

Add a "Users" card to the settings page showing all registered coaches and admins. Admins can change roles, reset passwords, and invite new users. Coaches see the list read-only but can invite other coaches.

## Permissions

| Action | Admin | Coach |
|--------|-------|-------|
| View user list | ✓ | ✓ |
| Change roles (admin ↔ coach) | ✓ | ✗ |
| Reset password (sends email) | ✓ | ✗ |
| Invite new coach | ✓ | ✓ |
| Invite new admin | ✓ | ✗ |

**Constraints:**
- An admin cannot demote themselves if they are the last admin.
- A coach can only invite with role `coach`, never `admin`.

## Backend — New API Endpoints

New route file: `server/src/routes/users.ts`

| Method | Path | Auth Required | Role Required | Description |
|--------|------|---------------|---------------|-------------|
| `GET` | `/api/users` | Yes | coach, admin | List coaches/admins (id, name, email, role, createdAt) |
| `PUT` | `/api/users/:id/role` | Yes | admin | Change role. Body: `{ role: 'admin' | 'coach' }`. Prevents last-admin demotion. |
| `POST` | `/api/users/:id/reset-password` | Yes | admin | Generates resetToken + sends existing password-reset email to the user. |
| `POST` | `/api/users/invite` | Yes | coach, admin | Body: `{ name, email, role }`. Creates guardian row, generates resetToken, sends setup email. Coach callers are restricted to `role: 'coach'`. |

### Invite Flow

1. Create a `guardians` row with: email (in `phone` column per existing convention), name, role, no passwordHash yet.
2. Generate a `resetToken` and `resetTokenExpiry` (same as forgot-password).
3. Send the password-reset email — which serves as a "set your password" email for the new user.
4. Return the new user record (id, name, email, role).

### Reset Password Flow

1. Look up the guardian by id, verify role is coach/admin.
2. Generate a new `resetToken` + `resetTokenExpiry`.
3. Send the existing password-reset email.
4. Return 204.

## Frontend — Users Card

Added to `web/src/app/settings/page.tsx` as a new card section.

### Layout

- **Header:** "Users" with an "Invite User" button (visible to admins and coaches)
- **Table columns:** Name | Email | Role | Actions
- **Role column:**
  - Admin view: dropdown select (admin/coach) — triggers `PUT /api/users/:id/role`
  - Coach view: static badge
- **Actions column (admin only):**
  - "Reset Password" button → confirmation dialog → triggers reset email
- **Coach view:** No actions column, no role dropdowns

### Invite Dialog

Small inline form or modal:
- Fields: Name (text), Email (text), Role (dropdown: coach, or coach/admin for admins)
- Submit → `POST /api/users/invite`
- On success: new row appears in table, success toast

### Data Flow

1. Settings page mounts → `GET /api/users` fetched alongside existing settings
2. Current user's role determined from JWT (already available in app)
3. Role change → optimistic UI update → `PUT /api/users/:id/role`
4. Password reset → confirmation prompt → `POST /api/users/:id/reset-password` → success toast
5. Invite → form submit → `POST /api/users/invite` → table refresh

## Scope Exclusions

- Parents are not shown (they use passwordless auth, managed separately)
- No user deletion (out of scope for now)
- No bulk operations
