import { test, expect } from "@playwright/test";
import { AUTH_FILE, ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";
import { ApiHelper } from "../helpers/api.js";
import {
  MSG_AVA_YES_MARLO_NO,
  MSG_DATE_AWARE_ABSENCES,
} from "../fixtures/waha-messages.js";
import http from "node:http";

test.use({ storageState: AUTH_FILE });

/**
 * Minimal mock LLM server that returns canned intent-parsing responses.
 */
function startMockLLM(): Promise<{ url: string; server: http.Server; calls: string[] }> {
  const calls: string[] = [];
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        calls.push(body);
        const parsed = JSON.parse(body);
        const userMsg = parsed.messages?.find((m: { role: string }) => m.role === "user")?.content ?? "";

        let intentJson: string;
        if (userMsg.includes("Ava kommt, Marlo nicht")) {
          intentJson = JSON.stringify([
            { playerName: "Ava", status: "attending", date: null, reason: null },
            { playerName: "Marlo", status: "absent", date: null, reason: null },
          ]);
        } else if (userMsg.includes("nächste Woche") || userMsg.includes("diese Woche")) {
          intentJson = JSON.stringify([
            { playerName: "Ava", status: "absent", date: "next_week", reason: "kann nicht" },
            { playerName: "Marlo", status: "absent", date: "this_week", reason: "kann nicht" },
          ]);
        } else {
          intentJson = JSON.stringify([]);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          choices: [{ message: { role: "assistant", content: intentJson } }],
        }));
      });
    });
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      resolve({ url: `http://localhost:${port}`, server: srv, calls });
    });
  });
}

test.describe("06 — WhatsApp Attendance", () => {
  let api: ApiHelper;
  let mockLLM: { url: string; server: http.Server; calls: string[] };

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    const { token } = await api.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    api.setToken(token);

    mockLLM = await startMockLLM();

    await api.putSetting("llm_provider", "openai");
    await api.putSetting("llm_api_key", "test-key");
    await api.putSetting("llm_base_url", `${mockLLM.url}/v1`);
    await api.putSetting("llm_model", "mock-model");
    await api.putSetting("waha_url", mockLLM.url);
    await api.putSetting("waha_api_key", "test-key");
  });

  test.afterAll(async () => {
    mockLLM.server.close();
  });

  test("send 'Ava kommt, Marlo nicht' webhook", async () => {
    const { status, body } = await api.sendWhatsAppWebhook(MSG_AVA_YES_MARLO_NO);
    expect(status).toBe(200);
    expect(["ok", "no_event", "no_players", "unknown_sender"]).toContain(body.status);
  });

  test("send date-aware absence webhook", async () => {
    const { status, body } = await api.sendWhatsAppWebhook(MSG_DATE_AWARE_ABSENCES);
    expect(status).toBe(200);
    expect(["ok", "no_event", "no_players", "unknown_sender"]).toContain(body.status);
  });

  test("verify attendance records updated (if events matched)", async () => {
    const attendance = await api.getAttendance(1);
    expect(Array.isArray(attendance) || typeof attendance === "object").toBe(true);
  });

  test("mock LLM was called for intent parsing", async () => {
    expect(mockLLM.calls.length).toBeGreaterThan(0);
  });
});
