# WAHA Fork (No Docker) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fork WAHA, strip it to NOWEB-only without Docker, add it as a git submodule, and integrate it into the openkick deploy pipeline so it runs as a plain Node.js process on Cyon shared hosting.

**Architecture:** WAHA runs as a sibling Node.js process to the openkick server. Both deploy to Cyon via rsync. WAHA listens on port 40405 (configurable), openkick server on 40404. The openkick server talks to WAHA via REST at `http://127.0.0.1:40405`. WAHA sends webhooks back to `http://127.0.0.1:40404/api/whatsapp/webhook`.

**Tech Stack:** NestJS (WAHA), Node.js 22, Baileys (NOWEB engine), SQLite (session storage), npm (package manager — converted from Yarn)

**Design doc:** `docs/plans/2026-03-04-waha-fork-no-docker-design.md`

---

### Task 1: Fork WAHA and Add as Git Submodule

**Step 1: Fork WAHA on GitHub**

Go to https://github.com/devlikeapro/waha and click "Fork" to create `github.com/<your-username>/waha`.

**Step 2: Add the fork as a git submodule**

Run:
```bash
cd /Users/matthias/Development/openkick
git submodule add -b core https://github.com/<your-username>/waha.git waha
```

**Step 3: Verify submodule is checked out**

Run: `ls waha/src/main.ts`
Expected: file exists

**Step 4: Add `waha/` to `.gitignore` node_modules**

Verify `waha/node_modules` is gitignored (submodule has its own `.gitignore`).

**Step 5: Commit**

```bash
git add .gitmodules waha
git commit -m "chore: add WAHA fork as git submodule"
```

---

### Task 2: Strip Docker and Unused Engines from WAHA Fork

**Files to delete:**
- `waha/Dockerfile`
- `waha/docker-compose.yaml`
- `waha/docker-compose/` (entire directory)
- `waha/entrypoint.sh` (if exists)
- `waha/src/core/engines/webjs/` (entire directory)
- `waha/src/core/engines/gows/` (entire directory)
- `waha/src/core/engines/waproto/` (entire directory — if not needed by NOWEB)

**Step 1: Delete Docker files**

Run:
```bash
cd waha
rm -f Dockerfile docker-compose.yaml entrypoint.sh
rm -rf docker-compose/
```

**Step 2: Delete unused engine directories**

Run:
```bash
rm -rf src/core/engines/webjs/
rm -rf src/core/engines/gows/
```

**Step 3: Check if waproto is used by NOWEB**

Run: `grep -r "waproto" src/core/engines/noweb/`
- If no results → delete `rm -rf src/core/engines/waproto/`
- If referenced → keep it

**Step 4: Find and fix all imports referencing deleted engines**

Run: `grep -rn "webjs\|gows\|WEBJS\|GOWS" src/ --include="*.ts"`

For each hit, either:
- Remove the import/reference if it's an engine registration
- Replace with a no-op or remove the branch

Key files to patch:
- `src/core/app.module.core.ts` — remove WEBJS/GOWS engine registrations
- `src/core/engines/const.ts` — remove engine enum entries for WEBJS/GOWS
- Any engine factory or switch that selects engines

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors (fix any remaining broken imports)

**Step 6: Commit in the WAHA submodule**

```bash
cd waha
git add -A
git commit -m "feat: strip Docker, WEBJS, and GOWS — NOWEB-only build"
```

---

### Task 3: Convert from Yarn to npm and Strip Heavy Dependencies

**Step 1: Remove Yarn artifacts**

```bash
cd waha
rm -f yarn.lock .yarnrc.yml
rm -rf .yarn/
```

**Step 2: Edit `package.json` — remove `packageManager` field**

Remove the `"packageManager": "yarn@4.9.2"` line from `package.json`.

**Step 3: Remove heavy/unused dependencies from `package.json`**

