import { describe, it, expect, beforeEach } from "vitest";
import { initDB } from "../../database.js";
import { checkThresholds } from "../tournament-alerts.js";
import type { Database } from "sql.js";

let db: Database;

function createEvent(opts: {
  type?: string;
  title?: string;
  maxParticipants?: number | null;
  minParticipants?: number | null;
  deadline?: string | null;
}): number {
  db.run(
    "INSERT INTO events (type, title, date, maxParticipants, minParticipants, deadline) VALUES (?, ?, ?, ?, ?, ?)",
    [
      opts.type ?? "tournament",
      opts.title ?? "Test Tournament",
      "2026-04-01",
      opts.maxParticipants ?? null,
      opts.minParticipants ?? null,
      opts.deadline ?? null,
    ],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function createPlayer(name: string): number {
  db.run("INSERT INTO players (name) VALUES (?)", [name]);
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function addAttendance(eventId: number, playerId: number, status: string): void {
  db.run(
    "INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)",
    [eventId, playerId, status],
  );
}

describe("tournament-alerts", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it('should trigger "filling_up" alert at 80% capacity', () => {
    const eventId = createEvent({ maxParticipants: 10 });

    // Add 8 attending players (80%)
    for (let i = 0; i < 8; i++) {
      const pid = createPlayer(`Player${i}`);
      addAttendance(eventId, pid, "attending");
    }

    const alert = checkThresholds(eventId);
    expect(alert).not.toBeNull();
    expect(alert!.type).toBe("filling_up");
    expect(alert!.message).toContain("Test Tournament");
  });

  it('should trigger "full" alert at 100% capacity', () => {
    const eventId = createEvent({ maxParticipants: 5 });

    for (let i = 0; i < 5; i++) {
      const pid = createPlayer(`Player${i}`);
      addAttendance(eventId, pid, "attending");
    }

    const alert = checkThresholds(eventId);
    expect(alert).not.toBeNull();
    expect(alert!.type).toBe("full");
    expect(alert!.message).toContain("Test Tournament");
  });

  it("should return null when no threshold crossed", () => {
    const eventId = createEvent({ maxParticipants: 10 });

    // Add only 5 attending players (50%) — below 80%
    for (let i = 0; i < 5; i++) {
      const pid = createPlayer(`Player${i}`);
      addAttendance(eventId, pid, "attending");
    }

    const alert = checkThresholds(eventId);
    expect(alert).toBeNull();
  });

  it("should not re-alert for same threshold (deduplication)", () => {
    const eventId = createEvent({ maxParticipants: 10 });

    for (let i = 0; i < 8; i++) {
      const pid = createPlayer(`Player${i}`);
      addAttendance(eventId, pid, "attending");
    }

    const first = checkThresholds(eventId);
    expect(first).not.toBeNull();
    expect(first!.type).toBe("filling_up");

    // Second call should be deduplicated
    const second = checkThresholds(eventId);
    expect(second).toBeNull();
  });

  it("should return null for open-call events (no maxParticipants)", () => {
    const eventId = createEvent({ type: "tournament", maxParticipants: null });

    const pid = createPlayer("Player1");
    addAttendance(eventId, pid, "attending");

    const alert = checkThresholds(eventId);
    expect(alert).toBeNull();
  });

  it("should return null for non-tournament events", () => {
    const eventId = createEvent({ type: "training", maxParticipants: 10 });

    for (let i = 0; i < 10; i++) {
      const pid = createPlayer(`Player${i}`);
      addAttendance(eventId, pid, "attending");
    }

    const alert = checkThresholds(eventId);
    expect(alert).toBeNull();
  });

  it("should upgrade alert from filling_up to full", () => {
    const eventId = createEvent({ maxParticipants: 10 });

    // First, 8 players -> filling_up
    for (let i = 0; i < 8; i++) {
      const pid = createPlayer(`Player${i}`);
      addAttendance(eventId, pid, "attending");
    }

    const first = checkThresholds(eventId);
    expect(first).not.toBeNull();
    expect(first!.type).toBe("filling_up");

    // Add 2 more -> full (different alert type, should not be deduplicated)
    for (let i = 8; i < 10; i++) {
      const pid = createPlayer(`Player${i}`);
      addAttendance(eventId, pid, "attending");
    }

    const second = checkThresholds(eventId);
    expect(second).not.toBeNull();
    expect(second!.type).toBe("full");
  });
});
