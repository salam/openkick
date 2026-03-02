import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

// Mock fetch globally before importing the module under test
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock the llm module
vi.mock("../llm.js", () => ({
  chatCompletion: vi.fn(),
}));

describe("whatsapp service", () => {
  beforeEach(async () => {
    db = await initDB();
    fetchMock.mockReset();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  describe("sendMessage", () => {
    it("calls WAHA REST API at {wahaUrl}/api/sendText with correct payload", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const { sendMessage } = await import("../whatsapp.js");
      await sendMessage("41791234567", "Hello there");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:3008/api/sendText");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(options.body);
      expect(body.chatId).toBe("41791234567@c.us");
      expect(body.text).toBe("Hello there (by OpenKick)");
      expect(body.session).toBe("default");
    });

    it("reads wahaUrl from settings DB", async () => {
      db.run(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('waha_url', 'http://custom-waha:9000')",
      );
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const { sendMessage } = await import("../whatsapp.js");
      await sendMessage("41791234567", "Test");

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("http://custom-waha:9000/api/sendText");
    });
  });

  describe("parseAttendanceMessage", () => {
    it('parses "Luca krank" to absent with playerName and reason', async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          playerName: "Luca",
          status: "absent",
          reason: "krank",
        }),
        model: "gpt-4o",
      });

      const { parseAttendanceMessage } = await import("../whatsapp.js");
      const result = await parseAttendanceMessage("Luca krank");

      expect(result).toEqual({
        playerName: "Luca",
        status: "absent",
        reason: "krank",
      });

      // Verify LLM was called with correct messages
      expect(chatCompletionMock).toHaveBeenCalledOnce();
      const messages = chatCompletionMock.mock.calls[0][0];
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toBe("Luca krank");
    });

    it('parses "Wir kommen morgen" to attending with no playerName', async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          playerName: null,
          status: "attending",
          reason: null,
        }),
        model: "gpt-4o",
      });

      const { parseAttendanceMessage } = await import("../whatsapp.js");
      const result = await parseAttendanceMessage("Wir kommen morgen");

      expect(result).toEqual({
        playerName: null,
        status: "attending",
        reason: null,
      });
    });
  });

  describe("reactToMessage", () => {
    it("calls WAHA PUT /api/reaction with correct payload", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const { reactToMessage } = await import("../whatsapp.js");
      await reactToMessage("false_41791234567@c.us_AAAAAA", "👀");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:3008/api/reaction");
      expect(options.method).toBe("PUT");

      const body = JSON.parse(options.body);
      expect(body.messageId).toBe("false_41791234567@c.us_AAAAAA");
      expect(body.reaction).toBe("👀");
      expect(body.session).toBe("default");
    });
  });

  describe("parseIntent", () => {
    it("classifies 'Luca kommt' as attending with playerName", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({ intent: "attending", playerName: "Luca", reason: null }),
        model: "gpt-4o",
      });

      const { parseIntent } = await import("../whatsapp.js");
      const result = await parseIntent("Luca kommt");

      expect(result.intent).toBe("attending");
      expect(result.playerName).toBe("Luca");
    });

    it("classifies 'nicht dabei' as absent without playerName", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({ intent: "absent", playerName: null, reason: null }),
        model: "gpt-4o",
      });

      const { parseIntent } = await import("../whatsapp.js");
      const result = await parseIntent("nicht dabei");

      expect(result.intent).toBe("absent");
      expect(result.playerName).toBeNull();
    });

    it("classifies unrelated message as unknown", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({ intent: "unknown", playerName: null, reason: null }),
        model: "gpt-4o",
      });

      const { parseIntent } = await import("../whatsapp.js");
      const result = await parseIntent("Was gibt es zum Mittagessen?");

      expect(result.intent).toBe("unknown");
    });

    it("returns unknown on invalid JSON response", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: "not valid json",
        model: "gpt-4o",
      });

      const { parseIntent } = await import("../whatsapp.js");
      const result = await parseIntent("something");

      expect(result.intent).toBe("unknown");
    });
  });
});
