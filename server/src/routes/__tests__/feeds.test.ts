import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { feedsRouter, wellKnownRouter } from "../feeds.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  db.run(
    `INSERT INTO events (type, title, date, startTime, location)
     VALUES ('tournament', 'Test Cup', '2026-05-01', '10:00', 'Field A')`
  );
  const app = express();
  app.use(express.json());
  app.use(wellKnownRouter);
  app.use("/api", feedsRouter);
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

describe("Feed routes", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /api/feeds/rss returns RSS XML", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/rss`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const text = await res.text();
    expect(text).toContain("<rss");
    expect(text).toContain("Test Cup");
  });

  it("GET /api/feeds/atom returns Atom XML", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/atom`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/atom+xml");
    const text = await res.text();
    expect(text).toContain("<feed");
  });

  it("GET /api/feeds/calendar.ics returns ICS", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/calendar.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("Test Cup");
  });

  it("GET /api/feeds/calendar/tournaments.ics filters by type", async () => {
    db.run(
      `INSERT INTO events (type, title, date) VALUES ('training', 'Weekday Training', '2026-05-02')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/calendar/tournaments.ics`);
    const text = await res.text();
    expect(text).toContain("Test Cup");
    expect(text).not.toContain("Weekday Training");
  });

  it("GET /api/feeds/activitypub/actor returns actor JSON", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/activitypub/actor`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe("Organization");
  });

  it("GET /api/feeds/activitypub/outbox returns OrderedCollection", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/activitypub/outbox`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe("OrderedCollection");
    expect(json.totalItems).toBeGreaterThan(0);
  });

  it("GET /api/feeds/atprotocol/feed returns feed skeleton", async () => {
    const res = await fetch(`${baseUrl}/api/feeds/atprotocol/feed`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.feed).toHaveLength(1);
  });

  it("returns 404 when feed is disabled", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('feed_rss_enabled', 'false')");
    const res = await fetch(`${baseUrl}/api/feeds/rss`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when master toggle is off", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('feeds_enabled', 'false')");
    const res = await fetch(`${baseUrl}/api/feeds/rss`);
    expect(res.status).toBe(404);
  });

  it("supports ?type query param on RSS", async () => {
    db.run(
      `INSERT INTO events (type, title, date) VALUES ('training', 'Extra Training', '2026-05-02')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/rss?type=training`);
    const text = await res.text();
    expect(text).toContain("Extra Training");
    expect(text).not.toContain("Test Cup");
  });

  it("GET /api/feeds/calendar/trophies.ics returns only events with results", async () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
       VALUES (1, 1, 8, '[]')`
    );
    db.run(
      `INSERT INTO events (type, title, date) VALUES ('training', 'Weekday Training', '2026-05-02')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/calendar/trophies.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const text = await res.text();
    expect(text).toContain("Test Cup");
    expect(text).not.toContain("Weekday Training");
    expect(text).toContain("1st place");
  });

  it("GET /api/feeds/rss?trophies=only returns only events with results", async () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
       VALUES (1, 2, 10, '[{"type":"fair_play","label":"Fair Play"}]')`
    );
    db.run(
      `INSERT INTO events (type, title, date) VALUES ('training', 'Extra Training', '2026-05-02')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/rss?trophies=only`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Test Cup");
    expect(text).toContain("2nd place");
    expect(text).not.toContain("Extra Training");
  });

  it("GET /api/feeds/atom?trophies=only returns only events with results", async () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
       VALUES (1, 3, 6, '[]')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/atom?trophies=only`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Test Cup");
    expect(text).toContain("3rd place");
  });

  it("RSS feed enriches events that have results", async () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
       VALUES (1, 1, 8, '[{"type":"fair_play","label":"Fair Play Award"}]')`
    );
    const res = await fetch(`${baseUrl}/api/feeds/rss`);
    const text = await res.text();
    expect(text).toContain("1st place");
    expect(text).toContain("Fair Play Award");
  });
});

describe("Well-known endpoints", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /.well-known/webfinger returns actor link", async () => {
    const res = await fetch(
      `${baseUrl}/.well-known/webfinger?resource=acct:club@localhost`
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.links).toBeDefined();
    expect(json.links[0].type).toBe("application/activity+json");
  });

  it("GET /.well-known/did.json returns DID document", async () => {
    const res = await fetch(`${baseUrl}/.well-known/did.json`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toContain("did:web:");
  });
});

describe("Sitemap and robots.txt", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /api/sitemap.xml returns XML sitemap", async () => {
    const res = await fetch(`${baseUrl}/api/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const text = await res.text();
    expect(text).toContain("<urlset");
    expect(text).toContain("/api/feeds/rss");
  });

  it("sitemap omits disabled feeds", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('feed_rss_enabled', 'false')");
    const res = await fetch(`${baseUrl}/api/sitemap.xml`);
    const text = await res.text();
    expect(text).not.toContain("/api/feeds/rss");
    expect(text).toContain("/api/feeds/atom");
  });

  it("GET /robots.txt returns robots file", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Sitemap:");
  });

  it("sitemap includes /trophies page", async () => {
    const res = await fetch(`${baseUrl}/api/sitemap.xml`);
    const text = await res.text();
    expect(text).toContain("/trophies");
  });

  it("sitemap includes events with results", async () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, achievements) VALUES (1, 1, '[]')`
    );
    const res = await fetch(`${baseUrl}/api/sitemap.xml`);
    const text = await res.text();
    expect(text).toContain("/events/1");
  });

  it("sitemap includes trophies.ics feed", async () => {
    const res = await fetch(`${baseUrl}/api/sitemap.xml`);
    const text = await res.text();
    expect(text).toContain("/api/feeds/calendar/trophies.ics");
  });
});
