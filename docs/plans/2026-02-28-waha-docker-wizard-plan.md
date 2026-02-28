# WAHA Docker Setup Wizard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 4-step GUI wizard to the onboarding flow that installs Docker, configures and starts the WAHA container, and connects WhatsApp — no terminal required.

**Architecture:** Server-side `docker.service.ts` wraps the `dockerode` npm package for all Docker operations. A `tools/install-docker.sh` script handles Docker installation when missing. New Express routes under `/api/setup/docker/*` and `/api/setup/waha/*` expose these operations behind admin JWT auth. The frontend extends the existing `/setup` page with a multi-step wizard component after admin account creation. SSE streams real-time progress for long-running operations.

**Tech Stack:** dockerode (Docker API client), Express SSE, Next.js React component, Vitest

---

### Task 1: Install dockerode dependency

**Files:**
- Modify: `server/package.json`

**Step 1: Install dockerode and its types**

Run:
```bash
cd server && npm install dockerode && npm install -D @types/dockerode
```

**Step 2: Verify installation**

Run:
```bash
cd server && node -e "require('dockerode')"
```
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add server/package.json server/package-lock.json && git commit -m "deps: add dockerode for Docker API access" -- server/package.json server/package-lock.json
```

---

### Task 2: Docker service — daemon check

**Files:**
- Create: `server/src/services/docker.service.ts`
- Create: `server/src/services/__tests__/docker.service.test.ts`

**Step 1: Write the failing test**

```typescript
// server/src/services/__tests__/docker.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dockerode before importing the service
vi.mock("dockerode", () => {
  const MockDocker = vi.fn();
  return { default: MockDocker };
});

import { DockerService } from "../docker.service.js";

