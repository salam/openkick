import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import { getFeedItems } from "../feeds.js";
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
});
