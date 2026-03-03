import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { initDB, getDB } from "../../database.js";
import { generateJWT } from "../../auth.js";
import fs from "node:fs";
import path from "node:path";

let adminToken: string;
const uploadDir = path.resolve(__dirname, "../../../../public/uploads");

const FAVICON_FILES = [
  "club-logo.png", "favicon.ico", "favicon-16x16.png",
  "favicon-32x32.png", "apple-touch-icon.png",
  "android-chrome-192x192.png", "android-chrome-512x512.png",
  "site.webmanifest",
];

function cleanup() {
  for (const f of FAVICON_FILES) {
    const p = path.join(uploadDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function startServer() {
  // Fresh import to pick up any mocks
  const { settingsRouter } = await import("../settings.js");
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use("/api", settingsRouter);
  const server = app.listen(0);
  const port = (server.address() as any).port;
  return { server, port };
}

describe("Favicon generation on logo upload", () => {
  let port: number;
  let server: ReturnType<ReturnType<typeof express>["listen"]>;

  beforeEach(async () => {
    await initDB();
    const db = getDB();
    db.run("INSERT INTO guardians (id, phone, name, role, passwordHash) VALUES (1, '+41790000000', 'Admin', 'admin', 'hash')");
    adminToken = generateJWT({ id: 1, role: "admin" });
    const s = await startServer();
    server = s.server;
    port = s.port;
  });

  afterEach(() => {
    server.close();
    cleanup();
    vi.restoreAllMocks();
  });

  it("generates resized favicon variants when sharp is available", async () => {
    const sharp = (await import("sharp")).default;
    const pngBuffer = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const base64 = pngBuffer.toString("base64");

    const res = await fetch(`http://localhost:${port}/api/settings/upload-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ data: base64, filename: "logo.png" }),
    });

    expect(res.status).toBe(200);

    for (const f of FAVICON_FILES) {
      expect(fs.existsSync(path.join(uploadDir, f))).toBe(true);
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(uploadDir, "site.webmanifest"), "utf-8"));
    expect(manifest.icons).toHaveLength(2);
    expect(manifest.icons[0].sizes).toBe("192x192");
  });

  it("falls back to copying original logo when sharp is unavailable", async () => {
    // Create a minimal valid PNG buffer without sharp
    // 1x1 red pixel PNG
    const pngHex = "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
      "2e0024000000174944415478016260f80f0000010100005018d84d0000000049454e44ae426082";
    const pngBuffer = Buffer.from(pngHex, "hex");
    const base64 = pngBuffer.toString("base64");

    // Mock sharp to throw on dynamic import
    vi.doMock("sharp", () => { throw new Error("sharp not available"); });

    // Need a fresh server so the mocked sharp is picked up
    server.close();
    cleanup();
    const s = await startServer();
    server = s.server;
    port = s.port;

    const res = await fetch(`http://localhost:${port}/api/settings/upload-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ data: base64, filename: "logo.png" }),
    });

    expect(res.status).toBe(200);

    // All favicon files should exist (copied from original)
    for (const f of FAVICON_FILES) {
      expect(fs.existsSync(path.join(uploadDir, f))).toBe(true);
    }

    // Fallback copies should be the same size as the original
    const origSize = fs.statSync(path.join(uploadDir, "club-logo.png")).size;
    expect(fs.statSync(path.join(uploadDir, "favicon-32x32.png")).size).toBe(origSize);
    expect(fs.statSync(path.join(uploadDir, "apple-touch-icon.png")).size).toBe(origSize);

    // Manifest should still be written
    const manifest = JSON.parse(fs.readFileSync(path.join(uploadDir, "site.webmanifest"), "utf-8"));
    expect(manifest.icons).toHaveLength(2);
  });
});
