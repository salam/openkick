import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { rateLimit } from "express-rate-limit";

function buildApp(limit: number, method: "get" | "post" = "get") {
  const app = express();
  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests" },
    }),
  );
  app.get("/test", (_req, res) => res.json({ ok: true }));
  app.post("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("generalLimiter", () => {
  it("allows requests under the limit", async () => {
    const app = buildApp(100);
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });
});

describe("authLimiter", () => {
  it("returns 429 after exceeding 10 requests", async () => {
    const app = buildApp(10);
    let lastStatus = 200;
    for (let i = 0; i < 12; i++) {
      const res = await request(app).get("/test");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe("mutationLimiter", () => {
  it("returns 429 after exceeding 30 requests", async () => {
    const app = buildApp(30);
    let lastStatus = 200;
    for (let i = 0; i < 32; i++) {
      const res = await request(app).post("/test");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
