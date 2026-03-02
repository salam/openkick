#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# tools/security-audit.sh — Extended security audit for development
# ──────────────────────────────────────────────────────────────────────
# Run this during development / CI to catch security issues early.
# Exit code 0 = all checks passed, non-zero = findings detected.
#
# Usage:
#   ./tools/security-audit.sh            # full audit
#   ./tools/security-audit.sh --quick    # fast subset (CI-friendly)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

FINDINGS=0
WARNINGS=0

# ── Helpers ──────────────────────────────────────────────────────────

pass()    { echo -e "  ${GREEN}✔${RESET} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $1"; WARNINGS=$((WARNINGS + 1)); }
fail()    { echo -e "  ${RED}✘${RESET} $1"; FINDINGS=$((FINDINGS + 1)); }
section() { echo -e "\n${BOLD}── $1 ──${RESET}"; }

QUICK=false
[[ "${1:-}" == "--quick" ]] && QUICK=true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo -e "${BOLD}OpenKick Security Audit${RESET}"
echo "Root: $ROOT"
echo "Mode: $( $QUICK && echo 'quick' || echo 'full' )"
echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ── 1. Secrets in source ────────────────────────────────────────────

section "1. Hardcoded secrets & credentials"

# Patterns that strongly suggest leaked secrets
SECRET_PATTERNS=(
  'password\s*[:=]\s*["\x27][^"\x27]{3,}'
  'secret\s*[:=]\s*["\x27][^"\x27]{3,}'
  'api[_-]?key\s*[:=]\s*["\x27][^"\x27]{3,}'
  'token\s*[:=]\s*["\x27][^"\x27]{3,}'
  'AWS_SECRET_ACCESS_KEY'
  'PRIVATE[_-]KEY'
  'BEGIN (RSA |EC |DSA )?PRIVATE KEY'
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  hits=$(grep -rniE "$pattern" --include='*.ts' --include='*.js' --include='*.json' \
    --include='*.yml' --include='*.yaml' --include='*.env' --include='*.sh' \
    --exclude-dir=node_modules --exclude-dir=.git --exclude='*.example' \
    --exclude='security-audit.sh' "$ROOT" 2>/dev/null | \
    grep -viE '(process\.env|\.env\.example|placeholder|changeme|TODO|FIXME|example\.com|<|REDACTED)' || true)
  if [[ -n "$hits" ]]; then
    fail "Potential secret matching /$pattern/:"
    echo "$hits" | head -5 | sed 's/^/       /'
  fi
done

# Check for .env files committed (should be gitignored)
if git ls-files --cached | grep -qE '(^|/)\.env$'; then
  fail ".env file is tracked by git — must be in .gitignore"
else
  pass "No .env files tracked in git"
fi

# ── 2. Dependency vulnerabilities ───────────────────────────────────

section "2. Dependency vulnerabilities"

if [[ -f "$ROOT/server/package.json" ]]; then
  if command -v npm &>/dev/null; then
    pushd "$ROOT/server" >/dev/null
    if [[ -d node_modules ]]; then
      audit_output=$(npm audit --json 2>/dev/null || true)
      critical=$(echo "$audit_output" | grep -o '"critical":[0-9]*' | head -1 | cut -d: -f2)
      high=$(echo "$audit_output" | grep -o '"high":[0-9]*' | head -1 | cut -d: -f2)
      critical=${critical:-0}
      high=${high:-0}
      if [[ "$critical" -gt 0 ]]; then
        fail "npm audit: $critical critical vulnerabilities"
      elif [[ "$high" -gt 0 ]]; then
        warn "npm audit: $high high vulnerabilities"
      else
        pass "npm audit: no critical/high vulnerabilities"
      fi
    else
      warn "node_modules not found — run 'npm install' first for dependency audit"
    fi
    popd >/dev/null
  else
    warn "npm not found — skipping dependency audit"
  fi
fi

# ── 3. File permissions ─────────────────────────────────────────────

section "3. Sensitive file permissions"

# Database files should not be world-readable
for db in $(find "$ROOT" -name '*.sqlite3' -o -name '*.sqlite' -o -name '*.db' 2>/dev/null); do
  perms=$(stat -f '%Lp' "$db" 2>/dev/null || stat -c '%a' "$db" 2>/dev/null)
  if [[ "${perms: -1}" != "0" ]]; then
    fail "Database $db is world-readable (mode $perms)"
  else
    pass "Database $db permissions OK ($perms)"
  fi
done

# .env files should not be world-readable
for envfile in $(find "$ROOT" -name '.env' -not -path '*/node_modules/*' 2>/dev/null); do
  perms=$(stat -f '%Lp' "$envfile" 2>/dev/null || stat -c '%a' "$envfile" 2>/dev/null)
  if [[ "${perms: -1}" != "0" ]]; then
    fail ".env file $envfile is world-readable (mode $perms)"
  else
    pass ".env permissions OK ($perms)"
  fi
done

# ── 4. Docker / deployment checks ──────────────────────────────────

section "4. Docker & deployment configuration"

for compose in $(find "$ROOT" -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' 2>/dev/null); do
  # Running as root?
  if grep -qE 'user:\s*["'"'"']?root' "$compose"; then
    warn "$compose: container running as root"
  fi
  # Privileged mode?
  if grep -q 'privileged: true' "$compose"; then
    fail "$compose: container running in privileged mode"
  fi
  # Hardcoded passwords in compose?
  if grep -qiE '(password|secret|key):\s*["\x27]?[a-zA-Z0-9]{4,}' "$compose" | \
     grep -viE '(example|changeme|TODO|placeholder)' 2>/dev/null; then
    warn "$compose: possible hardcoded credential"
  fi
  pass "$compose checked"
done

# ── 5. TypeScript / code-level checks ──────────────────────────────

section "5. Code-level security patterns"

# SQL injection — raw string concatenation in queries
sql_hits=$(grep -rnE "(query|exec|run)\s*\(\s*['\`\"].*\\\$\{" \
  --include='*.ts' --include='*.js' \
  --exclude-dir=node_modules "$ROOT" 2>/dev/null || true)
if [[ -n "$sql_hits" ]]; then
  fail "Potential SQL injection (string interpolation in query):"
  echo "$sql_hits" | head -5 | sed 's/^/       /'
else
  pass "No obvious SQL injection patterns"
fi

# Dangerous code execution patterns (dynamic evaluation)
# We search for patterns like  eval(  and  new Function(  which allow
# arbitrary code execution and are flagged by OWASP guidelines.
DANGEROUS_EXEC_PATTERN='(\beval\s*\(|new\s+Function\s*\()'
dangerous_hits=$(grep -rnP "$DANGEROUS_EXEC_PATTERN" \
  --include='*.ts' --include='*.js' \
  --exclude-dir=node_modules "$ROOT" 2>/dev/null || true)
if [[ -n "$dangerous_hits" ]]; then
  fail "Dangerous dynamic code execution detected:"
  echo "$dangerous_hits" | head -5 | sed 's/^/       /'
else
  pass "No dangerous dynamic code execution"
fi

# Insecure randomness for security-sensitive operations
insecure_rand=$(grep -rnE 'Math\.random\(\)' \
  --include='*.ts' --include='*.js' \
  --exclude-dir=node_modules "$ROOT" 2>/dev/null | \
  grep -iE '(token|secret|password|key|salt|nonce|session|csrf)' || true)
if [[ -n "$insecure_rand" ]]; then
  fail "Math.random() used in security context (use crypto.randomBytes):"
  echo "$insecure_rand" | head -5 | sed 's/^/       /'
else
  pass "No insecure randomness in security contexts"
fi

# PII leakage in logs
pii_log=$(grep -rnE '(console\.(log|info|warn|error)|logger\.).*\b(phone|email|password|token)\b' \
  --include='*.ts' --include='*.js' \
  --exclude-dir=node_modules --exclude='security-audit.sh' "$ROOT" 2>/dev/null || true)
if [[ -n "$pii_log" ]]; then
  warn "Possible PII logged to console:"
  echo "$pii_log" | head -5 | sed 's/^/       /'
else
  pass "No obvious PII in log statements"
fi

# ── 6. CORS / security headers (code-level) ────────────────────────

if ! $QUICK; then
  section "6. Security headers & CORS"

  # Wildcard CORS
  cors_wild=$(grep -rnE "cors\(\s*\)|origin:\s*['\"]?\*" \
    --include='*.ts' --include='*.js' \
    --exclude-dir=node_modules "$ROOT" 2>/dev/null || true)
  if [[ -n "$cors_wild" ]]; then
    warn "Wildcard CORS detected (restrict origins in production):"
    echo "$cors_wild" | head -3 | sed 's/^/       /'
  else
    pass "No wildcard CORS"
  fi

  # Missing helmet / security headers
  if [[ -f "$ROOT/server/package.json" ]]; then
    if ! grep -q '"helmet"' "$ROOT/server/package.json"; then
      warn "helmet package not installed — consider adding security headers"
    else
      pass "helmet is a dependency"
    fi
  fi
fi

# ── 7. security.txt presence ───────────────────────────────────────

section "7. security.txt & disclosure"

if [[ -f "$ROOT/public/.well-known/security.txt" ]] || [[ -f "$ROOT/security.txt" ]]; then
  pass "security.txt found"
else
  warn "security.txt not found — create public/.well-known/security.txt"
fi

# ── 8. .gitignore coverage ─────────────────────────────────────────

section "8. .gitignore coverage"

if [[ -f "$ROOT/.gitignore" ]]; then
  for pattern in '.env' '*.sqlite3' '*.sqlite' '*.db' 'node_modules' '/backups'; do
    if grep -qF "$pattern" "$ROOT/.gitignore"; then
      pass "$pattern in .gitignore"
    else
      warn "$pattern not in .gitignore"
    fi
  done
else
  fail "No .gitignore found"
fi

# ── Summary ─────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}═══════════════════════════════════════${RESET}"
if [[ $FINDINGS -gt 0 ]]; then
  echo -e "${RED}${BOLD}  FAIL${RESET} — $FINDINGS finding(s), $WARNINGS warning(s)"
  echo -e "${BOLD}═══════════════════════════════════════${RESET}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}${BOLD}  WARN${RESET} — 0 findings, $WARNINGS warning(s)"
  echo -e "${BOLD}═══════════════════════════════════════${RESET}"
  exit 0
else
  echo -e "${GREEN}${BOLD}  PASS${RESET} — no findings, no warnings"
  echo -e "${BOLD}═══════════════════════════════════════${RESET}"
  exit 0
fi
