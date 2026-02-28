import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { getFeedItems, type FeedQuery } from "../services/feeds.js";
import { xmlEscape } from "../utils/xml.js";
import {
  toRss,
  toAtom,
  toIcs,
  toActivityPubOutbox,
  toActivityPubActor,
  toAtProtoFeed,
  toAtProtoDid,
} from "../services/feed-serializers.js";

export const feedsRouter = Router();
export const wellKnownRouter = Router();

const CLUB_NAME = "OpenKick";

function getSetting(key: string): string | null {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

function isFeedEnabled(feedKey: string): boolean {
  const master = getSetting("feeds_enabled");
  if (master === "false") return false;
  const specific = getSetting(feedKey);
  return specific !== "false";
}

function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function parseQuery(req: Request): FeedQuery {
  const query: FeedQuery = {};
  const type = req.query.type as string | undefined;
  if (type && ["training", "tournament", "match"].includes(type)) {
    query.type = type as FeedQuery["type"];
  }
  const limit = parseInt(req.query.limit as string, 10);
  if (!isNaN(limit)) query.limit = limit;
  return query;
}

// RSS 2.0
feedsRouter.get("/feeds/rss", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_rss_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const xml = toRss(items, getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/rss+xml; charset=utf-8").send(xml);
});

// Atom 1.0
feedsRouter.get("/feeds/atom", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_atom_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const xml = toAtom(items, getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/atom+xml; charset=utf-8").send(xml);
});

// ICS - combined
feedsRouter.get("/feeds/calendar.ics", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_ics_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const ics = toIcs(items, CLUB_NAME);
  res.set("Content-Type", "text/calendar; charset=utf-8").send(ics);
});

// ICS - per type
for (const eventType of ["tournaments", "matches", "trainings"] as const) {
  const singular = eventType.replace(/s$/, "") as FeedQuery["type"];
  feedsRouter.get(`/feeds/calendar/${eventType}.ics`, (_req: Request, res: Response) => {
    if (!isFeedEnabled("feed_ics_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
    const items = getFeedItems({ type: singular });
    const ics = toIcs(items, CLUB_NAME);
    res.set("Content-Type", "text/calendar; charset=utf-8").send(ics);
  });
}

// ActivityPub actor
feedsRouter.get("/feeds/activitypub/actor", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_activitypub_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const actor = toActivityPubActor(getBaseUrl(req), CLUB_NAME);
  res.set("Content-Type", "application/activity+json; charset=utf-8").json(actor);
});

// ActivityPub outbox
feedsRouter.get("/feeds/activitypub/outbox", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_activitypub_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const outbox = toActivityPubOutbox(items, getBaseUrl(req));
  res.set("Content-Type", "application/activity+json; charset=utf-8").json(outbox);
});

// AT Protocol feed
feedsRouter.get("/feeds/atprotocol/feed", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_atprotocol_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const items = getFeedItems(parseQuery(req));
  const feed = toAtProtoFeed(items, getBaseUrl(req));
  res.json(feed);
});

// Dynamic sitemap
feedsRouter.get("/sitemap.xml", (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const feedEntries: { path: string; settingKey: string }[] = [
    { path: "/api/feeds/rss", settingKey: "feed_rss_enabled" },
    { path: "/api/feeds/atom", settingKey: "feed_atom_enabled" },
    { path: "/api/feeds/calendar.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/calendar/tournaments.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/calendar/matches.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/calendar/trainings.ics", settingKey: "feed_ics_enabled" },
    { path: "/api/feeds/activitypub/actor", settingKey: "feed_activitypub_enabled" },
    { path: "/api/feeds/activitypub/outbox", settingKey: "feed_activitypub_enabled" },
    { path: "/api/feeds/atprotocol/feed", settingKey: "feed_atprotocol_enabled" },
  ];

  const urls = feedEntries
    .filter((e) => isFeedEnabled(e.settingKey))
    .map((e) => `  <url><loc>${xmlEscape(base + e.path)}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${xmlEscape(base)}</loc></url>
${urls}
</urlset>`;

  res.set("Content-Type", "application/xml; charset=utf-8").send(xml);
});

// WebFinger (ActivityPub discovery)
wellKnownRouter.get("/.well-known/webfinger", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_activitypub_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const base = getBaseUrl(req);
  const host = req.get("host") || "localhost";
  res.json({
    subject: `acct:club@${host}`,
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `${base}/api/feeds/activitypub/actor`,
      },
    ],
  });
});

// DID document (AT Protocol discovery)
wellKnownRouter.get("/.well-known/did.json", (req: Request, res: Response) => {
  if (!isFeedEnabled("feed_atprotocol_enabled")) { res.status(404).json({ error: "Feed disabled" }); return; }
  const did = toAtProtoDid(getBaseUrl(req));
  res.json(did);
});

// Dynamic robots.txt
wellKnownRouter.get("/robots.txt", (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const text = `User-agent: *
Allow: /api/feeds/
Allow: /api/sitemap.xml
Disallow: /api/
Disallow: /dashboard/
Disallow: /settings/

Sitemap: ${base}/api/sitemap.xml
`;
  res.set("Content-Type", "text/plain; charset=utf-8").send(text);
});
