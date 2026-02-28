# Statistics & Reporting — Design Document

> **PRD reference:** Section 4.5.9
> **Blueprint:** `docs/blueprints/STATISTICS.md`
> **Date:** 2026-03-01

---

## 1. Overview

Full-stack statistics & reporting feature for OpenKick. Computes aggregated training, attendance, and tournament numbers for three audiences:

1. **Coaches/Admins** — dashboard page with charts, cards, tables, and CSV/PDF export
2. **Club board** — semester/school-year summaries via export
3. **Public homepage** — headline numbers (cached, no auth)

## 2. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Computation model | Direct SQL + homepage cache (1h TTL) | Small dataset (~100 players), no need for materialized views |
| PDF library | pdfmake | Declarative table layouts, no canvas dependency |
| Charts library | chart.js + react-chartjs-2 | Lightweight (~60KB), well-supported |
| DB migrations | None | All required tables exist (`events`, `attendance`, `training_schedule`, `tournament_results`, etc.) |
| Session duration | Derived from `training_schedule` join, 90 min fallback | Per blueprint Option A |
| Trophies | Query `tournament_results` table | Table already exists (was TODO in blueprint) |
| Anonymisation | Admin endpoints: full nicknames. Public/export: player initials via existing initials service | Coach needs identification; public uses initials |
| No-show heuristic | `status = 'unknown'` after event date, or `status = 'absent'` with no reason | Per blueprint section 7.4 |

## 3. Semester/Period Definitions

| Period | Start | End | Label |
|--------|-------|-----|-------|
| Spring | Feb 1 | Jul 31 | "Spring 2026" |
| Autumn | Aug 1 | Jan 31 (next year) | "Autumn 2025/26" |
| School year | Aug 1 | Jul 31 (next year) | "2025/26" |

Query param formats: `spring-2026`, `autumn-2025`, `year-2025`, `current`, `current-year`.

## 4. Backend — New Files

| File | Purpose |
|------|---------|
| `server/src/utils/semester.ts` | `getSemesterBounds()`, `getSchoolYearBounds()`, `parsePeriodParam()` |
| `server/src/services/statistics.service.ts` | Query functions: training hours, person hours, coach hours, no-shows, attendance rate, tournament participation, homepage stats. In-memory homepage cache (1h TTL). |
| `server/src/services/export.service.ts` | `generateCSV()` (BOM + semicolon delimiter) and `generatePDF()` (pdfmake) |
| `server/src/routes/statistics.ts` | Admin stats endpoints (auth required) |
| `server/src/routes/public/homepage-stats.ts` | Public homepage stats (no auth, cached) |

### Backend — Modified Files

| File | Change |
|------|--------|
| `server/src/index.ts` | Register `statisticsRouter` and `homepageStatsRouter` |
| `server/src/routes/settings.ts` | Add GET/PUT for `homepage_stats_settings` |

## 5. API Endpoints

### 5.1 Admin Stats (auth + coach/admin role)

| Method | Path | Query Params | Response |
|--------|------|-------------|----------|
| GET | `/api/admin/stats/training-hours` | `team?`, `period?` | `TrainingHoursResult[]` |
| GET | `/api/admin/stats/person-hours` | `team?`, `period?` | `PersonHoursResult[]` |
| GET | `/api/admin/stats/coach-hours` | `coach?`, `period?` | `CoachHoursResult[]` |
| GET | `/api/admin/stats/no-shows` | `team?`, `period?` | `NoShowResult[]` |
| GET | `/api/admin/stats/attendance-rate` | `team?`, `period?` | `AttendanceRateResult[]` |
| GET | `/api/admin/stats/tournament-participation` | `period?` | `TournamentParticipationResult[]` |
| GET | `/api/admin/stats/export` | `format` (csv/pdf), `type`, `period?` | Binary file download |

### 5.2 Homepage Stats Settings (auth + admin role)

| Method | Path | Body/Response |
|--------|------|---------------|
| GET | `/api/admin/settings/homepage-stats` | `HomepageStatsSettings` |
| PUT | `/api/admin/settings/homepage-stats` | Partial `HomepageStatsSettings` |

### 5.3 Public Homepage Stats (no auth)

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/public/homepage-stats` | `HomepageStats` (filtered by visibility settings) |

## 6. Frontend — New Files

| File | Purpose |
|------|---------|
| `web/src/app/dashboard/stats/page.tsx` | Full statistics page |
| `web/src/components/stats/TrainingHoursChart.tsx` | Bar chart — training hours per team |
| `web/src/components/stats/AttendanceRateChart.tsx` | Bar chart — attendance rate per player |
| `web/src/components/stats/CoachHoursCard.tsx` | Summary card — coach hours |
| `web/src/components/stats/NoShowsTable.tsx` | Table — no-show rates |
| `web/src/components/stats/TournamentStatsCard.tsx` | Card — tournament participation |
| `web/src/components/stats/PersonHoursChart.tsx` | Bar chart — person-hours |
| `web/src/components/stats/StatsExportButton.tsx` | CSV/PDF download button |
| `web/src/components/stats/SemesterPicker.tsx` | Period selector dropdown |
| `web/src/components/HomepageStatsBar.tsx` | Public homepage stats row |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `web/src/app/dashboard/page.tsx` | Add stats highlights widget |
| `web/src/app/page.tsx` | Add `HomepageStatsBar` |
| `web/src/lib/api.ts` | Add stats API functions |
| Dashboard settings | Add homepage stats visibility toggles |

## 7. Dashboard Stats Page Layout

- **Top bar:** SemesterPicker + StatsExportButton (CSV | PDF)
- **Row 1:** Three summary cards — Training Hours total, Person-Hours total, Active Coaches
- **Row 2:** AttendanceRateChart (bar) + NoShowsTable
- **Row 3:** CoachHoursCard + TournamentStatsCard

## 8. Homepage Stats Bar

Horizontal row of metric cards: "42 Athletes · 12 Tournaments · 3 Trophies · 180 Sessions"

- Admin toggles which metrics are visible (settings page)
- Aggregate counts only — no individual player data exposed
- Cached server-side (1h TTL), invalidated on settings change

## 9. Edge Cases

Per blueprint section 11:
- No data → empty arrays / zeros (never errors)
- Mid-semester → queries return data up to today
- Player switched teams → counted in both teams' stats per session
- Division by zero → return rate 0
- Future events → excluded from no-show/attendance rate, included in training hours
- No training_schedule match → default 90 min

## 10. Testing Strategy

- **Unit tests:** `semester.test.ts` (boundary dates), `statistics.service.test.ts` (each query function with seeded data), `export.service.test.ts` (CSV shape, PDF buffer)
- **Integration tests:** `statistics.routes.test.ts` (auth, role, happy path, export), `homepage-stats.routes.test.ts` (public access, settings filtering, cache behaviour)
