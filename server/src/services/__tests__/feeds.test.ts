import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import { getFeedItems, getTrophyFeedItems } from "../feeds.js";
import type { Database } from "sql.js";

let db: Database;

describe("FeedService", () => {
  beforeEach(async () => {
    db = await initDB();
    db.run(
      `INSERT INTO events (type, title, description, date, startTime, location)
       VALUES ('tournament', 'Spring Cup', 'Annual spring tournament', '2026-04-15', '09:00', 'Stadium A')`
    );
    db.run(
      `INSERT INTO events (type, title, date, startTime, location)
       VALUES ('training', 'Monday Training', '2026-03-10', '18:00', 'Field B')`
    );
    db.run(
      `INSERT INTO events (type, title, date, location)
       VALUES ('match', 'League Match', '2025-11-20', 'Arena C')`
    );
  });

  afterEach(() => {
    db.close();
  });

  it("returns all events ordered by date descending", () => {
    const items = getFeedItems();
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe("Spring Cup");
    expect(items[2].title).toBe("League Match");
  });

  it("filters by event type", () => {
    const items = getFeedItems({ type: "tournament" });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Spring Cup");
  });

  it("respects limit parameter", () => {
    const items = getFeedItems({ limit: 2 });
    expect(items).toHaveLength(2);
  });

  it("caps limit at 200", () => {
    const items = getFeedItems({ limit: 999 });
    expect(items.length).toBeLessThanOrEqual(200);
  });

  it("does not expose PII fields", () => {
    const items = getFeedItems();
    for (const item of items) {
      expect(item).not.toHaveProperty("createdBy");
      expect(item).not.toHaveProperty("attachmentPath");
      expect(item).not.toHaveProperty("sourceUrl");
    }
  });

  it("includes all expected public fields", () => {
    const items = getFeedItems();
    const item = items[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("type");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("date");
    expect(item).toHaveProperty("location");
  });

  it("includes trophy fields when tournament_results exist", () => {
    db.run(
      `INSERT INTO tournament_results (eventId, placement, totalTeams, summary, achievements)
       VALUES (1, 2, 12, 'Great performance', '[{"type":"fair_play","label":"Fair Play Award"}]')`
    );
    const items = getFeedItems();
    const cup = items.find((i) => i.title === "Spring Cup")!;
    expect(cup.placement).toBe(2);
    expect(cup.totalTeams).toBe(12);
    expect(cup.trophySummary).toBe("Great performance");
    expect(cup.achievements).toEqual([{ type: "fair_play", label: "Fair Play Award" }]);
  });

  it("returns null trophy fields when no results exist", () => {
    const items = getFeedItems();
    const training = items.find((i) => i.title === "Monday Training")!;
    expect(training.placement).toBeNull();
    expect(training.totalTeams).toBeNull();
    expect(training.trophySummary).toBeNull();
    expect(training.achievements).toEqual([]);
  });

  describe("getTrophyFeedItems", () => {
    it("returns only events with tournament results", () => {
      db.run(
        `INSERT INTO tournament_results (eventId, placement, totalTeams, achievements)
         VALUES (1, 1, 8, '[]')`
      );
      const items = getTrophyFeedItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Spring Cup");
      expect(items[0].placement).toBe(1);
    });

    it("returns empty array when no results exist", () => {
      const items = getTrophyFeedItems();
      expect(items).toHaveLength(0);
    });

    it("respects limit parameter", () => {
      db.run(
        `INSERT INTO tournament_results (eventId, placement, achievements) VALUES (1, 1, '[]')`
      );
      db.run(
        `INSERT INTO tournament_results (eventId, placement, achievements) VALUES (3, 3, '[]')`
      );
      const items = getTrophyFeedItems(1);
      expect(items).toHaveLength(1);
    });
  });
});
