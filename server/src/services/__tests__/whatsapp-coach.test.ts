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

// Mock whatsapp sendMessage
vi.mock("../whatsapp.js", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

// Mock whatsapp-templates
vi.mock("../whatsapp-templates.js", () => ({
  getBotTemplate: vi.fn(
    (key: string, _lang: string, params?: Record<string, string>) => {
      let tmpl = key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          tmpl += ` ${k}=${v}`;
        }
      }
      return tmpl;
    },
  ),
}));

// Mock attendance
vi.mock("../attendance.js", () => ({
  setAttendance: vi.fn().mockReturnValue({ finalStatus: "attending" }),
}));

/**
 * Helper: seed the database with test data for coach tests.
 */
function seedTestData() {
  // Insert a future event
  db.run(
    "INSERT INTO events (id, type, title, date, startTime) VALUES (1, 'training', 'Training Mo', '2099-03-03', '18:00')",
  );

  // Insert players
  db.run("INSERT INTO players (id, name) VALUES (1, 'Luca')");
  db.run("INSERT INTO players (id, name) VALUES (2, 'Emma')");
  db.run("INSERT INTO players (id, name) VALUES (3, 'Noah')");
  db.run("INSERT INTO players (id, name) VALUES (4, 'Mia')");
  db.run("INSERT INTO players (id, name) VALUES (5, 'Leon')");
  db.run("INSERT INTO players (id, name) VALUES (6, 'Sofia')");

  // Insert guardians for the players
  db.run(
    "INSERT INTO guardians (id, phone, name, role) VALUES (10, '41791000001', 'Parent Luca', 'parent')",
  );
  db.run(
    "INSERT INTO guardians (id, phone, name, role) VALUES (11, '41791000002', 'Parent Emma', 'parent')",
  );
  db.run(
    "INSERT INTO guardians (id, phone, name, role) VALUES (12, '41791000003', 'Parent Noah', 'parent')",
  );
  db.run(
    "INSERT INTO guardians (id, phone, name, role) VALUES (13, '41791000004', 'Parent Mia', 'parent')",
  );
  db.run(
    "INSERT INTO guardians (id, phone, name, role) VALUES (14, '41791000005', 'Parent Leon', 'parent')",
  );
  db.run(
    "INSERT INTO guardians (id, phone, name, role) VALUES (15, '41791000006', 'Parent Sofia', 'parent')",
  );

  // Link guardians to players
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (10, 1)",
  );
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (11, 2)",
  );
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (12, 3)",
  );
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (13, 4)",
  );
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (14, 5)",
  );
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (15, 6)",
  );

  // Attendance: Luca, Emma, Noah attending; Mia absent; Leon, Sofia pending (no record)
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source) VALUES (1, 1, 'attending', 'web')",
  );
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source) VALUES (1, 2, 'attending', 'web')",
  );
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source) VALUES (1, 3, 'attending', 'web')",
  );
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source) VALUES (1, 4, 'absent', 'web')",
  );
}

