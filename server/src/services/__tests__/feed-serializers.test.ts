import { describe, it, expect } from "vitest";
import {
  toRss,
  toAtom,
  toIcs,
  toActivityPubOutbox,
  toAtProtoFeed,
} from "../feed-serializers.js";
import type { FeedItem } from "../feeds.js";

const sampleItems: FeedItem[] = [
  {
    id: 1,
    type: "tournament",
    title: "Spring Cup",
    description: "Annual spring tournament",
    date: "2026-04-15",
    startTime: "09:00",
    location: "Stadium A",
    categoryRequirement: null,
    createdAt: "2026-03-01T10:00:00",
  },
  {
    id: 2,
    type: "training",
    title: "Monday Training",
    description: null,
    date: "2026-03-10",
    startTime: "18:00",
    location: "Field B",
    categoryRequirement: null,
    createdAt: "2026-02-28T08:00:00",
  },
];

const baseUrl = "https://club.example.com";

describe("RSS serializer", () => {
  it("produces valid RSS 2.0 XML", () => {
    const xml = toRss(sampleItems, baseUrl, "OpenKick");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<rss");
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<title>OpenKick</title>");
    expect(xml).toContain("<item>");
    expect(xml).toContain("<title>Spring Cup</title>");
  });

  it("escapes special characters in XML", () => {
    const items: FeedItem[] = [{
      ...sampleItems[0],
      title: 'Match A & B <cup>',
    }];
    const xml = toRss(items, baseUrl, "OpenKick");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;cup&gt;");
  });
});

describe("Atom serializer", () => {
  it("produces valid Atom 1.0 XML", () => {
    const xml = toAtom(sampleItems, baseUrl, "OpenKick");
    expect(xml).toContain("<feed");
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain("<entry>");
    expect(xml).toContain("<title>Spring Cup</title>");
  });
});

describe("ICS serializer", () => {
  it("produces valid iCalendar output", () => {
    const ics = toIcs(sampleItems, "OpenKick");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Spring Cup");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("sets correct DTSTART for events with time", () => {
    const ics = toIcs(sampleItems, "OpenKick");
    expect(ics).toContain("DTSTART:20260415T090000");
  });

  it("sets all-day DTSTART for events without time", () => {
    const items: FeedItem[] = [{
      ...sampleItems[0],
      startTime: null,
    }];
    const ics = toIcs(items, "OpenKick");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260415");
  });
});

describe("ActivityPub outbox serializer", () => {
  it("produces OrderedCollection", () => {
    const json = toActivityPubOutbox(sampleItems, baseUrl);
    expect(json.type).toBe("OrderedCollection");
    expect(json.totalItems).toBe(2);
    expect(json.orderedItems).toHaveLength(2);
    expect(json.orderedItems[0].type).toBe("Create");
    expect(json.orderedItems[0].object.type).toBe("Note");
  });
});

describe("AT Protocol feed serializer", () => {
  it("produces feed skeleton", () => {
    const json = toAtProtoFeed(sampleItems, baseUrl);
    expect(json.feed).toHaveLength(2);
    expect(json.feed[0]).toHaveProperty("post");
  });
});
