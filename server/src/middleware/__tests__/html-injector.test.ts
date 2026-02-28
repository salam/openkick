import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { initDB, getDB } from "../../database.js";
import { htmlInjector } from "../html-injector.js";

describe("htmlInjector middleware", () => {
  let port: number;
  let server: ReturnType<ReturnType<typeof express>["listen"]>;

  beforeEach(async () => {
    await initDB(); // in-memory
  });

  afterEach(() => {
    if (server) server.close();
  });

  it("injects meta tags and settings script into HTML responses", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_name",
      "Test FC",
    ]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_description",
      "A test club",
    ]);

    const app = express();
    app.use(htmlInjector);
    app.get("/test", (_req, res) => {
      res
        .type("html")
        .send(
          "<html><head><title>Old Title</title></head><body>Hello</body></html>",
        );
    });
    server = app.listen(0);
    port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/test`);
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
    app.use(htmlInjector);
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

    const app = express();
    app.use(htmlInjector);
    app.get("/test", (_req, res) => {
      res
        .type("html")
        .send(
          "<html><head><title>X</title></head><body></body></html>",
        );
    });
    server = app.listen(0);
    port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/test`);
    const body = await res.text();

    expect(body).toContain('property="og:title" content="Custom OG Title"');
    expect(body).toContain("<title>Custom OG Title -");
  });
});
