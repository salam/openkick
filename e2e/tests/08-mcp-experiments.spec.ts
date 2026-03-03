import { test, expect } from "@playwright/test";
import { API_BASE } from "../helpers/auth.js";
import http from "node:http";

/**
 * MCP uses StreamableHTTP with SSE responses.
 * Playwright's request API reads the full response body and closes the connection,
 * which may trigger session cleanup. We test using raw HTTP to control connection lifecycle.
 */

function mcpRequest(
  sessionId: string | null,
  body: Record<string, unknown>
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(`${API_BASE}/mcp`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string>,
            body: responseBody,
          });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

test.describe("08 — MCP Experiments", () => {
  test("full MCP session lifecycle", async () => {
    // 1. Initialize — creates session
    const initRes = await mcpRequest(null, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e-test-client", version: "1.0.0" },
      },
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers["mcp-session-id"];
    expect(sessionId).toBeTruthy();

    // Parse SSE body to verify initialize response
    expect(initRes.body).toContain("serverInfo");
    expect(initRes.body).toContain("openkick");

    // 2. Send initialized notification
    const notifRes = await mcpRequest(sessionId, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    // Notifications return 202 Accepted (no response body expected)
    expect([200, 202]).toContain(notifRes.status);

    // 3. List tools
    const toolsRes = await mcpRequest(sessionId, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    expect(toolsRes.status).toBe(200);
    expect(toolsRes.body).toContain("get_club_info");
    expect(toolsRes.body).toContain("list_upcoming_events");
    expect(toolsRes.body).toContain("get_trophy_cabinet");
    expect(toolsRes.body).toContain("get_attendance_stats");
    expect(toolsRes.body).toContain("get_player_categories");

    // 4. Call get_club_info
    const clubRes = await mcpRequest(sessionId, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_club_info", arguments: {} },
    });
    expect(clubRes.status).toBe(200);
    // Club name should contain what we set during onboarding
    expect(clubRes.body).toMatch(/FC Test E2E|My Club/);

    // 5. Call list_upcoming_events
    const eventsRes = await mcpRequest(sessionId, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "list_upcoming_events", arguments: { limit: 10 } },
    });
    expect(eventsRes.status).toBe(200);
    // Should contain events or empty array
    expect(eventsRes.body).toContain("content");
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
});
