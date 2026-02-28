import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { checklistsRouter } from "../checklists.routes.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;
let adminToken: string;

async function createTestApp() {
  db = await initDB();
  db.run(
    "INSERT INTO guardians (phone, role, passwordHash) VALUES (?, ?, ?)",
    ["+41790000001", "admin", "hash"]
  );
  const guardianResult = db.exec("SELECT last_insert_rowid() AS id");
  const userId = guardianResult[0].values[0][0] as number;
  adminToken = generateJWT({ id: userId, role: "admin" });

  const app = express();
  app.use(express.json());
  app.use("/api", checklistsRouter);
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

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };
}

describe("Checklists routes", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /api/admin/checklists returns empty list initially", async () => {
    const res = await fetch(`${baseUrl}/api/admin/checklists`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("POST /api/admin/checklists creates custom checklist", async () => {
    const res = await fetch(`${baseUrl}/api/admin/checklists`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "admin",
        items: [
          { label: "Task A", sortOrder: 1 },
          { label: "Task B", sortOrder: 2 },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.items.length).toBe(2);
  });

  it("PUT toggle item completion", async () => {
    const createRes = await fetch(`${baseUrl}/api/admin/checklists`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "admin",
        items: [{ label: "Toggle me", sortOrder: 1 }],
      }),
    });
    const checklist = await createRes.json();
    const itemId = checklist.items[0].id;

    const res = await fetch(
      `${baseUrl}/api/admin/checklists/${checklist.id}/items/${itemId}`,
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ completed: true }),
      }
    );
    expect(res.status).toBe(200);
    const item = await res.json();
    expect(item.completed).toBe(1);
  });

  it("DELETE rejects non-custom items with 403", async () => {
    const { instantiateFromTemplate, getInstance } = await import("../../services/checklist.service.js");
    const instance = instantiateFromTemplate("admin", null);
    const full = getInstance(instance.id as number);
    const templateItemId = full.items[0].id;

    const res = await fetch(
      `${baseUrl}/api/admin/checklists/${instance.id}/items/${templateItemId}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      }
    );
    expect(res.status).toBe(403);
  });

  it("PUT reorder applies correct ordering", async () => {
    const createRes = await fetch(`${baseUrl}/api/admin/checklists`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "admin",
        items: [
          { label: "First", sortOrder: 1 },
          { label: "Second", sortOrder: 2 },
          { label: "Third", sortOrder: 3 },
        ],
      }),
    });
    const checklist = await createRes.json();
    const ids = checklist.items.map((i: { id: number }) => i.id);

    const res = await fetch(
      `${baseUrl}/api/admin/checklists/${checklist.id}/reorder`,
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ order: [ids[2], ids[0], ids[1]] }),
      }
    );
    expect(res.status).toBe(200);
    const items = await res.json();
    expect(items[0].id).toBe(ids[2]);
  });

  it("unauthenticated requests return 401", async () => {
    const res = await fetch(`${baseUrl}/api/admin/checklists`);
    expect(res.status).toBe(401);
  });

  it("GET/PUT /api/admin/classifications manages club classifications", async () => {
    const putRes = await fetch(`${baseUrl}/api/admin/classifications`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ classifications: ["sfv", "fvrz"] }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/api/admin/classifications`, {
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body).toContain("sfv");
    expect(body).toContain("fvrz");
  });
});
