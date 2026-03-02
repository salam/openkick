# Security Audit Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a security audit widget to the Settings page that runs TypeScript-based self-checks and displays results with a manual re-run button.

**Architecture:** A `security-audit` service runs checks (file permissions, DB exposure, CORS, admin passwords, etc.) and returns structured results. A new route exposes this via `GET /api/security-audit` (admin-only). The frontend renders results as a card widget on the Settings page.

**Tech Stack:** Express.js route, Node.js `fs`/`path` for file checks, `fetch` for HTTP self-check, React frontend with existing Tailwind card pattern.

---

### Task 1: Create the security audit service

**Files:**
- Create: `server/src/services/security-audit.ts`
- Create: `server/src/services/__tests__/security-audit.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/security-audit.test.ts` with tests that:
- Verify `runSecurityAudit()` returns `{ timestamp, checks[], summary }`
- Verify each check has `{ id, category, status, message }`
- Verify summary counts match the checks array

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/security-audit.test.ts`
Expected: FAIL — module not found

**Step 3: Write the service implementation**

Create `server/src/services/security-audit.ts` with these checks:

| ID | What it checks |
|----|---------------|
| `db-permissions` | SQLite file not world-readable (`o+r` bit) |
| `db-http-exposure` | DB file not served via static middleware (self-fetch HEAD request) |
| `env-permissions` | `.env` file not world-readable |
| `cors-config` | `CORS_ORIGIN` not wildcard in production |
| `admin-passwords` | All admin accounts have password hashes set |
| `security-txt` | `public/.well-known/security.txt` exists |
| `https-production` | CORS origin uses HTTPS when `NODE_ENV=production` |
| `gitignore-coverage` | `.gitignore` covers `.env`, `*.db`, `node_modules` |

Types exported:
```ts
interface AuditCheck {
  id: string;
  category: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
}

interface AuditResult {
  timestamp: string;
  checks: AuditCheck[];
  summary: { pass: number; warn: number; fail: number };
}
```

Main export: `async function runSecurityAudit(): Promise<AuditResult>`

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/security-audit.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/security-audit.ts server/src/services/__tests__/security-audit.test.ts && git commit -m "feat: add security audit service with 8 self-checks" -- server/src/services/security-audit.ts server/src/services/__tests__/security-audit.test.ts
```

---

### Task 2: Create the API route

**Files:**
- Create: `server/src/routes/security-audit.ts`
- Create: `server/src/routes/__tests__/security-audit.test.ts`
- Modify: `server/src/index.ts` (add import and register route)

**Step 1: Write the failing test**

Create `server/src/routes/__tests__/security-audit.test.ts` following the pattern from `server/src/routes/__tests__/settings.test.ts`:
- Set up express app with `initDB()`, mount the router
- Test `GET /api/security-audit` with admin JWT returns 200 with audit result shape

Use `generateJWT({ id: 1, role: "admin" })` from `../../auth.js` for the auth token.

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/security-audit.test.ts`
Expected: FAIL — module not found

**Step 3: Create the route**

Create `server/src/routes/security-audit.ts`:
- Export `securityAuditRouter` (Express Router)
- `GET /security-audit` with `authMiddleware` + `requireRole("admin")` guards
- Calls `runSecurityAudit()` and returns JSON result

**Step 4: Register in `server/src/index.ts`**

- Add import: `import { securityAuditRouter } from "./routes/security-audit.js";`
- Add route: `app.use("/api", securityAuditRouter);`

**Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/__tests__/security-audit.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/routes/security-audit.ts server/src/routes/__tests__/security-audit.test.ts server/src/index.ts && git commit -m "feat: add GET /api/security-audit route (admin-only)" -- server/src/routes/security-audit.ts server/src/routes/__tests__/security-audit.test.ts server/src/index.ts
```

---

### Task 3: Add the Security Audit widget to the Settings page

**Files:**
- Modify: `web/src/app/settings/page.tsx`

**Step 1: Add state and handler**

Add state variables:
- `auditResult` — holds the API response (or null)
- `runningAudit` — loading state for the button
- `auditExpanded` — toggles detail list visibility

Add `handleRunAudit()` function that calls `apiFetch('/api/security-audit')`.

**Step 2: Add the widget card JSX**

Place it after the Club Profile card, before LLM Configuration. Uses existing `cardClass` and `btnSecondary` styles.

Widget structure:
- Header row: "Security Audit" title + status badge (green/amber/red) + "Run Audit" button
- Description text
- Summary line: "X passed, Y warnings, Z failures"
- Expandable details: checks listed with status icons, sorted failures-first
- Each check shows icon, message, optional detail, and category
- Timestamp at the bottom

Color scheme:
- Pass: emerald (matches existing app style)
- Warn: amber
- Fail: red

**Step 3: Verify frontend compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add web/src/app/settings/page.tsx && git commit -m "feat: add security audit widget to settings page" -- web/src/app/settings/page.tsx
```

---

### Task 4: Run all tests and verify

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All pass

**Step 2: Run frontend type check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors
