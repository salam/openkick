import { Router, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";
import { DockerService } from "../services/docker.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALID_ENGINES = ["WEBJS", "NOWEB"] as const;

export const setupWahaRouter = Router();

// All endpoints require admin JWT
setupWahaRouter.use(authMiddleware, requireRole("admin"));

const docker = new DockerService();

// ── Helper: read waha_url and waha_api_key from settings ────────────

function getWahaUrl(): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = 'waha_url'");
  return (result[0]?.values[0]?.[0] as string) || process.env.WAHA_URL || "http://localhost:3008";
}

function getWahaApiKey(): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = 'waha_api_key'");
  return (result[0]?.values[0]?.[0] as string) || process.env.WAHA_API_KEY || "";
}

function wahaHeaders(): Record<string, string> {
  const apiKey = getWahaApiKey();
  return apiKey ? { "Content-Type": "application/json", "X-Api-Key": apiKey } : { "Content-Type": "application/json" };
}

// ── Helper: send SSE event ──────────────────────────────────────────

function sendSSE(res: Response, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── GET /docker/status ──────────────────────────────────────────────

setupWahaRouter.get("/docker/status", async (_req: Request, res: Response) => {
  try {
    const result = await docker.checkDaemon();
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ── POST /docker/install ────────────────────────────────────────────
// Runs the install-docker.sh script and streams output as SSE.
// Uses spawn (not exec) with a hardcoded script path -- no user input
// is interpolated into the command, so shell injection is not possible.

setupWahaRouter.post("/docker/install", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const scriptPath = path.resolve(__dirname, "../../../tools/install-docker.sh");
  const child = spawn("bash", [scriptPath]);

  child.stdout.on("data", (chunk: Buffer) => {
    sendSSE(res, { type: "progress", text: chunk.toString().trim() });
  });

  child.stderr.on("data", (chunk: Buffer) => {
    sendSSE(res, { type: "progress", text: chunk.toString().trim() });
  });

  child.on("close", (code) => {
    if (code === 0) {
      sendSSE(res, { type: "done" });
    } else {
      sendSSE(res, { type: "error", text: `Install script exited with code ${code}` });
    }
    res.end();
  });

  child.on("error", (err) => {
    sendSSE(res, { type: "error", text: err.message });
    res.end();
  });

  req.on("close", () => {
    child.kill();
  });
});

// ── GET /waha/status ────────────────────────────────────────────────

setupWahaRouter.get("/waha/status", async (_req: Request, res: Response) => {
  try {
    const result = await docker.getWahaStatus();
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ── POST /waha/install ──────────────────────────────────────────────

setupWahaRouter.post("/waha/install", async (req: Request, res: Response) => {
  const { port, engine } = req.body;

  // Validate port
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum < 1024 || portNum > 65535) {
    res.status(400).json({ error: "Port must be a number between 1024 and 65535" });
    return;
  }

  const RESERVED_PORTS = [3000, 3001];
  if (RESERVED_PORTS.includes(portNum)) {
    res.status(400).json({ error: "Port is already used by another service (3000 = web, 3001 = API)" });
    return;
  }

  // Validate engine
  if (!engine || !VALID_ENGINES.includes(engine)) {
    res.status(400).json({ error: "Engine must be one of: WEBJS, NOWEB" });
    return;
  }

  // Stream progress via SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const { apiKey } = await docker.installWaha(
      { port: portNum, engine },
      (msg) => sendSSE(res, { type: "progress", text: msg }),
    );

    // Save waha_url and waha_api_key settings
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "waha_url",
      `http://localhost:${portNum}`,
    ]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "waha_api_key",
      apiKey,
    ]);

    sendSSE(res, { type: "done", wahaUrl: `http://localhost:${portNum}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendSSE(res, { type: "error", text: message });
  }

  res.end();
});

// ── POST /waha/start ────────────────────────────────────────────────

setupWahaRouter.post("/waha/start", async (_req: Request, res: Response) => {
  try {
    await docker.startWaha();
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ── POST /waha/stop ─────────────────────────────────────────────────

setupWahaRouter.post("/waha/stop", async (_req: Request, res: Response) => {
  try {
    await docker.stopWaha();
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ── GET /waha/qr ────────────────────────────────────────────────────

setupWahaRouter.get("/waha/qr", async (_req: Request, res: Response) => {
  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(`${wahaUrl}/api/screenshot?session=default`, {
      headers: wahaHeaders(),
    });
    const contentType = upstream.headers.get("content-type") || "image/png";
    res.setHeader("Content-Type", contentType);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── GET /waha/session ───────────────────────────────────────────────

setupWahaRouter.get("/waha/session", async (_req: Request, res: Response) => {
  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(`${wahaUrl}/api/sessions/default`, {
      headers: wahaHeaders(),
    });
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── GET /waha/groups ──────────────────────────────────────────────

setupWahaRouter.get("/waha/groups", async (_req: Request, res: Response) => {
  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(`${wahaUrl}/api/default/groups`, {
      headers: wahaHeaders(),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: text || `WAHA responded with ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── POST /waha/groups/join ────────────────────────────────────────

setupWahaRouter.post("/waha/groups/join", async (req: Request, res: Response) => {
  const { inviteLink } = req.body;

  if (!inviteLink || typeof inviteLink !== "string") {
    res.status(400).json({ error: "inviteLink is required" });
    return;
  }

  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(`${wahaUrl}/api/default/groups/join`, {
      method: "POST",
      headers: wahaHeaders(),
      body: JSON.stringify({ code: inviteLink }),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: text || `WAHA responded with ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── POST /waha/groups/leave ───────────────────────────────────────

setupWahaRouter.post("/waha/groups/leave", async (req: Request, res: Response) => {
  const { groupId } = req.body;

  if (!groupId || typeof groupId !== "string") {
    res.status(400).json({ error: "groupId is required" });
    return;
  }

  const wahaUrl = getWahaUrl();
  try {
    const upstream = await fetch(
      `${wahaUrl}/api/default/groups/${encodeURIComponent(groupId)}/leave`,
      {
        method: "POST",
        headers: wahaHeaders(),
      },
    );
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: text || `WAHA responded with ${upstream.status}` });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});
