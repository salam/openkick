# WAHA Docker Setup Wizard — Design Document

**Date:** 2026-02-28
**Status:** Approved

## Summary

A GUI-based setup assistant embedded in the onboarding flow that helps non-technical users install Docker, configure and start the WAHA (WhatsApp HTTP API) container, and connect their WhatsApp account — all without touching a terminal.

## Motivation

Currently, setting up WAHA requires command-line knowledge (Docker, docker-compose, environment variables). This is a barrier for volunteer coaches and club admins who aren't developers. A guided wizard makes the privacy-aware, self-hosted WhatsApp integration accessible to everyone.

## Wizard Flow

**Location:** `/setup` page, shown as Step 2 after admin account creation.

### Step 1: Check Docker

- Server checks if Docker daemon is reachable via dockerode.
- If reachable: show green checkmark, proceed.
- If not reachable: offer to install Docker via server-side script (`tools/install-docker.sh`), show real-time progress via SSE, then re-check.
- If permission denied: show instructions to add user to `docker` group.

### Step 2: Configure WAHA

- Port selection (default: 3008), validated to range 1024–65535.
- Engine selection: WEBJS (default, more stable) or NOWEB (lighter, experimental).
- Brief user-friendly explanation of each option.

### Step 3: Install & Start WAHA

- One-click button triggers image pull + container creation + start.
- Real-time progress via SSE (pulling layers, starting container).
- On success: `waha_url` setting is automatically saved to the database.

### Step 4: Connect WhatsApp

- Fetch and display QR code from WAHA API.
- User scans with their phone's WhatsApp app.
- Poll session status until connected.
- On success: show confirmation with connected phone number.
- QR auto-refreshes on expiry.

**Every step has a "Skip for now" option** so users aren't blocked.

## API Endpoints

All endpoints require admin JWT authentication.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/setup/docker/status` | Check if Docker daemon is reachable |
| `POST` | `/api/setup/docker/install` | Run Docker install script, stream output via SSE |
| `GET` | `/api/setup/waha/status` | Check WAHA container state (running/stopped/not found) |
| `POST` | `/api/setup/waha/install` | Pull image + create + start container with config |
| `POST` | `/api/setup/waha/start` | Start existing stopped container |
| `POST` | `/api/setup/waha/stop` | Stop running container |
| `GET` | `/api/setup/waha/qr` | Proxy QR code from WAHA API |
| `GET` | `/api/setup/waha/session` | Poll WhatsApp session connection status |

**SSE** is used for long-running operations (Docker install, WAHA image pull) to provide real-time feedback.

## Security

- All endpoints gated behind existing admin JWT middleware.
- Docker install script runs only `get.docker.com` (official Docker installer).
- dockerode connects via local Docker socket (`/var/run/docker.sock`) only — no remote hosts.
- Container image hardcoded to `devlikeapro/waha` — no arbitrary image execution.
- Port validated as number in 1024–65535.
- Engine validated against allowlist: `WEBJS`, `NOWEB`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Docker socket permission denied | Instructions to add user to `docker` group |
| Docker install script fails | Show error output, link to manual install docs |
| Image pull fails (network) | Retry button, suggest checking internet |
| Port already in use | Detect conflict, suggest alternative port |
| Container crashes after start | Show container logs, offer restart |
| QR code expires | Auto-refresh (WAHA regenerates) |
| WAHA not reachable after start | Poll up to 15s, then show troubleshooting tips |

No silent failures — every error shows a clear message with a suggested action.

## Architecture

### New dependency

- `dockerode` — Docker API client for Node.js (~2M weekly npm downloads, MIT license)

### New files

| File | Purpose |
|------|---------|
| `server/src/services/docker.service.ts` | Wrapper around dockerode: check daemon, pull image, create/start/stop container, get status |
| `server/src/routes/setup-waha.ts` | API routes for `/api/setup/docker/*` and `/api/setup/waha/*` |
| `tools/install-docker.sh` | Minimal script: detect OS, run official Docker installer, start daemon |
| `web/src/app/setup/waha-wizard.tsx` | 4-step wizard component embedded in setup flow |
| `server/src/__tests__/docker.service.test.ts` | Unit tests with mocked dockerode |
| `server/src/__tests__/setup-waha.test.ts` | Route integration tests |

### Testing strategy

- **Unit tests:** Mock dockerode to test all docker service methods.
- **Route tests:** Mock the docker service to test endpoint auth, validation, error responses.
- **No real Docker in CI** — all mocked. Real Docker tested manually on-device.

## Out of Scope (YAGNI)

- No Docker Compose management — single container managed directly.
- No WAHA version selection — always pull `latest`.
- No multi-container orchestration.
- No remote Docker host support.
- No Windows Docker install script (Docker Desktop on Windows is a separate concern).