Remove these from `dependencies`:
- `puppeteer` (WEBJS only)
- `whatsapp-web.js` (WEBJS only)
- `mongodb` / `@nestjs/mongoose` / `mongoose` (not needed, using SQLite)
- `pg` / `@nestjs/typeorm` (not needed)
- `ioredis` (not needed)
- `bullmq` / `@nestjs/bullmq` / `@bull-board/*` (job queue, not needed for single-instance)
- `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` (not needed)
- `sharp` (if only used by WEBJS screenshot)
- `@grpc/*` / `@nestjs/microservices` (gRPC, not needed)

Keep:
- `@whiskeysockets/baileys` or the fork used (NOWEB engine)
- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`
- `better-sqlite3` or `sql.js` (session storage)
- `axios` (HTTP client)
- `class-validator`, `class-transformer`
- `nestjs-pino`, `pino-pretty` (logging)
- `qrcode` (QR generation)
- `passport`, `@nestjs/passport` (auth)
- `@nestjs/swagger` (API docs — optional but useful)

**Step 4: Run `npm install`**

```bash
npm install
```

Expected: `package-lock.json` created, no errors.

**Step 5: Verify build**

```bash
npx nest build
```

Fix any missing dependency errors by adding back needed packages.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: convert to npm, remove unused heavy dependencies"
```

---

### Task 4: Patch NestJS Module to NOWEB-Only

**File:** `waha/src/core/app.module.core.ts`

**Step 1: Read the current module file and understand engine registration**

Look for where engines are registered/configured. There's likely an `EngineConfigService` or factory that maps engine names to implementations.

**Step 2: Patch engine configuration to only allow NOWEB**

In the engine config/factory, hardcode NOWEB as the only available engine. Remove switch branches for WEBJS/GOWS.

**Step 3: Remove controllers only used by other engines**

- `screenshot.controller.ts` — WEBJS only (uses Puppeteer)

**Step 4: Remove unused app modules**

In `src/apps/`:
- Check if `chatwoot/` is needed → likely not, remove
- Check if `calls/` is needed → likely not for attendance bot, remove
- Keep `app_sdk/` if it contains shared utilities

**Step 5: Verify build and test**

```bash
npx nest build
npm test
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: patch NestJS module for NOWEB-only operation"
```

---

### Task 5: Create WAHA Startup Script

**File to create:** `waha/start.sh`

**Step 1: Write the startup script**

```bash
#!/usr/bin/env bash
# WAHA (WhatsApp HTTP API) — production startup (no Docker)
cd "$(dirname "$0")"

# Load environment
if [[ -f .env.production ]]; then
  export $(grep -v '^#' .env.production | xargs)
fi

# Defaults
export WHATSAPP_DEFAULT_ENGINE="${WHATSAPP_DEFAULT_ENGINE:-NOWEB}"
export WAHA_WORKER_TYPE="${WAHA_WORKER_TYPE:-LOCAL}"

# Ensure session directory exists
mkdir -p .sessions

# Start WAHA
exec node dist/main.js
```

**Step 2: Make it executable**

```bash
chmod +x waha/start.sh
```

**Step 3: Create a `.env.example` for WAHA**

**File to create:** `waha/`.env.example`

```env
# WAHA Configuration (no Docker)
WHATSAPP_API_PORT=3000
WHATSAPP_DEFAULT_ENGINE=NOWEB
WHATSAPP_HOOK_URL=http://127.0.0.1:40404/api/whatsapp/webhook
WHATSAPP_HOOK_EVENTS=message
WAHA_WORKER_TYPE=LOCAL
# WHATSAPP_API_KEY=your-api-key-here
```

**Step 4: Test startup locally**

```bash
cd waha
npm run build
PORT=3008 node dist/main.js
```

Expected: NestJS starts, Swagger at http://localhost:3008/api

**Step 5: Commit**

```bash
git add start.sh .env.example
git commit -m "feat: add startup script and env example for Docker-free operation"
```

---

### Task 6: Update Deploy Script to Include WAHA

**File to modify:** `tools/deploy-cyon.sh`

**Step 1: Add WAHA port prompt after the existing WAHA URL section**

Replace the current WAHA prompt section (lines ~57-65) to auto-configure local WAHA:

```bash
# Optional: Deploy WAHA alongside server (no Docker needed)
read -rp "Deploy WAHA (WhatsApp) alongside server? [y/N] " DEPLOY_WAHA
WAHA_NODE_PORT=""
if [[ "$DEPLOY_WAHA" == "y" || "$DEPLOY_WAHA" == "Y" ]]; then
  prompt_with_default "WAHA port on cyon (e.g. 40405)" "${PREV_WAHA_PORT:-40405}" WAHA_NODE_PORT
  WAHA_URL="http://127.0.0.1:${WAHA_NODE_PORT}"
  WEBHOOK_URL="http://127.0.0.1:${NODE_PORT}/api/whatsapp/webhook"
