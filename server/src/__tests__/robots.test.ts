import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../database.js";
import { wellKnownRouter } from "../routes/feeds.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(wellKnownRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  db.close();
}

describe("GET /robots.txt", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("returns 200", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    expect(res.status).toBe(200);
  });

  it("contains User-agent: *", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    const text = await res.text();
    expect(text).toContain("User-agent: *");
  });

  it("contains Disallow: /api/", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    const text = await res.text();
    expect(text).toContain("Disallow: /api/");
  });

  it("contains Allow: /api/feeds/", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    const text = await res.text();
    expect(text).toContain("Allow: /api/feeds/");
  });

  it("contains Sitemap with base URL", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    const text = await res.text();
    expect(text).toContain(`Sitemap: ${baseUrl}/api/sitemap.xml`);
  });
});