describe("whatsapp-coach service", () => {
  beforeEach(async () => {
    db = await initDB();
    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  describe("parseCoachIntent", () => {
    it("returns attendance_overview for 'Wer kommt?'", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: "attendance_overview",
          playerName: null,
          status: null,
          reason: null,
        }),
        model: "gpt-4o",
      });

      const { parseCoachIntent } = await import("../whatsapp-coach.js");
      const result = await parseCoachIntent("Wer kommt?");

      expect(result.intent).toBe("attendance_overview");
      expect(chatCompletionMock).toHaveBeenCalledOnce();
    });

    it("returns match_sheet for 'Aufstellung?'", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: "match_sheet",
          playerName: null,
          status: null,
          reason: null,
        }),
        model: "gpt-4o",
      });

      const { parseCoachIntent } = await import("../whatsapp-coach.js");
      const result = await parseCoachIntent("Aufstellung?");

      expect(result.intent).toBe("match_sheet");
    });

    it("returns cancel_event for 'Training absagen'", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: "cancel_event",
          playerName: null,
          status: null,
          reason: null,
        }),
        model: "gpt-4o",
      });

      const { parseCoachIntent } = await import("../whatsapp-coach.js");
      const result = await parseCoachIntent("Training absagen");

      expect(result.intent).toBe("cancel_event");
    });

    it("returns send_reminder for 'Erinnerung senden'", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: "send_reminder",
          playerName: null,
          status: null,
          reason: null,
        }),
        model: "gpt-4o",
      });

      const { parseCoachIntent } = await import("../whatsapp-coach.js");
      const result = await parseCoachIntent("Erinnerung senden");

      expect(result.intent).toBe("send_reminder");
    });

    it("returns mark_attendance for 'Luca anwesend'", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: "mark_attendance",
          playerName: "Luca",
          status: "attending",
          reason: null,
        }),
        model: "gpt-4o",
      });

      const { parseCoachIntent } = await import("../whatsapp-coach.js");
      const result = await parseCoachIntent("Luca anwesend");

      expect(result.intent).toBe("mark_attendance");
      expect(result.playerName).toBe("Luca");
      expect(result.status).toBe("attending");
    });

    it("returns admin_link for 'Dashboard'", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: "admin_link",
          playerName: null,
          status: null,
          reason: null,
        }),
        model: "gpt-4o",
      });

      const { parseCoachIntent } = await import("../whatsapp-coach.js");
      const result = await parseCoachIntent("Dashboard");

      expect(result.intent).toBe("admin_link");
    });

    it("returns unknown on invalid JSON", async () => {
      const { chatCompletion } = await import("../llm.js");
      const chatCompletionMock = vi.mocked(chatCompletion);
      chatCompletionMock.mockResolvedValueOnce({
        content: "not valid json",
        model: "gpt-4o",
      });

      const { parseCoachIntent } = await import("../whatsapp-coach.js");
      const result = await parseCoachIntent("gibberish");

      expect(result.intent).toBe("unknown");
    });
  });

  describe("handleCoachIntent - attendance_overview", () => {
    it("formats and sends attendance overview for next event", async () => {
      seedTestData();

      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "attendance_overview", playerName: null, status: undefined, reason: null },
        "de",
      );

      expect(sendMock).toHaveBeenCalledOnce();
      const msg = sendMock.mock.calls[0][1];
      expect(msg).toContain("whatsapp_coach_attendance_overview");
    });

    it("sends no-event message when no upcoming event", async () => {
      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "attendance_overview", playerName: null, status: undefined, reason: null },
        "de",
      );

      expect(sendMock).toHaveBeenCalledOnce();
      const msg = sendMock.mock.calls[0][1];
      expect(msg).toContain("whatsapp_coach_no_event");
    });
  });

  describe("handleCoachIntent - cancel_event", () => {
    it("deletes the event and notifies guardians", async () => {
      seedTestData();

      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "cancel_event", playerName: null, status: undefined, reason: null },
        "de",
      );

      // Event should be deleted from DB
      const events = db.exec("SELECT id FROM events WHERE id = 1");
      expect(events.length === 0 || events[0].values.length === 0).toBe(true);

      // Should have sent messages to guardians + confirmation to coach
      expect(sendMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Coach confirmation message
      const coachMsg = sendMock.mock.calls[sendMock.mock.calls.length - 1][1];
      expect(coachMsg).toContain("whatsapp_coach_event_cancelled");
    });
  });

  describe("handleCoachIntent - send_reminder", () => {
    it("sends reminders to guardians of players without attendance", async () => {
      seedTestData();

      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "send_reminder", playerName: null, status: undefined, reason: null },
        "de",
      );

      // Leon (5) and Sofia (6) have no attendance record -> their guardians get reminders
      // Plus confirmation to coach = 3 calls
      expect(sendMock.mock.calls.length).toBe(3);

      // Confirmation to coach
      const coachMsg = sendMock.mock.calls[2][1];
      expect(coachMsg).toContain("whatsapp_coach_reminder_sent");
      expect(coachMsg).toContain("count=2");
    });
  });

  describe("handleCoachIntent - mark_attendance", () => {
    it("sets attendance for named player and confirms", async () => {
      seedTestData();

      const { setAttendance } = await import("../attendance.js");
      const setAttendanceMock = vi.mocked(setAttendance);
      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "mark_attendance", playerName: "Luca", status: "attending", reason: null },
        "de",
      );

      expect(setAttendanceMock).toHaveBeenCalledWith(1, 1, "attending", "whatsapp");
      expect(sendMock).toHaveBeenCalledOnce();
      const msg = sendMock.mock.calls[0][1];
      expect(msg).toContain("whatsapp_coach_mark_confirmed");
    });

    it("sends player-not-found when player name does not match", async () => {
      seedTestData();

      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "mark_attendance", playerName: "UnknownPlayer", status: "attending", reason: null },
        "de",
      );

      expect(sendMock).toHaveBeenCalledOnce();
      const msg = sendMock.mock.calls[0][1];
      expect(msg).toContain("whatsapp_coach_player_not_found");
    });
  });

  describe("handleCoachIntent - match_sheet", () => {
    it("formats and sends match sheet for next event", async () => {
      seedTestData();

      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "match_sheet", playerName: null, status: undefined, reason: null },
        "de",
      );

      expect(sendMock).toHaveBeenCalledOnce();
      const msg = sendMock.mock.calls[0][1];
      expect(msg).toContain("whatsapp_coach_attendance_overview");
    });
  });

  describe("handleCoachIntent - admin_link", () => {
    it("sends a deep link to the web portal", async () => {
      const { sendMessage } = await import("../whatsapp.js");
      const sendMock = vi.mocked(sendMessage);

      const { handleCoachIntent } = await import("../whatsapp-coach.js");
      await handleCoachIntent(
        "41790000000",
        { intent: "admin_link", playerName: null, status: undefined, reason: null },
        "de",
      );

      expect(sendMock).toHaveBeenCalledOnce();
      const msg = sendMock.mock.calls[0][1];
      expect(msg).toContain("whatsapp_coach_admin_link");
      expect(msg).toContain("/dashboard");
    });
  });
});
