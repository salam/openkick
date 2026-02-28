# Data Privacy & GDPR — Design (PRD 4.5.5)

**Date:** 2026-02-28
**Status:** Approved
**Scope:** Data export, data deletion, explicit consent tracking

## Decisions

| Decision | Choice |
|---|---|
| Export format | JSON + CSV (both in a ZIP) |
| Deletion strategy | Anonymize attendance, delete PII |
| Consent model | Single consent flag with timestamps |
| Access control | Guardian submits request → admin approves |
| Architecture | Request queue table (`gdpr_requests`) |

## Database Changes

### New table: `gdpr_requests`

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| guardianId | INTEGER FK | References guardians(id) |
| type | TEXT | `'export'` or `'deletion'` |
| status | TEXT | `'pending'`, `'approved'`, `'rejected'`, `'completed'` |
| reason | TEXT | Optional reason from guardian |
| adminNote | TEXT | Optional note from admin |
| processedBy | INTEGER FK | Admin who approved/rejected (guardians.id) |
| createdAt | TEXT | ISO timestamp |
| processedAt | TEXT | ISO timestamp when approved/rejected |
| completedAt | TEXT | ISO timestamp when fully processed |
| resultPath | TEXT | For exports: path to the generated ZIP |

### Alter `guardians` table

Add columns:
- `consentGivenAt` TEXT — ISO timestamp when consent was given
- `consentWithdrawnAt` TEXT — ISO timestamp when consent was withdrawn

Existing `consentGiven` (INTEGER 0/1) stays as the active flag.

## Consent Tracking

- **Endpoint:** `PUT /api/guardians/:id/consent`
- **Body:** `{ consent: true | false }`
- **Give consent:** sets `consentGiven=1`, `consentGivenAt=now()`, clears `consentWithdrawnAt`
- **Withdraw consent:** sets `consentGiven=0`, `consentWithdrawnAt=now()`
- **Auth:** Token auth (parent link) or JWT (admin). Guardian can only update own consent; admin can update any.

## Data Export Flow

1. Guardian visits parent link → clicks "Request Data Export"
2. `POST /api/gdpr/requests` with `{ type: 'export' }` → creates pending request
3. Admin sees pending request in dashboard → reviews → approves
4. `PUT /api/gdpr/requests/:id` with `{ status: 'approved' }` → triggers export
5. System generates ZIP:
   - `guardian.json` / `guardian.csv` — name, phone, email, role, language, consent history
   - `players.json` / `players.csv` — linked players (name, yearOfBirth, category, position)
   - `attendance.json` / `attendance.csv` — all attendance records for linked players
6. ZIP stored on disk at `data/gdpr-exports/` with request ID as filename
7. Guardian downloads via `GET /api/gdpr/exports/:requestId` (token-authenticated)
8. File auto-deleted after 7 days (cleanup on server startup or via cron)

## Data Deletion Flow

1. Guardian clicks "Request Data Deletion"
2. `POST /api/gdpr/requests` with `{ type: 'deletion', reason: '...' }`
3. Admin reviews and approves
4. On approval, system executes in a transaction:
   - Replace player `name` with `"Deleted Player"` for all linked players
   - Clear `yearOfBirth`, `position`, `notes` on those players
   - Delete rows from `guardian_players` for this guardian
   - Delete the guardian record (phone, name, email, passwordHash, accessToken, etc.)
   - Attendance records remain linked to anonymized players
   - Update request: `status='completed'`, `completedAt=now()`

## API Routes

New route file: `server/src/routes/gdpr.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| PUT | `/api/guardians/:id/consent` | Token or JWT | Update consent flag |
| POST | `/api/gdpr/requests` | Token | Guardian creates export/deletion request |
| GET | `/api/gdpr/requests` | JWT (admin) | List all GDPR requests |
| GET | `/api/gdpr/requests/:id` | JWT (admin) | Get single request detail |
| PUT | `/api/gdpr/requests/:id` | JWT (admin) | Approve or reject request |
| GET | `/api/gdpr/exports/:id` | Token | Download export ZIP |

## New Service

`server/src/services/gdpr.ts`

Responsibilities:
- **createRequest(guardianId, type, reason?)** — insert into gdpr_requests
- **listRequests(filters?)** — query requests with optional status filter
- **approveRequest(requestId, adminId)** — mark approved, trigger processing
- **rejectRequest(requestId, adminId, note?)** — mark rejected
- **generateExport(guardianId, requestId)** — query data, format JSON+CSV, create ZIP
- **executeDeletion(guardianId, requestId)** — anonymize players, delete guardian, update request
- **updateConsent(guardianId, consent)** — update consent fields with timestamps
- **cleanupExpiredExports()** — delete ZIPs older than 7 days

## Testing Strategy

- Unit tests for GDPR service (export generation, deletion anonymization, consent updates)
- Route/integration tests for all endpoints (auth, request lifecycle, edge cases)
- Edge cases:
  - Deletion of guardian with no linked players
  - Export of guardian with many players and attendance records
  - Double-deletion attempt (request already completed)
  - Expired/missing export downloads
  - Consent toggle idempotency
  - Admin self-deletion prevention
