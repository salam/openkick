import { test, expect } from "@playwright/test";
import { API_BASE } from "../helpers/auth.js";

test.describe("08 — MCP Experiments", () => {
  let sessionId: string;

  test("initialize MCP session", async ({ request }) => {
    const res = await request.post(`${API_BASE}/mcp`, {
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test-client", version: "1.0.0" },
        },
      },
    });
    expect(res.status()).toBe(200);
    sessionId = res.headers()["mcp-session-id"];
    expect(sessionId).toBeTruthy();
  });

  test("send initialized notification", async ({ request }) => {
    const res = await request.post(`${API_BASE}/mcp`, {
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      },
    });
    expect(res.status()).toBe(200);
  });

  test("list available tools", async ({ request }) => {
    const res = await request.post(`${API_BASE}/mcp`, {
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      },
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("get_club_info");
    expect(text).toContain("list_upcoming_events");
    expect(text).toContain("get_trophy_cabinet");
  });

  test("call get_club_info tool", async ({ request }) => {
    const res = await request.post(`${API_BASE}/mcp`, {
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_club_info", arguments: {} },
      },
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("FC Test E2E");
  });

  test("call list_upcoming_events tool", async ({ request }) => {
    const res = await request.post(`${API_BASE}/mcp`, {
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "list_upcoming_events", arguments: { limit: 10 } },
      },
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("Training");
  });

  test("invalid session ID returns error", async ({ request }) => {
    const res = await request.post(`${API_BASE}/mcp`, {
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": "nonexistent-session-id",
      },
      data: {
        jsonrpc: "2.0",
        id: 99,
        method: "tools/list",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("close MCP session", async ({ request }) => {
    const res = await request.delete(`${API_BASE}/mcp`, {
      headers: { "mcp-session-id": sessionId },
    });
    expect(res.status()).toBe(200);
  });
});
