import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { initDB, getDB } from "../../database.js";
import { settingsRouter } from "../settings.js";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use("/api", settingsRouter);

describe("Favicon generation on logo upload", () => {
  let port: number;
  let server: ReturnType<typeof app.listen>;
  const uploadDir = path.resolve(__dirname, "../../../../public/uploads");

  beforeEach(async () => {
    await initDB(); // in-memory
    server = app.listen(0);
    port = (server.address() as any).port;
  });

  afterEach(() => {
    server.close();
    // Clean up generated files
    for (const f of [
      "club-logo.png", "favicon.ico", "favicon-16x16.png",
      "favicon-32x32.png", "apple-touch-icon.png",
      "android-chrome-192x192.png", "android-chrome-512x512.png",
      "site.webmanifest",
    ]) {
      const p = path.join(uploadDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it("generates favicon variants when logo is uploaded", async () => {
    const sharp = (await import("sharp")).default;
    const pngBuffer = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const base64 = pngBuffer.toString("base64");

    const res = await fetch(`http://localhost:${port}/api/settings/upload-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: base64, filename: "logo.png" }),
    });

    expect(res.status).toBe(200);

    expect(fs.existsSync(path.join(uploadDir, "favicon-32x32.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "favicon-16x16.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "apple-touch-icon.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "android-chrome-192x192.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "android-chrome-512x512.png"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "favicon.ico"))).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, "site.webmanifest"))).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(uploadDir, "site.webmanifest"), "utf-8"));
    expect(manifest.icons).toHaveLength(2);
    expect(manifest.icons[0].sizes).toBe("192x192");
  });
});
