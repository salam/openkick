# Surveys & Questionnaires — Design Document

> Date: 2026-03-01
> PRD: 4.5.11 | Blueprint: docs/blueprints/SURVEYS.md

## Overview

Backend implementation for a lightweight survey/questionnaire system. Coaches create surveys with 5 question types; parents respond via shareable public links or QR codes. Two modes: anonymous (no identifiers) and identified (player nickname only). Includes two built-in templates (Trikot order, end-of-semester feedback), deadline enforcement, duplicate prevention, and result aggregation.

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `server/src/models/survey.model.ts` | TypeScript interfaces |
| `server/src/services/survey.service.ts` | CRUD, validation, aggregation, templates |
| `server/src/routes/surveys.routes.ts` | Admin endpoints (auth required) |
| `server/src/routes/public/survey-respond.routes.ts` | Public endpoints (no auth) |
| `server/src/services/__tests__/surveys.test.ts` | Service-layer tests |
| `server/src/routes/__tests__/surveys.test.ts` | Route-layer tests |

### Modified Files

| File | Change |
|------|--------|
| `server/src/database.ts` | Add 4 tables + unique index |
| `server/src/index.ts` | Register admin + public routers |
| `package.json` (server) | Add `qrcode` dependency |

## Database Schema

4 tables: `surveys`, `survey_questions`, `survey_responses`, `survey_answers`. Unique index on `(survey_id, player_nickname) WHERE player_nickname IS NOT NULL` for duplicate prevention. Full DDL in blueprint section 4.

## API Endpoints

### Admin (auth required, `/api/admin`)

- `POST /surveys` — Create survey with questions
- `GET /surveys` — List surveys (optional `?team_id=`)
- `GET /surveys/:id` — Get survey + questions
- `GET /surveys/:id/results` — Aggregated results
- `PUT /surveys/:id/close` — Close survey
- `PUT /surveys/:id/archive` — Archive survey
- `POST /surveys/templates/trikot-order` — Create from Trikot template
- `POST /surveys/templates/feedback` — Create from feedback template

### Public (no auth, `/api/public`)

- `GET /surveys/:id` — Survey metadata + questions (410 if closed)
- `POST /surveys/:id/respond` — Submit response (201/400/409/410)
- `GET /surveys/:id/qr` — QR code PNG

## Key Decisions

1. **Blueprint-faithful**: Follow blueprint exactly for file structure and conventions
2. **models/ directory**: New pattern for this module (types are substantial enough)
3. **routes/public/ directory**: New pattern for unauthenticated endpoints
4. **Payment stub**: `price_per_item` column included with TODO comment for future integration
5. **QR codes**: Generated on-the-fly, not stored
6. **Privacy**: Only nicknames, no PII. Anonymous results strip identifiers.

## Testing

23 test cases: 16 service-layer (CRUD, validation, aggregation, templates) + 7 route-layer (HTTP status codes, content types). In-memory SQLite via `initDB()`.

## Implementation Order

Per blueprint section 13: Schema → Models → Service CRUD → Submission → Aggregation → Templates → Admin routes → Public routes → QR endpoint → Route registration → Tests → Payment stub.
