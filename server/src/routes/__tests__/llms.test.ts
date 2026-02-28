import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB } from "../../database.js";
import { llmsRouter } from "../llms.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use("/", llmsRouter);
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

describe("llms.txt route", () => {
  beforeEach(async () => {
    await createTestApp();
  });

  afterEach(async () => {
    await teardown();
  });

  it("returns plain text with default 'My Club' when no club_name setting configured", async () => {
    const res = await fetch(`${baseUrl}/llms.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("# My Club");
  });

  it("returns content with expected sections", async () => {
    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();
    expect(body).toContain("## Public Data Available");
    expect(body).toContain("## API Endpoints");
    expect(body).toContain("## Statistics");
    expect(body).toContain("Players:");
  });

  it("uses club_name from settings when configured", async () => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "club_name",
      "FC Test Club",
    ]);
    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();
    expect(body).toContain("# FC Test Club");
    expect(body).not.toContain("# My Club");
  });

  it("includes live player count", async () => {
    db.run(
      "INSERT INTO players (name, category) VALUES (?, ?)",
      ["Alice", "U12"]
    );
    db.run(
      "INSERT INTO players (name, category) VALUES (?, ?)",
      ["Bob", "U14"]
    );
    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();
    expect(body).toContain("Players: 2");
  });

  it("includes upcoming event count (excludes past events)", async () => {
    // Two future events
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["training", "Future Training 1", "2099-06-01"]
    );
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["match", "Future Match", "2099-12-15"]
    );
    // One past event
    db.run(
      "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
      ["training", "Past Training", "2020-01-01"]
    );

    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();
    expect(body).toContain("Upcoming events: 2");
  });
});
