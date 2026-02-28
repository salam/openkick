import { describe, it, expect } from "vitest";
import express from "express";
import { generalLimiter, authLimiter, mutationLimiter } from "../middleware/rateLimiter.js";

function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use(limiter);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  app.post("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

async function fetchApp(app: express.Express, method: string, path: string) {
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, { method });
      const body = await res.json();
      server.close();
      resolve({ status: res.status, body });
    });
  });
}

describe("generalLimiter", () => {
  it("allows requests under the limit", async () => {
    const app = buildApp(generalLimiter);
    const res = await fetchApp(app, "GET", "/test");
    expect(res.status).toBe(200);
  });
});

describe("authLimiter", () => {
  it("returns 429 after exceeding 10 requests", async () => {
    const app = buildApp(authLimiter);
    let lastStatus = 200;
    for (let i = 0; i < 12; i++) {
      const res = await fetchApp(app, "GET", "/test");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe("mutationLimiter", () => {
  it("returns 429 after exceeding 30 requests", async () => {
    const app = buildApp(mutationLimiter);
    let lastStatus = 200;
    for (let i = 0; i < 32; i++) {
      const res = await fetchApp(app, "POST", "/test");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
