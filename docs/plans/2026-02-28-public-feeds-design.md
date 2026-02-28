# Public Feeds & Subscriptions Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Add public feeds (RSS 2.0, Atom 1.0, ActivityPub, AT Protocol, ICS) for upcoming events and historical results. Include a homepage subscribe widget, admin toggles, dynamic sitemap, and robots.txt.

## Architecture: Unified Feed Service (Approach A)

A single `FeedService` queries events from the database and returns normalized feed items. Each route handler calls the service and serializes to its format. Settings toggles control which feeds are active.

## Data Layer

### FeedItem

```ts
interface FeedItem {
  id: number;
  type: 'training' | 'tournament' | 'match';
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  location: string | null;
  category: string | null;
  result?: string | null;   // past events only
  score?: string | null;    // past events only
}
```

**Privacy:** No player names, no PII, no attendance details.

### Settings Keys

| Key | Default | Description |
|-----|---------|-------------|
| `feeds_enabled` | `true` | Master toggle |
| `feed_rss_enabled` | `true` | RSS 2.0 |
| `feed_atom_enabled` | `true` | Atom 1.0 |
| `feed_activitypub_enabled` | `true` | ActivityPub outbox |
| `feed_atprotocol_enabled` | `true` | AT Protocol feed |
| `feed_ics_enabled` | `true` | ICS calendar |
| `feed_sitemap_enabled` | `true` | Include feeds in sitemap |

All enabled by default. Admin disables via `PUT /api/settings/:key`.

## API Routes

### Feed Endpoints (public, no auth)

| Endpoint | Format | Content |
|----------|--------|---------|
| `GET /api/feeds/rss` | RSS 2.0 XML | All events |
| `GET /api/feeds/atom` | Atom 1.0 XML | All events |
| `GET /api/feeds/activitypub/outbox` | ActivityPub JSON-LD | OrderedCollection |
| `GET /api/feeds/atprotocol/feed` | AT Protocol JSON | Feed skeleton |
| `GET /api/feeds/calendar.ics` | iCalendar | All events combined |
| `GET /api/feeds/calendar/tournaments.ics` | iCalendar | Tournaments only |
| `GET /api/feeds/calendar/matches.ics` | iCalendar | Matches only |
| `GET /api/feeds/calendar/trainings.ics` | iCalendar | Trainings only |

Query params: `?type=tournament|match|training`, `?limit=50` (max 200).

Returns 404 when the feed is disabled in settings.

### ActivityPub Discovery

| Endpoint | Purpose |
|----------|---------|
| `GET /.well-known/webfinger?resource=acct:club@domain` | WebFinger |
| `GET /api/feeds/activitypub/actor` | Actor profile (Organization) |

### AT Protocol Discovery

| Endpoint | Purpose |
|----------|---------|
| `GET /.well-known/did.json` | DID document |

### Sitemap & Robots

| Endpoint | Purpose |
|----------|---------|
| `GET /api/sitemap.xml` | Dynamic sitemap with enabled feed URLs |
| `GET /robots.txt` | Points to sitemap, allows feed crawling |

### Content-Type Headers

| Feed | Content-Type |
|------|-------------|
| RSS | `application/rss+xml` |
| Atom | `application/atom+xml` |
| ActivityPub | `application/activity+json` |
| AT Protocol | `application/json` |
| ICS | `text/calendar` |
| Sitemap | `application/xml` |

## Frontend

### SubscribeCard (`web/src/components/SubscribeCard.tsx`)

Collapsible card on homepage, collapsed by default. Sections:

1. **Calendar** — ICS feed URLs with copy-to-clipboard, brief how-to for Google/Apple/Outlook
2. **RSS/Atom** — Feed URLs with copy buttons, mention of popular readers
3. **Social** — ActivityPub handle for Mastodon, AT Protocol handle for Bluesky

Auto-detects current domain for URLs. Translated via i18n (de/en/fr).

### Settings Page Addition

New "Public Feeds" section with toggle switches for each feed type plus a master toggle.

## Implementation Details

- **No heavy dependencies.** XML/ICS/JSON built with template strings + `xmlEscape` utility.
- **No caching.** DB queries on each request are fine for club-scale traffic.
- **ActivityPub:** Read-only publisher. No inbox, no interaction handling.
- **AT Protocol:** Feed generator only. No full PDS.

## Testing

- Unit tests for FeedService (filtering, privacy)
- Unit tests for each serializer (valid output)
- Route tests (200 when enabled, 404 when disabled, correct headers)
- Sitemap test (lists enabled feeds, omits disabled)