fi
```

**Step 2: Add WAHA build step after server build (around line 130)**

```bash
# ─── Step 2b: Build WAHA (if deploying) ──────────
if [[ -n "$WAHA_NODE_PORT" ]]; then
  echo ""
  echo "▶ Building WAHA..."
  cd "$PROJECT_DIR/waha"
  npm run build
  echo "  ✓ WAHA built → waha/dist/"
fi
```

**Step 3: Generate WAHA .env.production (after server .env generation)**

```bash
if [[ -n "$WAHA_NODE_PORT" ]]; then
  WAHA_ENV_FILE="$PROJECT_DIR/waha/.env.production"
  cat > "$WAHA_ENV_FILE" <<WAHAEOF
WHATSAPP_API_PORT=${WAHA_NODE_PORT}
WHATSAPP_DEFAULT_ENGINE=NOWEB
WHATSAPP_HOOK_URL=http://127.0.0.1:${NODE_PORT}/api/whatsapp/webhook
WHATSAPP_HOOK_EVENTS=message
WAHA_WORKER_TYPE=LOCAL
WAHAEOF
  echo "  ✓ WAHA .env.production created"
fi
```

**Step 4: Add WAHA deploy step (after server deploy, around line 275)**

```bash
if [[ -n "$WAHA_NODE_PORT" ]]; then
  echo ""
  echo "▶ Deploying WAHA to ${SSH_HOST}:${REMOTE_PATH}/../openkick-waha/ ..."
  WAHA_REMOTE="${REMOTE_PATH}/../openkick-waha"
  ssh "${SSH_USER}@${SSH_HOST}" "mkdir -p ${WAHA_REMOTE}/.sessions"

  rsync -avz --delete \
    --exclude='node_modules' \
    --exclude='src' \
    --exclude='.env' \
    --exclude='.sessions' \
    "$PROJECT_DIR/waha/dist/" \
    "${SSH_USER}@${SSH_HOST}:${WAHA_REMOTE}/dist/"

  rsync -avz \
    "$PROJECT_DIR/waha/package.json" \
    "$PROJECT_DIR/waha/package-lock.json" \
    "$PROJECT_DIR/waha/start.sh" \
    "$WAHA_ENV_FILE" \
    "${SSH_USER}@${SSH_HOST}:${WAHA_REMOTE}/"

  echo "  ✓ WAHA deployed"

  echo ""
  echo "▶ Installing WAHA production dependencies on remote..."
  ssh "${SSH_USER}@${SSH_HOST}" "cd ${WAHA_REMOTE} && npm install --omit=dev"
  echo "  ✓ WAHA dependencies installed"

  echo ""
  echo "▶ Starting WAHA on remote..."
  ssh "${SSH_USER}@${SSH_HOST}" "cd ${WAHA_REMOTE} && chmod +x start.sh && pkill -f 'node dist/main.js' 2>/dev/null || true; nohup ./start.sh > waha.log 2>&1 &"
  echo "  ✓ WAHA started on port ${WAHA_NODE_PORT}"

  rm -f "$WAHA_ENV_FILE"