describe("DockerService", () => {
  let service: DockerService;

  beforeEach(() => {
    service = new DockerService();
  });

  describe("checkDaemon", () => {
    it("returns { available: true } when Docker daemon is reachable", async () => {
      // Mock the ping method
      const mockPing = vi.fn().mockResolvedValue("OK");
      (service as any).docker.ping = mockPing;

      const result = await service.checkDaemon();
      expect(result).toEqual({ available: true });
    });

    it("returns { available: false, error } when Docker daemon is unreachable", async () => {
      const mockPing = vi.fn().mockRejectedValue(new Error("connect ENOENT"));
      (service as any).docker.ping = mockPing;

      const result = await service.checkDaemon();
      expect(result.available).toBe(false);
      expect(result.error).toContain("connect ENOENT");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/docker.service.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// server/src/services/docker.service.ts
import Docker from "dockerode";

export class DockerService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  async checkDaemon(): Promise<{ available: boolean; error?: string }> {
    try {
      await this.docker.ping();
      return { available: true };
    } catch (err: any) {
      return { available: false, error: err.message };
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/docker.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/docker.service.ts server/src/services/__tests__/docker.service.test.ts && git commit -m "feat: add DockerService with daemon check"
```

---

### Task 3: Docker service — WAHA container management

**Files:**
- Modify: `server/src/services/docker.service.ts`
- Modify: `server/src/services/__tests__/docker.service.test.ts`

**Step 1: Write the failing tests**

Add to `docker.service.test.ts`:

```typescript
describe("getWahaStatus", () => {
  it("returns 'not_found' when no container exists", async () => {
    const mockList = vi.fn().mockResolvedValue([]);
    (service as any).docker.listContainers = mockList;

    const result = await service.getWahaStatus();
    expect(result.status).toBe("not_found");
  });

  it("returns 'running' when container is up", async () => {
    const mockList = vi.fn().mockResolvedValue([
      { Names: ["/openkick-waha"], State: "running", Ports: [{ PublicPort: 3008 }] },
    ]);
    (service as any).docker.listContainers = mockList;

    const result = await service.getWahaStatus();
    expect(result.status).toBe("running");
  });

  it("returns 'stopped' when container exists but is not running", async () => {
    const mockList = vi.fn().mockResolvedValue([
      { Names: ["/openkick-waha"], State: "exited", Ports: [] },
    ]);
    (service as any).docker.listContainers = mockList;

    const result = await service.getWahaStatus();
    expect(result.status).toBe("stopped");
  });
});

describe("installWaha", () => {
  it("pulls image, creates container, and starts it", async () => {
    const mockPull = vi.fn().mockImplementation((_image: string, cb: Function) => {
      const stream = { on: vi.fn().mockImplementation((event: string, handler: Function) => {
        if (event === "data") handler(JSON.stringify({ status: "Pulling" }));
        if (event === "end") handler();
        return stream;
      }) };
      cb(null, stream);
    });
    const mockStart = vi.fn().mockResolvedValue(undefined);
    const mockCreateContainer = vi.fn().mockResolvedValue({ start: mockStart });
    (service as any).docker.pull = mockPull;
    (service as any).docker.createContainer = mockCreateContainer;

    const onProgress = vi.fn();
    await service.installWaha({ port: 3008, engine: "WEBJS" }, onProgress);

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Image: "devlikeapro/waha",
        name: "openkick-waha",
      })
    );
    expect(mockStart).toHaveBeenCalled();
  });
});

describe("startWaha", () => {
  it("starts an existing stopped container", async () => {
    const mockStart = vi.fn().mockResolvedValue(undefined);
    const mockGetContainer = vi.fn().mockReturnValue({ start: mockStart });
    (service as any).docker.getContainer = mockGetContainer;

    await service.startWaha();
    expect(mockGetContainer).toHaveBeenCalledWith("openkick-waha");
    expect(mockStart).toHaveBeenCalled();
  });
});

describe("stopWaha", () => {
  it("stops a running container", async () => {
    const mockStop = vi.fn().mockResolvedValue(undefined);
    const mockGetContainer = vi.fn().mockReturnValue({ stop: mockStop });
    (service as any).docker.getContainer = mockGetContainer;

    await service.stopWaha();
    expect(mockGetContainer).toHaveBeenCalledWith("openkick-waha");
    expect(mockStop).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/docker.service.test.ts`
Expected: FAIL — methods not found

**Step 3: Implement the methods**

Add to `docker.service.ts`:

```typescript
const WAHA_CONTAINER_NAME = "openkick-waha";
const WAHA_IMAGE = "devlikeapro/waha";

export interface WahaConfig {
  port: number;
  engine: "WEBJS" | "NOWEB";
}

export interface WahaStatus {
  status: "running" | "stopped" | "not_found";
  port?: number;
}

// Inside DockerService class:

async getWahaStatus(): Promise<WahaStatus> {
  const containers = await this.docker.listContainers({ all: true, filters: { name: [WAHA_CONTAINER_NAME] } });
  const container = containers.find((c) => c.Names.some((n) => n === `/${WAHA_CONTAINER_NAME}`));
  if (!container) return { status: "not_found" };
  if (container.State === "running") {
    const port = container.Ports.find((p) => p.PublicPort)?.PublicPort;
    return { status: "running", port };
  }
  return { status: "stopped" };
}

async installWaha(config: WahaConfig, onProgress?: (msg: string) => void): Promise<void> {
  // Pull image
  await new Promise<void>((resolve, reject) => {
    this.docker.pull(WAHA_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      stream.on("data", (chunk: Buffer) => {
        try {
          const data = JSON.parse(chunk.toString());
          onProgress?.(data.status || "Pulling...");
        } catch { /* ignore parse errors */ }
      });
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
  });

  // Determine webhook URL
  const webhookUrl = process.env.WEBHOOK_URL || `http://host.docker.internal:${process.env.PORT || 3001}/api/whatsapp/webhook`;

  // Create and start container
  const container = await this.docker.createContainer({
    Image: WAHA_IMAGE,
    name: WAHA_CONTAINER_NAME,
    ExposedPorts: { "3000/tcp": {} },
    HostConfig: {
      PortBindings: { "3000/tcp": [{ HostPort: String(config.port) }] },
      RestartPolicy: { Name: "unless-stopped" },
    },
    Env: [
      `WHATSAPP_HOOK_URL=${webhookUrl}`,
      "WHATSAPP_HOOK_EVENTS=message",
      `WHATSAPP_DEFAULT_ENGINE=${config.engine}`,
    ],
  });

  await container.start();
  onProgress?.("WAHA container started.");
}

async startWaha(): Promise<void> {
  const container = this.docker.getContainer(WAHA_CONTAINER_NAME);
  await container.start();
}

async stopWaha(): Promise<void> {
  const container = this.docker.getContainer(WAHA_CONTAINER_NAME);
  await container.stop();
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/docker.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/docker.service.ts server/src/services/__tests__/docker.service.test.ts && git commit -m "feat: add WAHA container management to DockerService"
```

---

### Task 4: Docker install shell script

**Files:**
- Create: `tools/install-docker.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
# install-docker.sh — Install Docker Engine using the official convenience script.
# Supports Linux (Debian/Ubuntu/Fedora/CentOS) and macOS (via Homebrew).
set -euo pipefail

echo "=== OpenKick Docker Installer ==="

if command -v docker &>/dev/null; then
  echo "Docker is already installed: $(docker --version)"
  # Try to start the daemon if not running
  if ! docker info &>/dev/null 2>&1; then
    echo "Docker daemon is not running. Attempting to start..."
    if [[ "$(uname)" == "Darwin" ]]; then
      open -a Docker 2>/dev/null || echo "Please start Docker Desktop manually."
    else
      sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || echo "Could not start Docker daemon automatically."
    fi
  fi
  exit 0
fi

OS="$(uname)"
echo "Detected OS: $OS"

if [[ "$OS" == "Linux" ]]; then
  echo "Installing Docker via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  sudo systemctl enable docker 2>/dev/null || true
  sudo systemctl start docker 2>/dev/null || true
  # Add current user to docker group to avoid sudo
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  echo "Docker installed. You may need to log out and back in for group changes."
elif [[ "$OS" == "Darwin" ]]; then
  if command -v brew &>/dev/null; then
    echo "Installing Docker via Homebrew..."
    brew install --cask docker
    echo "Docker Desktop installed. Starting it now..."
    open -a Docker
    echo "Waiting for Docker to start (this may take a moment)..."
    for i in $(seq 1 30); do
      if docker info &>/dev/null 2>&1; then
        echo "Docker is ready."
        exit 0
      fi
      sleep 2
    done
    echo "Docker Desktop is starting. Please wait for it to finish loading."
  else
    echo "ERROR: Homebrew is required to install Docker on macOS."
    echo "Install Homebrew first: https://brew.sh"
    exit 1
  fi
else
  echo "ERROR: Unsupported OS '$OS'. Please install Docker manually: https://docs.docker.com/get-docker/"
  exit 1
fi

echo "=== Docker installation complete ==="
```

**Step 2: Make it executable and verify syntax**

Run: `chmod +x tools/install-docker.sh && bash -n tools/install-docker.sh`
Expected: No output (syntax OK)

**Step 3: Commit**

```bash
git restore --staged :/ && git add tools/install-docker.sh && git commit -m "feat: add Docker install script for non-technical users"
```

---

### Task 5: Setup WAHA API routes

**Files:**
- Create: `server/src/routes/setup-waha.ts`
- Create: `server/src/__tests__/setup-waha.test.ts`

**Step 1: Write the failing tests**

```typescript
// server/src/__tests__/setup-waha.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the DockerService
vi.mock("../services/docker.service.js", () => {
  const MockDockerService = vi.fn().mockImplementation(() => ({
    checkDaemon: vi.fn().mockResolvedValue({ available: true }),
    getWahaStatus: vi.fn().mockResolvedValue({ status: "not_found" }),
    installWaha: vi.fn().mockResolvedValue(undefined),
    startWaha: vi.fn().mockResolvedValue(undefined),
    stopWaha: vi.fn().mockResolvedValue(undefined),
  }));
  return { DockerService: MockDockerService };
});

// Mock auth middleware to always pass with admin role
vi.mock("../auth.js", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => {
    _req.user = { id: 1, role: "admin" };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

import { setupWahaRouter } from "../routes/setup-waha.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/setup", setupWahaRouter);
  return app;
}

describe("setup-waha routes", () => {
  describe("GET /api/setup/docker/status", () => {
    it("returns Docker daemon status", async () => {
      const app = createApp();
      const res = await request(app).get("/api/setup/docker/status");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("available");
    });
  });

  describe("GET /api/setup/waha/status", () => {
    it("returns WAHA container status", async () => {
      const app = createApp();
      const res = await request(app).get("/api/setup/waha/status");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
    });
  });

  describe("POST /api/setup/waha/install", () => {
    it("validates port range", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/setup/waha/install")
        .send({ port: 80, engine: "WEBJS" });
      expect(res.status).toBe(400);
    });

    it("validates engine allowlist", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/setup/waha/install")
        .send({ port: 3008, engine: "INVALID" });
      expect(res.status).toBe(400);
    });

    it("accepts valid config", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/setup/waha/install")
        .send({ port: 3008, engine: "WEBJS" });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/setup/waha/start", () => {
    it("starts the container", async () => {
      const app = createApp();
      const res = await request(app).post("/api/setup/waha/start");
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/setup/waha/stop", () => {
    it("stops the container", async () => {
      const app = createApp();
      const res = await request(app).post("/api/setup/waha/stop");
      expect(res.status).toBe(200);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/setup-waha.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the routes**

```typescript
// server/src/routes/setup-waha.ts
import { Router, Request, Response } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { authMiddleware, requireRole } from "../auth.js";
import { DockerService } from "../services/docker.service.js";
import { getDB } from "../database.js";

export const setupWahaRouter = Router();
const docker = new DockerService();

const VALID_ENGINES = ["WEBJS", "NOWEB"] as const;

// All routes require admin auth
setupWahaRouter.use(authMiddleware, requireRole("admin"));

// GET /docker/status — Check if Docker daemon is reachable
setupWahaRouter.get("/docker/status", async (_req: Request, res: Response) => {
  const result = await docker.checkDaemon();
  res.json(result);
});

// POST /docker/install — Install Docker via script, stream output as SSE
setupWahaRouter.post("/docker/install", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const scriptPath = path.resolve(__dirname, "../../tools/install-docker.sh");
  const child = spawn("bash", [scriptPath], { stdio: ["ignore", "pipe", "pipe"] });

  child.stdout.on("data", (data: Buffer) => {
    res.write(`data: ${JSON.stringify({ type: "stdout", text: data.toString() })}\n\n`);
  });

  child.stderr.on("data", (data: Buffer) => {
    res.write(`data: ${JSON.stringify({ type: "stderr", text: data.toString() })}\n\n`);
  });

  child.on("close", (code: number | null) => {
    res.write(`data: ${JSON.stringify({ type: "done", code })}\n\n`);
    res.end();
  });

  child.on("error", (err: Error) => {
    res.write(`data: ${JSON.stringify({ type: "error", text: err.message })}\n\n`);
    res.end();
  });
});

// GET /waha/status — Check WAHA container state
setupWahaRouter.get("/waha/status", async (_req: Request, res: Response) => {
  try {
    const result = await docker.getWahaStatus();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /waha/install — Pull image + create + start container
setupWahaRouter.post("/waha/install", async (req: Request, res: Response) => {
  const { port, engine } = req.body;

  if (!port || typeof port !== "number" || port < 1024 || port > 65535) {
    res.status(400).json({ error: "Port must be a number between 1024 and 65535" });
    return;
  }
  if (!engine || !VALID_ENGINES.includes(engine)) {
    res.status(400).json({ error: `Engine must be one of: ${VALID_ENGINES.join(", ")}` });
    return;
  }

  // Use SSE for progress
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    await docker.installWaha({ port, engine }, (msg) => {
      res.write(`data: ${JSON.stringify({ type: "progress", text: msg })}\n\n`);
    });

    // Save waha_url to settings
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "waha_url",
      `http://localhost:${port}`,
    ]);

    res.write(`data: ${JSON.stringify({ type: "done", wahaUrl: `http://localhost:${port}` })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", text: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /waha/start
setupWahaRouter.post("/waha/start", async (_req: Request, res: Response) => {
  try {
    await docker.startWaha();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /waha/stop
setupWahaRouter.post("/waha/stop", async (_req: Request, res: Response) => {
  try {
    await docker.stopWaha();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /waha/qr — Proxy QR code from WAHA
setupWahaRouter.get("/waha/qr", async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(["waha_url"]) as any;
    const wahaUrl = row?.values?.[0]?.[0] || process.env.WAHA_URL || "http://localhost:3008";

    const response = await fetch(`${wahaUrl}/api/screenshot?session=default`);
    if (!response.ok) {
      res.status(502).json({ error: "Could not fetch QR from WAHA" });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// GET /waha/session — Poll WhatsApp session status
setupWahaRouter.get("/waha/session", async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(["waha_url"]) as any;
    const wahaUrl = row?.values?.[0]?.[0] || process.env.WAHA_URL || "http://localhost:3008";

    const response = await fetch(`${wahaUrl}/api/sessions/default`);
    if (!response.ok) {
      res.status(502).json({ error: "Could not reach WAHA" });
      return;
    }
    const data = await response.json();
    res.json({ status: data.status, phone: data.me?.id });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/setup-waha.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/routes/setup-waha.ts server/src/__tests__/setup-waha.test.ts && git commit -m "feat: add setup-waha API routes with auth and validation"
```

---

### Task 6: Register the new route

**Files:**
- Modify: `server/src/index.ts` (around line 54, after other route registrations)

**Step 1: Add the import and route registration**

Add import at the top with other route imports:
```typescript
import { setupWahaRouter } from "./routes/setup-waha.js";
```

Add route registration with the other `app.use` calls:
```typescript
app.use("/api/setup", setupWahaRouter);
```

**Step 2: Verify the server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add server/src/index.ts && git commit -m "feat: register setup-waha routes in server"
```

---

### Task 7: Frontend — WAHA wizard component

**Files:**
- Create: `web/src/app/setup/waha-wizard.tsx`

**Step 1: Create the wizard component**

This is a 4-step wizard with the following states:
- Step 1: Docker check (auto-runs on mount, offers install if missing)
- Step 2: Configure (port + engine selection form)
- Step 3: Install WAHA (progress indicator with SSE stream)
- Step 4: QR code scan (polls session status)

The component receives an `authToken` prop (from the setup page after admin account creation) and an `onComplete` callback.

```tsx
// web/src/app/setup/waha-wizard.tsx
"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface WahaWizardProps {
  authToken: string;
  onComplete: () => void;
  onSkip: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

export default function WahaWizard({ authToken, onComplete, onSkip }: WahaWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [dockerChecking, setDockerChecking] = useState(false);
  const [dockerInstalling, setDockerInstalling] = useState(false);
  const [dockerLog, setDockerLog] = useState<string[]>([]);

  // Step 2 state
  const [port, setPort] = useState(3008);
  const [engine, setEngine] = useState<"WEBJS" | "NOWEB">("WEBJS");

  // Step 3 state
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Step 4 state
  const [qrData, setQrData] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const headers = { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" };

  // Step 1: Check Docker
  const checkDocker = useCallback(async () => {
    setDockerChecking(true);
    try {
      const res = await fetch(`${API_URL}/api/setup/docker/status`, { headers });
      const data = await res.json();
      setDockerAvailable(data.available);
      if (data.available) setStep(2);
    } catch {
      setDockerAvailable(false);
    } finally {
      setDockerChecking(false);
    }
  }, [authToken]);

  useEffect(() => { checkDocker(); }, [checkDocker]);

  // Step 1: Install Docker
  const installDocker = async () => {
    setDockerInstalling(true);
    setDockerLog([]);
    try {
      const res = await fetch(`${API_URL}/api/setup/docker/install`, {
        method: "POST",
        headers,
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const json = JSON.parse(line.slice(6));
          if (json.type === "stdout" || json.type === "stderr") {
            setDockerLog((prev) => [...prev, json.text]);
          }
          if (json.type === "done" && json.code === 0) {
            setDockerAvailable(true);
            setStep(2);
          }
          if (json.type === "error") {
            setDockerLog((prev) => [...prev, `Error: ${json.text}`]);
          }
        }
      }
    } finally {
      setDockerInstalling(false);
    }
  };

  // Step 3: Install WAHA
  const installWaha = async () => {
    setInstalling(true);
    setInstallLog([]);
    setInstallError(null);
    try {
      const res = await fetch(`${API_URL}/api/setup/waha/install`, {
        method: "POST",
        headers,
        body: JSON.stringify({ port, engine }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const json = JSON.parse(line.slice(6));
          if (json.type === "progress") setInstallLog((prev) => [...prev, json.text]);
          if (json.type === "done") { setInstallDone(true); setStep(4); }
          if (json.type === "error") setInstallError(json.text);
        }
      }
    } catch (err: any) {
      setInstallError(err.message);
    } finally {
      setInstalling(false);
    }
  };

  // Step 4: Poll QR + session
  useEffect(() => {
    if (step !== 4) return;
    let cancelled = false;

    const pollSession = async () => {
      while (!cancelled) {
        try {
          // Fetch QR
          const qrRes = await fetch(`${API_URL}/api/setup/waha/qr`, { headers });
          if (qrRes.ok) {
            const qrJson = await qrRes.json();
            if (qrJson.mimetype && qrJson.data) {
              setQrData(`data:${qrJson.mimetype};base64,${qrJson.data}`);
            }
          }

          // Check session
          const sessRes = await fetch(`${API_URL}/api/setup/waha/session`, { headers });
          if (sessRes.ok) {
            const sessJson = await sessRes.json();
            setSessionStatus(sessJson.status);
            if (sessJson.status === "WORKING" || sessJson.status === "CONNECTED") {
              setConnected(true);
              return;
            }
          }
        } catch { /* WAHA may not be ready yet */ }

        await new Promise((r) => setTimeout(r, 3000));
      }
    };

    pollSession();
    return () => { cancelled = true; };
  }, [step, authToken]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">WhatsApp Setup</h2>
      <p className="text-sm text-gray-500">
        Connect WhatsApp to receive attendance replies directly from parents.
      </p>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              step === s ? "bg-blue-600 text-white" : step > s ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
            }`}>{step > s ? "\u2713" : s}</div>
            {s < 4 && <div className="w-8 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Docker Check */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-medium">Step 1: Docker</h3>
          {dockerChecking && <p className="text-sm text-gray-500">Checking if Docker is available...</p>}
          {dockerAvailable === false && !dockerInstalling && (
            <div className="space-y-3">
              <p className="text-sm text-amber-600">Docker is not installed or not running.</p>
              <button
                onClick={installDocker}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Install Docker
              </button>
            </div>
          )}
          {dockerInstalling && (
            <div className="space-y-2">
              <p className="text-sm text-blue-600">Installing Docker...</p>
              <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded max-h-48 overflow-y-auto">
                {dockerLog.join("")}
              </pre>
            </div>
          )}
          {dockerAvailable === true && <p className="text-sm text-green-600">Docker is available.</p>}
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-medium">Step 2: Configure WAHA</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                min={1024} max={65535}
                className="w-32 px-3 py-2 border rounded text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Default: 3008. Must be 1024\u201365535.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Engine</label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as "WEBJS" | "NOWEB")}
                className="px-3 py-2 border rounded text-sm"
              >
                <option value="WEBJS">WEBJS (stable, recommended)</option>
                <option value="NOWEB">NOWEB (lightweight, experimental)</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => setStep(3)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Next
          </button>
        </div>
      )}

      {/* Step 3: Install */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-medium">Step 3: Install & Start WAHA</h3>
          {!installing && !installDone && !installError && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                This will download the WAHA image and start the container on port {port}.
              </p>
              <button
                onClick={installWaha}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Install WAHA
              </button>
            </div>
          )}
          {installing && (
            <div className="space-y-2">
              <p className="text-sm text-blue-600">Installing WAHA...</p>
              <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded max-h-48 overflow-y-auto">
                {installLog.join("\n")}
              </pre>
            </div>
          )}
          {installError && (
            <div className="space-y-2">
              <p className="text-sm text-red-600">Installation failed: {installError}</p>
              <button
                onClick={installWaha}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Connect WhatsApp */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="font-medium">Step 4: Connect WhatsApp</h3>
          {!connected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Scan the QR code with your WhatsApp app to connect.</p>
              {qrData ? (
                <img src={qrData} alt="WhatsApp QR Code" className="w-64 h-64 border rounded" />
              ) : (
                <div className="w-64 h-64 border rounded flex items-center justify-center text-sm text-gray-400">
                  Loading QR code...
                </div>
              )}
              <p className="text-xs text-gray-400">Status: {sessionStatus || "waiting..."}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-green-600 font-medium">WhatsApp connected successfully!</p>
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Continue to Dashboard
              </button>
            </div>
          )}
        </div>
      )}

      {/* Skip option */}
      {!connected && (
        <button onClick={onSkip} className="text-sm text-gray-400 hover:text-gray-600 underline">
          Skip for now
        </button>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add web/src/app/setup/waha-wizard.tsx && git commit -m "feat: add WahaWizard 4-step setup component"
```

---

### Task 8: Integrate wizard into setup page

**Files:**
- Modify: `web/src/app/setup/page.tsx`

**Step 1: Read the current setup page for exact content**

Read `web/src/app/setup/page.tsx` to understand exact structure and insertion points.

**Step 2: Add wizard integration**

The setup page currently:
1. Checks `needsSetup` → shows form → creates admin → saves token → redirects to `/dashboard/`

Change it to:
1. Checks `needsSetup` → shows form → creates admin → saves token → **shows WahaWizard**
2. WahaWizard `onComplete` or `onSkip` → redirects to `/dashboard/`

Add a `setupPhase` state: `"admin"` | `"waha"`. After admin creation, set phase to `"waha"` instead of redirecting. Pass the freshly obtained token to WahaWizard.

Key changes:
- Import WahaWizard
- Add `setupPhase` state (default `"admin"`)
- On successful admin setup: store token, set phase to `"waha"` (instead of `router.push`)
- Render WahaWizard when phase is `"waha"`, with the stored token
- WahaWizard's `onComplete`/`onSkip` both call `router.push("/dashboard/")`

**Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git restore --staged :/ && git add web/src/app/setup/page.tsx && git commit -m "feat: integrate WAHA wizard into onboarding flow"
```

---

### Task 9: Full test suite run + build verification

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 2: Run server build**

Run: `cd server && npx tsc -b`
Expected: No errors

**Step 3: Run web build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 4: Commit any fixes if needed**

---

### Task 10: Update documentation

**Files:**
- Modify: `FEATURES.md` — add WAHA Docker wizard feature
- Modify: `RELEASE_NOTES.md` — add release entry
- Modify: `docs/QUICK_START_COACHES.md` — mention wizard in setup flow
- Modify: `docs/guides/WHATSAPP_SETUP.md` — reference the new GUI wizard as the preferred method

**Step 1: Update each file with appropriate content**

FEATURES.md: Add checkbox item for WAHA Docker setup wizard.

RELEASE_NOTES.md: Add entry under current release section:
```
* WhatsApp setup wizard: guided 4-step assistant during onboarding to install Docker, configure and start WAHA, and connect WhatsApp — no terminal needed
```

QUICK_START_COACHES.md: Mention that WhatsApp setup is now part of the initial setup wizard.

WHATSAPP_SETUP.md: Add a section at the top noting the GUI wizard handles this automatically during onboarding.

**Step 2: Commit**

```bash
git restore --staged :/ && git add FEATURES.md RELEASE_NOTES.md docs/QUICK_START_COACHES.md docs/guides/WHATSAPP_SETUP.md && git commit -m "docs: add WAHA Docker wizard to features, release notes, and guides"
```
