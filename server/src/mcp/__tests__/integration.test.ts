import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { mcpRouter } from "../index.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/mcp", mcpRouter);
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

describe("MCP HTTP integration", () => {
  beforeEach(async () => {
    await createTestApp();
  });
  afterEach(async () => {
    await teardown();
  });

  it("POST /mcp responds to MCP initialize", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    });
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      // Parse SSE response to extract JSON-RPC message
      const text = await res.text();
      const dataLines = text
        .split("\n")
        .filter((line) => line.startsWith("data: "));
      expect(dataLines.length).toBeGreaterThan(0);
      const jsonStr = dataLines[0].slice("data: ".length);
      const body = JSON.parse(jsonStr);
      expect(body.result).toBeDefined();
      expect(body.result.serverInfo.name).toBe("openkick");
    } else {
      const body = await res.json();
      expect(body.result).toBeDefined();
      expect(body.result.serverInfo.name).toBe("openkick");
    }
  });

  it("POST /mcp rejects non-initialize as first request", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("GET /mcp without session returns 400", async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("DELETE /mcp without session returns 400", async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });
});
