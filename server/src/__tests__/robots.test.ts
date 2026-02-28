import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server: Server;
let baseUrl: string;

async function createTestApp() {
  const app = express();
  app.use(express.static(path.resolve(__dirname, "../../../public")));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
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

  it("contains Disallow: /api/settings", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    const text = await res.text();
    expect(text).toContain("Disallow: /api/settings");
  });
});