fi
```

**Step 5: Update the deploy completion message**

Add WAHA info to the final output:
```bash
if [[ -n "$WAHA_NODE_PORT" ]]; then
  echo "  WAHA:     http://127.0.0.1:${WAHA_NODE_PORT} (internal)"
  echo ""
  echo "  To check WAHA logs:"
  echo "    ssh ${SSH_USER}@${SSH_HOST} 'tail -f ${WAHA_REMOTE}/waha.log'"
  echo ""
  echo "  To restart WAHA:"
  echo "    ssh ${SSH_USER}@${SSH_HOST} 'cd ${WAHA_REMOTE} && pkill -f \"node dist/main.js\" ; nohup ./start.sh > waha.log 2>&1 &'"
fi
```

**Step 6: Commit (in main openkick repo)**

```bash
cd /Users/matthias/Development/openkick
git commit -m "feat: extend deploy script to deploy WAHA without Docker" -- tools/deploy-cyon.sh
```

---

### Task 7: Update OpenKick Server for Native WAHA Support

**Step 1: Patch `docker.service.ts` to detect native WAHA**

**File:** `server/src/services/docker.service.ts`

Add a function that checks if WAHA is reachable via HTTP (regardless of Docker):

```typescript
export async function isWahaReachable(wahaUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${wahaUrl}/api/server/status`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}
```

**Step 2: Update the WAHA setup wizard to support native mode**

**File:** `web/src/app/setup/waha-wizard.tsx`

When Docker is not available, instead of blocking, show a message:
- "Docker not detected — WAHA can run as a standalone process"
- Skip Docker steps (pull, container start)
- Go directly to QR code scanning step if WAHA is reachable at configured URL

**Step 3: Update settings page WAHA status**

**File:** `web/src/components/settings/WahaConfigForm.tsx`

Show "Native (no Docker)" status when WAHA is reachable but Docker is not available.

**Step 4: Run server tests**

```bash
cd server && npm test
```

**Step 5: Commit**

```bash
cd /Users/matthias/Development/openkick
git commit -m "feat: support native WAHA (no Docker) in setup wizard and settings" -- server/src/services/docker.service.ts web/src/app/setup/waha-wizard.tsx web/src/components/settings/WahaConfigForm.tsx
```

---

### Task 8: Update `.gitignore` and Verify Full Build

**Step 1: Ensure `.gitignore` covers WAHA artifacts**

Add to root `.gitignore`:
```
waha/node_modules/
waha/dist/
waha/.sessions/
waha/.env
waha/.env.production
```

**Step 2: Full build verification**

```bash
# Build WAHA
cd /Users/matthias/Development/openkick/waha
npm install && npm run build

# Build server
cd /Users/matthias/Development/openkick/server
npm install && npm run build

# Build web
cd /Users/matthias/Development/openkick/web
npm install && npm run build

# Run server tests
cd /Users/matthias/Development/openkick/server
npm test
```

All must pass.

**Step 3: Test WAHA starts locally**

```bash
cd /Users/matthias/Development/openkick/waha
PORT=3008 node dist/main.js
```

Verify: Swagger UI at http://localhost:3008/api

**Step 4: Commit**

```bash
cd /Users/matthias/Development/openkick
git add .gitignore
git commit -m "chore: add WAHA artifacts to .gitignore"
```

---

### Task 9: Push WAHA Fork and Update Submodule Reference

**Step 1: Push the WAHA fork**

```bash
cd waha
git push origin core
```

**Step 2: Update submodule reference in main repo**

```bash
cd /Users/matthias/Development/openkick
git add waha
git commit -m "chore: update WAHA submodule to latest fork"
```

---

### Task 10: Update Release Notes and Documentation

**Step 1: Update RELEASE_NOTES.md**

Add entry about WAHA native support.

**Step 2: Update `docs/guides/WHATSAPP_SETUP.md`**

Add a "Without Docker" section explaining that WAHA can now run natively.

**Step 3: Update FEATURES.md**

Add checkbox for Docker-free WAHA deployment.

**Step 4: Commit**

```bash
git commit -m "docs: add WAHA native (no Docker) documentation" -- RELEASE_NOTES.md docs/guides/WHATSAPP_SETUP.md FEATURES.md
```
