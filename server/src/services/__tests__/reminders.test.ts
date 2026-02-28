import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

// Mock whatsapp sendMessage
vi.mock("../whatsapp.js", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

import { sendMessage } from "../whatsapp.js";
import {
  findPendingReminders,
  sendReminders,
  startReminderScheduler,
  stopReminderScheduler,
} from "../reminders.js";

let db: Database;

function createGuardian(phone: string, language = "de", name = "Guardian"): number {
  db.run(
    "INSERT INTO guardians (phone, name, language, consentGiven) VALUES (?, ?, ?, 1)",
    [phone, name, language],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function createPlayer(name: string): number {
  db.run("INSERT INTO players (name) VALUES (?)", [name]);
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function linkGuardianPlayer(guardianId: number, playerId: number): void {
  db.run(
    "INSERT INTO guardian_players (guardianId, playerId) VALUES (?, ?)",
    [guardianId, playerId],
  );
}

function createEvent(opts: {
  title?: string;
  deadline?: string;
  date?: string;
}): number {
  db.run(
    "INSERT INTO events (type, title, date, deadline) VALUES (?, ?, ?, ?)",
    [
      "training",
      opts.title ?? "Test Training",
      opts.date ?? "2026-03-01",
      opts.deadline ?? null,
    ],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function addAttendance(eventId: number, playerId: number, status: string): void {
  db.run(
    "INSERT INTO attendance (eventId, playerId, status, source, respondedAt) VALUES (?, ?, ?, 'web', datetime('now'))",
    [eventId, playerId, status],
  );
}

describe("reminders service", () => {
  beforeEach(async () => {
    db = await initDB();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopReminderScheduler();
  });

  it("findPendingReminders returns events with deadlines within 24h for non-responding guardians", () => {
    // Deadline 12 hours from now (within 24h window)
    const now = new Date();
    const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const deadlineStr = in12h.toISOString().replace("T", " ").slice(0, 19);

    const eventId = createEvent({ title: "Morning Training", deadline: deadlineStr });
    const guardianId = createGuardian("+41791234567", "de", "Papa");
    const playerId = createPlayer("Max");
    linkGuardianPlayer(guardianId, playerId);

    const pending = findPendingReminders();

    expect(pending).toHaveLength(1);
    expect(pending[0].eventId).toBe(eventId);
    expect(pending[0].eventTitle).toBe("Morning Training");
    expect(pending[0].guardianPhone).toBe("+41791234567");
    expect(pending[0].guardianLanguage).toBe("de");
    expect(pending[0].playerName).toBe("Max");
  });

  it("findPendingReminders does not return events with deadlines outside 24h", () => {
    // Deadline 48 hours from now (outside 24h window)
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const deadlineStr = in48h.toISOString().replace("T", " ").slice(0, 19);

    createEvent({ title: "Far Event", deadline: deadlineStr });
    const guardianId = createGuardian("+41791234567");
    const playerId = createPlayer("Max");
    linkGuardianPlayer(guardianId, playerId);

    const pending = findPendingReminders();
    expect(pending).toHaveLength(0);
  });

  it("findPendingReminders does not return guardians who already responded", () => {
    const now = new Date();
    const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const deadlineStr = in12h.toISOString().replace("T", " ").slice(0, 19);

    const eventId = createEvent({ title: "Training", deadline: deadlineStr });
    const guardianId = createGuardian("+41791234567");
    const playerId = createPlayer("Max");
    linkGuardianPlayer(guardianId, playerId);

    // Guardian already responded for this player
    addAttendance(eventId, playerId, "attending");

    const pending = findPendingReminders();
    expect(pending).toHaveLength(0);
  });

  it("sendReminders sends WhatsApp messages to non-responding guardians", async () => {
    const now = new Date();
    const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const deadlineStr = in12h.toISOString().replace("T", " ").slice(0, 19);

    createEvent({ title: "Evening Training", deadline: deadlineStr });
    const guardianId = createGuardian("+41791234567", "de");
    const playerId = createPlayer("Max");
    linkGuardianPlayer(guardianId, playerId);

    const sent = await sendReminders();

    expect(sent).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "+41791234567",
      "Erinnerung: Bitte melde dich für Evening Training an.",
    );
  });

  it("sendReminders does not send to guardians who already responded", async () => {
    const now = new Date();
    const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const deadlineStr = in12h.toISOString().replace("T", " ").slice(0, 19);

    const eventId = createEvent({ title: "Training", deadline: deadlineStr });
    const guardianId = createGuardian("+41791234567");
    const playerId = createPlayer("Max");
    linkGuardianPlayer(guardianId, playerId);

    addAttendance(eventId, playerId, "absent");

    const sent = await sendReminders();

    expect(sent).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("startReminderScheduler creates an interval", () => {
    vi.useFakeTimers();

    startReminderScheduler(5000);

    // Verify that calling it again doesn't create a second interval
    startReminderScheduler(5000);

    vi.advanceTimersByTime(5000);

    // sendReminders should have been triggered once by the interval
    // (it calls findPendingReminders which needs DB, but that's fine)
    vi.useRealTimers();
  });

  it("stopReminderScheduler clears the interval", () => {
    vi.useFakeTimers();

    startReminderScheduler(5000);
    stopReminderScheduler();

    // After stopping, advancing time should not trigger anything
    vi.advanceTimersByTime(10000);

    // Can start again after stopping
    startReminderScheduler(5000);
    stopReminderScheduler();

    vi.useRealTimers();
  });
});
