import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock the llm module
vi.mock("../llm.js", () => ({
  chatCompletion: vi.fn(),
}));

// Mock the whatsapp module
vi.mock("../whatsapp.js", () => ({
  sendMessage: vi.fn(),
}));

describe("broadcasts service", () => {
  beforeEach(async () => {
    db = await initDB();
    fetchMock.mockReset();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  describe("composeTrainingHeadsup", () => {
    it("returns a formatted message string with time, location, weather", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: "Morgen Training um 18:00 auf Sportplatz A. Wetter: 15°C, leicht bewölkt. Bitte pünktlich!",
        model: "gpt-4o",
      });

      const { composeTrainingHeadsup } = await import("../broadcasts.js");
      const result = await composeTrainingHeadsup(
        { title: "E-Junioren Training", date: "2026-03-02", startTime: "18:00", location: "Sportplatz A" },
        { temperature: 15, description: "Partly cloudy" },
      );

      expect(result).toBe(
        "Morgen Training um 18:00 auf Sportplatz A. Wetter: 15°C, leicht bewölkt. Bitte pünktlich!",
      );

      expect(chatCompletionMock).toHaveBeenCalledOnce();
      const messages = chatCompletionMock.mock.calls[0][0];
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toContain("18:00");
      expect(messages[1].content).toContain("Sportplatz A");
      expect(messages[1].content).toContain("15°C");
      expect(messages[1].content).toContain("Partly cloudy");
    });
  });

  describe("composeRainAlert", () => {
    it("returns a cancellation message with event details", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockClear();
      chatCompletionMock.mockResolvedValueOnce({
        content: "Leider fällt das Training am 02.03. um 18:00 wegen Regen aus. Wir informieren euch über den nächsten Termin!",
        model: "gpt-4o",
      });

      const { composeRainAlert } = await import("../broadcasts.js");
      const result = await composeRainAlert({
        title: "E-Junioren Training",
        date: "2026-03-02",
        startTime: "18:00",
      });

      expect(result).toBe(
        "Leider fällt das Training am 02.03. um 18:00 wegen Regen aus. Wir informieren euch über den nächsten Termin!",
      );

      expect(chatCompletionMock).toHaveBeenCalledOnce();
      const messages = chatCompletionMock.mock.calls[0][0];
      expect(messages[0].role).toBe("system");
      expect(messages[1].content).toContain("E-Junioren Training");
      expect(messages[1].content).toContain("18:00");
    });
  });

  describe("composeHolidayAnnouncement", () => {
    it("returns announcement message with vacation name and dates", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockClear();
      chatCompletionMock.mockResolvedValueOnce({
        content: "Liebe Eltern, vom 12.04. bis 26.04. sind Frühlingsferien. In dieser Zeit finden keine Trainings statt. Schöne Ferien!",
        model: "gpt-4o",
      });

      const { composeHolidayAnnouncement } = await import("../broadcasts.js");
      const result = await composeHolidayAnnouncement(
        "Frühlingsferien",
        "2026-04-12",
        "2026-04-26",
      );

      expect(result).toBe(
        "Liebe Eltern, vom 12.04. bis 26.04. sind Frühlingsferien. In dieser Zeit finden keine Trainings statt. Schöne Ferien!",
      );

      expect(chatCompletionMock).toHaveBeenCalledOnce();
      const messages = chatCompletionMock.mock.calls[0][0];
      expect(messages[1].content).toContain("Frühlingsferien");
      expect(messages[1].content).toContain("2026-04-12");
      expect(messages[1].content).toContain("2026-04-26");
    });
  });

  describe("sendBroadcast", () => {
    it("sends message to all guardians via WhatsApp and updates broadcast status", async () => {
      // Create a broadcast
      db.run(
        "INSERT INTO broadcasts (type, message, status) VALUES (?, ?, ?)",
        ["training_headsup", "Morgen Training um 18:00!", "draft"],
      );
      const broadcastId = (db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] as number);

      // Create guardians with phone numbers
      db.run(
        "INSERT INTO guardians (phone, name, consentGiven) VALUES (?, ?, ?)",
        ["41791111111", "Mama Müller", 1],
      );
      db.run(
        "INSERT INTO guardians (phone, name, consentGiven) VALUES (?, ?, ?)",
        ["41792222222", "Papa Schmidt", 1],
      );
      db.run(
        "INSERT INTO guardians (phone, name, consentGiven) VALUES (?, ?, ?)",
        ["41793333333", "Mama Weber", 1],
      );

      const { sendMessage } = await import("../whatsapp.js");
      const sendMessageMock = vi.mocked(sendMessage);
      sendMessageMock.mockResolvedValue(undefined);

      const { sendBroadcast } = await import("../broadcasts.js");
      const result = await sendBroadcast(broadcastId);

      expect(result.sent).toBe(3);
      expect(sendMessageMock).toHaveBeenCalledTimes(3);
      expect(sendMessageMock).toHaveBeenCalledWith("41791111111", "Morgen Training um 18:00!");
      expect(sendMessageMock).toHaveBeenCalledWith("41792222222", "Morgen Training um 18:00!");
      expect(sendMessageMock).toHaveBeenCalledWith("41793333333", "Morgen Training um 18:00!");

      // Verify broadcast status updated
      const rows = db.exec("SELECT status, sentAt FROM broadcasts WHERE id = ?", [broadcastId]);
      expect(rows[0].values[0][0]).toBe("sent");
      expect(rows[0].values[0][1]).not.toBeNull();
    });

    it("throws if broadcast not found", async () => {
      const { sendBroadcast } = await import("../broadcasts.js");
      await expect(sendBroadcast(999)).rejects.toThrow("Broadcast not found");
    });

    it("throws if broadcast has no message", async () => {
      db.run(
        "INSERT INTO broadcasts (type, status) VALUES (?, ?)",
        ["training_headsup", "draft"],
      );
      const broadcastId = (db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] as number);

      const { sendBroadcast } = await import("../broadcasts.js");
      await expect(sendBroadcast(broadcastId)).rejects.toThrow("Broadcast has no message");
    });
  });
});
