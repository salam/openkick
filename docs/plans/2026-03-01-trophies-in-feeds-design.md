# Trophies in Feeds — Design

**Date:** 2026-03-01
**Status:** Approved

## Goal

Add trophy/tournament result data to all existing feed outputs (RSS, Atom, ICS, ActivityPub, AT Protocol, sitemap) and expose a new MCP tool for trophy cabinet queries.

## Approach

**Approach A — Enrich at the FeedService layer.** Extend `getFeedItems()` with a LEFT JOIN to `tournament_results`, adding optional trophy fields to `FeedItem`. Serializers conditionally render trophy info when present. A new `getTrophyFeedItems()` uses INNER JOIN for dedicated trophy-only feeds.

### Why this approach

- Single query, no two-pass overhead
- All serializers benefit from enrichment automatically
- Backwards-compatible (new fields are optional/nullable)
- Avoids code duplication vs. a separate TrophyFeedService

## Data Model

### Extended FeedItem interface

```typescript
export interface FeedItem {
  id: number;
  type: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  location: string | null;
  categoryRequirement: string | null;
  createdAt: string;
  // Trophy enrichment (present when tournament_results exist for this event)
  placement: number | null;
  totalTeams: number | null;
  trophySummary: string | null;
  resultsUrl: string | null;
  achievements: { type: string; label: string }[];
}
```

### SQL changes

`getFeedItems()` query becomes:

```sql
SELECT e.id, e.type, e.title, e.description, e.date, e.startTime,
       e.location, e.categoryRequirement, e.createdAt,
       tr.placement, tr.totalTeams, tr.summary AS trophySummary,
       tr.resultsUrl, tr.achievements
FROM events e
LEFT JOIN tournament_results tr ON tr.eventId = e.id
ORDER BY e.date DESC
LIMIT ?
```

New `getTrophyFeedItems(limit)` uses `INNER JOIN` instead of `LEFT JOIN` — returns only events with results.

## Serializer Changes

### Shared helper

```typescript
function formatTrophyText(item: FeedItem): string | null
```

Returns a human-readable trophy summary like:
- `🏆 2nd place (12 teams). Achievements: Fair Play Award`
- `🏆 1st place (8 teams)`
- Returns `null` if no trophy data (placement is null)

### Per-format behavior

| Format | Where trophy text appears |
|--------|--------------------------|
| **RSS** | Appended to `<description>` |
| **Atom** | Appended to `<summary>` |
| **ICS** | Appended to `DESCRIPTION` with `\n` separator |
| **ActivityPub** | Additional `<p>` in `content` HTML |
| **AT Protocol** | No content field to enrich (URI-only format) |

## New Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `GET /api/feeds/calendar/trophies.ics` | ICS | Calendar with only events that have tournament results |
| `GET /api/feeds/rss?trophies=only` | RSS | Filter to show only trophy events |
| `GET /api/feeds/atom?trophies=only` | Atom | Filter to show only trophy events |

Existing feeds continue to work as before — events with results now include trophy text in their descriptions.

## Sitemap Changes

Add to sitemap URL list:
- `/trophies` — trophy cabinet page (static entry)
- `/events/:id` for each event that has `tournament_results` (dynamic, queried)
- `/api/feeds/calendar/trophies.ics` — new trophy calendar feed

## MCP Tool

New tool mirroring the existing REST endpoint:

```typescript
server.tool(
  "get_trophy_cabinet",
  "Get the club's trophy cabinet with placements and achievements",
  { limit: z.number().optional().describe("Max entries to return (default 50)") },
  async ({ limit }) => {
    const entries = getTrophyCabinet(limit ?? 50);
    return {
      content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
    };
  }
);
```

## Privacy

No changes needed. Trophy data (`tournament_results`) contains no PII — only placement numbers, achievement labels, and event metadata. Player names are never included.

## Files to modify

1. `server/src/services/feeds.ts` — extend FeedItem, add LEFT JOIN, add getTrophyFeedItems()
2. `server/src/services/feed-serializers.ts` — add formatTrophyText(), update all serializers
3. `server/src/routes/feeds.ts` — add trophies.ics endpoint, trophies=only query param, sitemap entries
4. `server/src/mcp/server.ts` — add get_trophy_cabinet tool
5. Tests for all of the above
