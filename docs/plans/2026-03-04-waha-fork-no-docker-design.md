# Design: WAHA Fork Without Docker

**Date:** 2026-03-04
**Status:** Approved
**Approach:** Git Submodule Fork (NOWEB-only)

## Problem

WAHA (WhatsApp HTTP API) currently requires Docker. OpenKick deploys to Cyon shared hosting which has no Docker support. We need WAHA to run as a plain Node.js process alongside the openkick server.

## Solution

Fork WAHA, strip Docker/Chromium/WEBJS dependencies, keep only the NOWEB engine (pure Node.js WebSocket-based), and add it as a git submodule in the monorepo. The deploy script deploys WAHA as a sibling process to the openkick server.

## Architecture

```
Cyon shared hosting
├── public_html/fluegelflitzer/   (frontend — static Next.js)
├── openkick-server/              (Express API — port 40404)
│   └── start.sh
└── openkick-waha/                (WAHA fork — port 40405)
    └── start.sh
```

```
WhatsApp Cloud → WAHA (port 40405, NOWEB engine)
                    ↓ webhook POST
                OpenKick Server (port 40404)
                    ↓ REST calls
                WAHA (port 40405) → WhatsApp
```

## Monorepo Structure

```
openkick/
├── waha/                    ← git submodule (forked repo)
│   ├── src/                 ← NestJS app (patched)
│   ├── package.json         ← stripped dependencies
│   ├── tsconfig.json
│   └── start.sh             ← production startup script
├── server/
├── web/
└── tools/
    └── deploy-cyon.sh       ← updated to deploy WAHA too
```

## What Gets Stripped from WAHA Fork

1. **Docker files** — Dockerfile, docker-compose.*, entrypoint.sh
2. **WEBJS engine** — whatsapp-web.js, puppeteer, chromium deps
3. **GOWS engine** — Go WebSocket binary, Rust/WASM bridge
4. **Heavy deps** — MongoDB, PostgreSQL, Redis, S3, BullMQ, gRPC
5. **Dashboard UI** — Bull Board, Swagger UI (optional, can keep Swagger)
6. **Browser deps** — sharp (if only used for WEBJS), xvfb, fonts

## What Gets Kept

1. **NOWEB engine** — Baileys (WhatsApp WebSocket library)
2. **Core NestJS API** — REST endpoints for send/receive/session/QR
3. **SQLite storage** — session persistence (already supported by WAHA)
4. **Webhook system** — POST to configured URL on incoming messages
5. **Authentication** — API key middleware
6. **File storage** — local filesystem for media

## Deploy Script Changes

The `tools/deploy-cyon.sh` script gets extended:

1. **Build WAHA** — `cd waha && npm run build`
2. **Deploy WAHA** — rsync to `../openkick-waha/` on Cyon
3. **Install deps** — `npm install --omit=dev` on remote
4. **Generate WAHA .env** — port, webhook URL, engine config
5. **Start WAHA** — `nohup ./start.sh > waha.log 2>&1 &`
6. **Wire webhook** — WAHA webhook URL → `http://127.0.0.1:{NODE_PORT}/api/whatsapp/webhook`
7. **Wire WAHA_URL** — openkick server's WAHA_URL → `http://127.0.0.1:{WAHA_PORT}`

## OpenKick Server Changes

Minimal:
- `docker.service.ts` — add "native mode" detection (WAHA running as process, not Docker container)
- Setup wizard — detect native WAHA instead of Docker WAHA, skip Docker steps
- Settings page — show process status instead of container status

## WAHA Port

Default WAHA port on Cyon: **40405** (next to openkick server on 40404).

## License

WAHA is Apache 2.0 licensed — forking and modifying is permitted with attribution.

## Risks

| Risk | Mitigation |
|------|------------|
| WAHA upstream updates | Cherry-pick relevant commits periodically |
| NOWEB engine instability | NOWEB is the most widely used engine; Baileys is mature |
| Two processes on shared hosting | Both are lightweight Node.js; Cyon allows multiple |
| NestJS build complexity | Strip to essentials, test build in CI |
| Yarn 4 requirement | Convert to npm for consistency with rest of monorepo |
