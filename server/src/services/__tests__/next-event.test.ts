import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

describe("findNextUpcomingEventAny", () => {
  beforeEach(async () => {
    db = await initDB();
    vi.useFakeTimers();
    // Set "today" to a Monday (2026-03-02)
    vi.setSystemTime(new Date("2026-03-02T10:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  // BUG12: Bot must find upcoming events from training schedules and event series

  it("returns standalone event from events table", async () => {
    db.run(
      "INSERT INTO events (type, title, date, startTime) VALUES ('training', 'Training Mo', '2026-03-02', '18:00')",
    );

    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result = findNextUpcomingEventAny();

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Training Mo");
    expect(result!.source).toBe("event");
    expect(typeof result!.id).toBe("number");
  });

  it("returns null when no events exist at all", async () => {
    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result = findNextUpcomingEventAny();
    expect(result).toBeNull();
  });

  it("finds next training schedule instance when no standalone events exist", async () => {
    // Wednesday = ISO day 3, next Wednesday from 2026-03-02 (Monday) is 2026-03-04
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );

    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result = findNextUpcomingEventAny();

    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-03-04");
    expect(result!.source).toBe("training");
    expect(result!.title).toContain("Training");
    expect(result!.title).toContain("Sportplatz");
    // Auto-materialized: id should be a number
    expect(typeof result!.id).toBe("number");
  });

  it("finds next event series instance when no standalone events exist", async () => {
    // Create a weekly Wednesday series
    db.run(
      `INSERT INTO event_series (type, title, startTime, recurrenceDay, startDate, endDate)
       VALUES ('training', 'Mittwoch-Training', '18:00', 3, '2026-01-01', '2026-12-31')`,
    );

    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result = findNextUpcomingEventAny();

    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-03-04");
    expect(result!.title).toBe("Mittwoch-Training");
    expect(typeof result!.id).toBe("number"); // auto-materialized
  });

  it("returns the earliest event across all sources", async () => {
    // Standalone event on Friday
    db.run(
      "INSERT INTO events (type, title, date, startTime) VALUES ('match', 'Spiel', '2026-03-06', '15:00')",
    );
    // Training on Wednesday (earlier)
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );

    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result = findNextUpcomingEventAny();

    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-03-04"); // Wednesday training is before Friday match
    expect(result!.source).toBe("training");
  });

  it("skips training days during vacation", async () => {
    // Training on Wednesday
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );
    // Vacation covers the next two Wednesdays
    db.run(
      "INSERT INTO vacation_periods (name, startDate, endDate, source) VALUES ('Ferien', '2026-03-03', '2026-03-15', 'manual')",
    );

    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result = findNextUpcomingEventAny();

    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-03-18"); // First Wednesday after vacation
  });

  it("auto-materializes training event and returns numeric id", async () => {
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );

    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result = findNextUpcomingEventAny();

    expect(result).not.toBeNull();
    expect(typeof result!.id).toBe("number");

    // Verify it was actually inserted into the events table
    const row = db.exec("SELECT id, title, date FROM events WHERE id = ?", [result!.id]);
    expect(row.length).toBe(1);
    expect(row[0].values[0][1]).toContain("Training");
  });

  it("does not duplicate materialized events on repeated calls", async () => {
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );

    const { findNextUpcomingEventAny } = await import("../next-event.js");
    const result1 = findNextUpcomingEventAny();
    const result2 = findNextUpcomingEventAny();

    expect(result1!.id).toBe(result2!.id);

    const count = db.exec("SELECT COUNT(*) FROM events");
    expect(count[0].values[0][0]).toBe(1);
  });
});

describe("findEventByDate", () => {
  beforeEach(async () => {
    db = await initDB();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T10:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it("finds standalone event on specific date", async () => {
    db.run(
      "INSERT INTO events (type, title, date, startTime) VALUES ('training', 'Training Mi', '2026-03-11', '18:00')",
    );

    const { findEventByDate } = await import("../next-event.js");
    const result = findEventByDate("2026-03-11");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Training Mi");
    expect(result!.date).toBe("2026-03-11");
  });

  it("returns null when no event on that date", async () => {
    const { findEventByDate } = await import("../next-event.js");
    const result = findEventByDate("2026-03-11");
    expect(result).toBeNull();
  });

  it("finds training schedule on a matching weekday", async () => {
    // Wednesday = ISO day 3. 2026-03-11 is a Wednesday.
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );

    const { findEventByDate } = await import("../next-event.js");
    const result = findEventByDate("2026-03-11");

    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-03-11");
    expect(result!.source).toBe("training");
    expect(typeof result!.id).toBe("number"); // auto-materialized
  });

  it("does not find training on wrong weekday", async () => {
    // Wednesday training, but 2026-03-12 is a Thursday
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );

    const { findEventByDate } = await import("../next-event.js");
    const result = findEventByDate("2026-03-12");
    expect(result).toBeNull();
  });

  it("finds event series instance on matching date", async () => {
    // Weekly Wednesday series
    db.run(
      `INSERT INTO event_series (type, title, startTime, recurrenceDay, startDate, endDate)
       VALUES ('training', 'Mittwoch-Training', '18:00', 3, '2026-01-01', '2026-12-31')`,
    );

    const { findEventByDate } = await import("../next-event.js");
    const result = findEventByDate("2026-03-18"); // a Wednesday

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Mittwoch-Training");
    expect(result!.date).toBe("2026-03-18");
  });

  it("handles multiple dates independently", async () => {
    db.run(
      "INSERT INTO training_schedule (dayOfWeek, startTime, endTime, location) VALUES (3, '18:00', '19:30', 'Sportplatz')",
    );

    const { findEventByDate } = await import("../next-event.js");
    const r1 = findEventByDate("2026-03-11");
    const r2 = findEventByDate("2026-03-18");

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.date).toBe("2026-03-11");
    expect(r2!.date).toBe("2026-03-18");
    // Each gets its own materialized event
    expect(r1!.id).not.toBe(r2!.id);
  });
});
