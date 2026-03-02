# Security Audit Widget — Design

## Goal

Show security audit results as a widget on the Settings page, with warnings/passes listed and a button to manually re-run the audit.

## Architecture

### Backend

**Service:** `server/src/services/security-audit.ts`

TypeScript module that runs self-checks and returns structured results. Each check produces:

```ts
interface AuditCheck {
  id: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  detail?: string;
}

interface AuditResult {
  timestamp: string;
  checks: AuditCheck[];
  summary: { pass: number; warn: number; fail: number };
}
```

**Checks implemented:**

| ID | Category | Description |
|----|----------|-------------|
| `db-permissions` | File Permissions | SQLite file not world-readable |
| `db-http-exposure` | File Permissions | DB file not served via static middleware |
| `env-permissions` | File Permissions | .env file not world-readable |
| `cors-config` | Configuration | CORS origin is not wildcard in production |
| `admin-passwords` | Authentication | Admin accounts have strong passwords |
| `security-txt` | Disclosure | public/.well-known/security.txt exists |
| `https-production` | Configuration | HTTPS enforced when NODE_ENV=production |
| `gitignore-coverage` | Configuration | .gitignore covers .env, *.db, node_modules |

**Route:** `server/src/routes/security-audit.ts`

- `GET /api/security-audit` — admin-only, runs all checks, returns `AuditResult`

### Frontend

New card widget on the Settings page (after Club Profile):

- **Header:** "Security Audit" with status badge (green/amber/red)
- **Summary line:** "X passed, Y warnings, Z failures"
- **Check list:** grouped by status (failures first, warnings, passes), each with icon and message
- **"Run Audit" button:** triggers `GET /api/security-audit`, shows spinner while running
- **Timestamp:** "Last run: ..." shown below button

### Visual Style

Matches existing card pattern (`cardClass`). Uses the same color scheme:
- Pass: emerald/green
- Warn: amber/yellow
- Fail: red

## Files to Create/Modify

1. **Create** `server/src/services/security-audit.ts` — audit logic
2. **Create** `server/src/routes/security-audit.ts` — API route
3. **Modify** `server/src/index.ts` — register route
4. **Modify** `web/src/app/settings/page.tsx` — add widget
5. **Create** `server/src/__tests__/security-audit.test.ts` — tests
