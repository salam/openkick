import { describe, it, expect } from "vitest";
import {
  toRss,
  toAtom,
  toIcs,
  toActivityPubOutbox,
  toAtProtoFeed,
  formatTrophyText,
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
    placement: null,
    totalTeams: null,
    trophySummary: null,
    resultsUrl: null,
    achievements: [],
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
    placement: null,
    totalTeams: null,
    trophySummary: null,
    resultsUrl: null,
    achievements: [],
  },
];

const trophyItem: FeedItem = {
  id: 3,
  type: "tournament",
  title: "Summer Cup",
  description: "Summer championship",
  date: "2026-06-20",
  startTime: "10:00",
  location: "Arena X",
  categoryRequirement: null,
  createdAt: "2026-06-01T12:00:00",
  placement: 2,
  totalTeams: 12,
  trophySummary: "Great team effort",
  resultsUrl: "https://example.com/results",
  achievements: [{ type: "fair_play", label: "Fair Play Award" }],
};

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

describe("formatTrophyText", () => {
  it("returns null when no placement", () => {
    expect(formatTrophyText(sampleItems[0])).toBeNull();
  });

  it("formats placement with totalTeams", () => {
    const text = formatTrophyText(trophyItem);
    expect(text).toContain("2nd place");
    expect(text).toContain("12 teams");
  });

  it("includes achievements", () => {
    const text = formatTrophyText(trophyItem)!;
    expect(text).toContain("Fair Play Award");
  });

  it("formats 1st place correctly", () => {
    const text = formatTrophyText({ ...trophyItem, placement: 1, totalTeams: 8, achievements: [] });
    expect(text).toContain("1st place");
    expect(text).toContain("8 teams");
  });

  it("formats 3rd place correctly", () => {
    const text = formatTrophyText({ ...trophyItem, placement: 3 });
    expect(text).toContain("3rd place");
  });

  it("formats other placements with th suffix", () => {
    const text = formatTrophyText({ ...trophyItem, placement: 5 });
    expect(text).toContain("5th place");
  });

  it("handles placement without totalTeams", () => {
    const text = formatTrophyText({ ...trophyItem, totalTeams: null });
    expect(text).toContain("2nd place");
    expect(text).not.toContain("teams");
  });
});

describe("RSS serializer with trophies", () => {
  it("includes trophy text in description", () => {
    const xml = toRss([trophyItem], baseUrl, "OpenKick");
    expect(xml).toContain("2nd place");
    expect(xml).toContain("Fair Play Award");
  });

  it("does not add trophy text for events without results", () => {
    const xml = toRss(sampleItems, baseUrl, "OpenKick");
    expect(xml).not.toContain("place");
  });
});

describe("Atom serializer with trophies", () => {
  it("includes trophy text in summary", () => {
    const xml = toAtom([trophyItem], baseUrl, "OpenKick");
    expect(xml).toContain("2nd place");
    expect(xml).toContain("Fair Play Award");
  });
});

describe("ICS serializer with trophies", () => {
  it("includes trophy text in DESCRIPTION", () => {
    const ics = toIcs([trophyItem], "OpenKick");
    expect(ics).toContain("2nd place");
    // ICS line folding may split long lines; unfold before checking
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("Fair Play Award");
  });
});

describe("ActivityPub serializer with trophies", () => {
  it("includes trophy text in content HTML", () => {
    const json = toActivityPubOutbox([trophyItem], baseUrl);
    const content = json.orderedItems[0].object.content;
    expect(content).toContain("2nd place");
    expect(content).toContain("Fair Play Award");
  });
});
