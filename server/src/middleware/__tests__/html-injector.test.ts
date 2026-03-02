import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initDB, getDB } from "../../database.js";
import { createHtmlInjector } from "../html-injector.js";

describe("htmlInjector middleware", () => {
  let port: number;
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let tmpDir: string;

  beforeEach(async () => {
    await initDB(); // in-memory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "html-injector-test-"));
  });

  afterEach(() => {
    if (server) server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("injects meta tags and settings script into HTML served by express.static", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_name",
      "Test FC",
    ]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_description",
      "A test club",
    ]);

    // Write a test HTML file
    fs.writeFileSync(
      path.join(tmpDir, "index.html"),
      "<html><head><title>Old Title</title></head><body>Hello</body></html>",
    );

    const app = express();
    // Use the injector + static, same as production
    app.use(createHtmlInjector(tmpDir));
    app.use(express.static(tmpDir));
    server = app.listen(0);
    port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/`);
    const body = await res.text();

    expect(body).toContain("<title>Test FC - A test club</title>");
    expect(body).toContain('property="og:title" content="Test FC"');
    expect(body).toContain('property="og:description" content="A test club"');
    expect(body).toContain("window.__CLUB_SETTINGS__=");
    expect(body).toContain('"club_name":"Test FC"');
    expect(body).toContain('rel="icon"');
    expect(body).toContain('name="twitter:card"');
  });

  it("does not modify non-HTML responses", async () => {
    const app = express();
    app.use(createHtmlInjector(tmpDir));
    app.get("/api/test", (_req, res) => {
      res.json({ hello: "world" });
    });
    server = app.listen(0);
    port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/api/test`);
    const body = await res.json();
    expect(body).toEqual({ hello: "world" });
  });

  it("uses fallback chain for OG tags", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_name",
      "My Club",
    ]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "og_title",
      "Custom OG Title",
    ]);

    fs.writeFileSync(
      path.join(tmpDir, "index.html"),
      "<html><head><title>X</title></head><body></body></html>",
    );

    const app = express();
    app.use(createHtmlInjector(tmpDir));
    app.use(express.static(tmpDir));
    server = app.listen(0);
    port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/`);
    const body = await res.text();

    expect(body).toContain('property="og:title" content="Custom OG Title"');
    expect(body).toContain("<title>Custom OG Title -");
  });

  it("injects JSON-LD structured data and og:url", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_name",
      "FC Flügelflitzer",
    ]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_description",
      "Junioren E",
    ]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_logo",
      "/uploads/logo.png",
    ]);

    fs.writeFileSync(
      path.join(tmpDir, "index.html"),
      "<html><head><title>X</title></head><body></body></html>",
    );

    const app = express();
    app.use(createHtmlInjector(tmpDir));
    app.use(express.static(tmpDir));
    server = app.listen(0);
    port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/`);
    const body = await res.text();

    // og:url
    expect(body).toContain('property="og:url"');

    // JSON-LD
    expect(body).toContain('type="application/ld+json"');
    const jsonLdMatch = body.match(
      /<script type="application\/ld\+json">(.*?)<\/script>/,
    );
    expect(jsonLdMatch).toBeTruthy();
    const jsonLd = JSON.parse(jsonLdMatch![1].replace(/\\u003c/g, "<"));
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("SportsOrganization");
    expect(jsonLd.name).toBe("FC Flügelflitzer");
    expect(jsonLd.description).toBe("Junioren E");
    expect(jsonLd.logo).toContain("/uploads/logo.png");
  });

  it("injects into nested page HTML files", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_name",
      "Nested FC",
    ]);

    // Create nested directory with index.html (like Next.js static export)
    const subDir = path.join(tmpDir, "dashboard");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, "index.html"),
      "<html><head><title>Dashboard</title></head><body>Dashboard</body></html>",
    );

    const app = express();
    app.use(createHtmlInjector(tmpDir));
    app.use(express.static(tmpDir));
    server = app.listen(0);
    port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/dashboard/`);
    const body = await res.text();

    expect(body).toContain("Nested FC");
    expect(body).toContain("window.__CLUB_SETTINGS__=");
  });
});
