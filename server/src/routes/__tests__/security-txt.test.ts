import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB } from "../../database.js";
import { securityTxtRouter } from "../security-txt.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use(securityTxtRouter);
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

describe("GET /.well-known/security.txt", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("returns RFC 9116 compliant security.txt with defaults", async () => {
    const res = await fetch(`${baseUrl}/.well-known/security.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("Contact: https://github.com/mho/openkick/security/advisories/new");
    expect(body).toContain("Expires:");
    expect(body).toContain("Preferred-Languages: en, de");
  });

  it("includes club owner contacts from settings", async () => {
    const db = getDB();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["security_contact_email", "security@myclub.com"]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["security_contact_url", "https://myclub.com/security"]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["security_policy_url", "https://myclub.com/policy"]);

    const res = await fetch(`${baseUrl}/.well-known/security.txt`);
    const body = await res.text();
    expect(body).toContain("Contact: mailto:security@myclub.com");
    expect(body).toContain("Contact: https://myclub.com/security");
    expect(body).toContain("Policy: https://myclub.com/policy");
  });

  it("omits empty optional fields", async () => {
    const res = await fetch(`${baseUrl}/.well-known/security.txt`);
    const body = await res.text();
    expect(body).not.toContain("Encryption:");
    expect(body).not.toContain("Policy:");
  });
});
