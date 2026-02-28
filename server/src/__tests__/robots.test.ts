import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import app from "../index.js";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

function get(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      res.on("error", reject);
    });
  });
}

describe("GET /robots.txt", () => {
  it("returns 200", async () => {
    const res = await get("/robots.txt");
    expect(res.status).toBe(200);
  });

  it("contains User-agent: *", async () => {
    const res = await get("/robots.txt");
    expect(res.body).toContain("User-agent: *");
  });

  it("contains Disallow: /api/settings", async () => {
    const res = await get("/robots.txt");
    expect(res.body).toContain("Disallow: /api/settings");
  });
});
