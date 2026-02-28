import { describe, it, expect, beforeEach } from "vitest";
import { initDB } from "../../database.js";
import {
  setAttendance,
  getAttendanceForEvent,
  getAttendanceSummary,
} from "../attendance.js";
import type { Database } from "sql.js";

let db: Database;

function createEvent(
  opts: { maxParticipants?: number; title?: string } = {},
): number {
  db.run(
    "INSERT INTO events (type, title, date, maxParticipants) VALUES (?, ?, ?, ?)",
    [
      "training",
      opts.title ?? "Test Event",
      "2026-03-01",
      opts.maxParticipants ?? null,
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

describe("attendance service", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  it("setAttendance creates an attendance record", () => {
    const eventId = createEvent();
    const playerId = createPlayer("Alice");

    const result = setAttendance(eventId, playerId, "attending", "web");

    expect(result.finalStatus).toBe("attending");

    const records = getAttendanceForEvent(eventId);
    expect(records).toHaveLength(1);
    expect(records[0].playerId).toBe(playerId);
    expect(records[0].status).toBe("attending");
    expect(records[0].source).toBe("web");
  });

  it("setAttendance updates existing record for same eventId+playerId", () => {
    const eventId = createEvent();
    const playerId = createPlayer("Bob");

    setAttendance(eventId, playerId, "attending", "web");
    setAttendance(eventId, playerId, "absent", "web", "sick");

    const records = getAttendanceForEvent(eventId);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("absent");
    expect(records[0].reason).toBe("sick");
  });

  it("when maxParticipants is reached, new attending player gets waitlist", () => {
    const eventId = createEvent({ maxParticipants: 2 });
    const p1 = createPlayer("P1");
    const p2 = createPlayer("P2");
    const p3 = createPlayer("P3");

    setAttendance(eventId, p1, "attending", "web");
    setAttendance(eventId, p2, "attending", "web");
    const result = setAttendance(eventId, p3, "attending", "web");

    expect(result.finalStatus).toBe("waitlist");

    const records = getAttendanceForEvent(eventId);
    const p3Record = records.find((r) => r.playerId === p3);
    expect(p3Record?.status).toBe("waitlist");
  });

  it("when attending player goes absent, first waitlisted player is promoted", () => {
    const eventId = createEvent({ maxParticipants: 2 });
    const p1 = createPlayer("P1");
    const p2 = createPlayer("P2");
    const p3 = createPlayer("P3");
    const p4 = createPlayer("P4");

    setAttendance(eventId, p1, "attending", "web");
    setAttendance(eventId, p2, "attending", "web");
    setAttendance(eventId, p3, "attending", "web"); // -> waitlist
    setAttendance(eventId, p4, "attending", "web"); // -> waitlist

    // P1 goes absent
    setAttendance(eventId, p1, "absent", "web");

    const records = getAttendanceForEvent(eventId);
    const p3Record = records.find((r) => r.playerId === p3);
    expect(p3Record?.status).toBe("attending");

    // P4 should still be waitlisted
    const p4Record = records.find((r) => r.playerId === p4);
    expect(p4Record?.status).toBe("waitlist");
  });

  it("getAttendanceForEvent returns all records for the event", () => {
    const eventId = createEvent();
    const p1 = createPlayer("A");
    const p2 = createPlayer("B");

    setAttendance(eventId, p1, "attending", "web");
    setAttendance(eventId, p2, "absent", "web");

    const records = getAttendanceForEvent(eventId);
    expect(records).toHaveLength(2);
  });

  it("getAttendanceSummary returns counts by status", () => {
    const eventId = createEvent({ maxParticipants: 1 });
    const p1 = createPlayer("A");
    const p2 = createPlayer("B");
    const p3 = createPlayer("C");

    setAttendance(eventId, p1, "attending", "web");
    setAttendance(eventId, p2, "attending", "web"); // -> waitlist
    setAttendance(eventId, p3, "absent", "web");

    const summary = getAttendanceSummary(eventId);
    expect(summary).toEqual({
      attending: 1,
      absent: 1,
      waitlist: 1,
      unknown: 0,
    });
  });
});
