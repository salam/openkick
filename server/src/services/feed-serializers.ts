import { xmlEscape } from "../utils/xml.js";
import type { FeedItem } from "./feeds.js";

function toRfc822(dateStr: string, timeStr?: string | null): string {
  const d = timeStr
    ? new Date(`${dateStr}T${timeStr}:00`)
    : new Date(`${dateStr}T00:00:00`);
  return d.toUTCString();
}

function toIso(dateStr: string, timeStr?: string | null): string {
  const d = timeStr
    ? new Date(`${dateStr}T${timeStr}:00`)
    : new Date(`${dateStr}T00:00:00`);
  return d.toISOString();
}

function ordinalSuffix(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

export function formatTrophyText(item: FeedItem): string | null {
  if (item.placement == null) return null;
  let text = `\u{1F3C6} ${ordinalSuffix(item.placement)} place`;
  if (item.totalTeams != null) {
    text += ` (${item.totalTeams} teams)`;
  }
  if (item.achievements.length > 0) {
    text += `. Achievements: ${item.achievements.map((a) => a.label).join(", ")}`;
  }
  return text;
}

export function toRss(items: FeedItem[], baseUrl: string, clubName: string): string {
  const itemsXml = items
    .map((item) => {
      const link = `${baseUrl}/events/${item.id}`;
      const trophy = formatTrophyText(item);
      const desc = [item.description || `${item.type}: ${item.title}`, trophy].filter(Boolean).join("\n");
      return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(link)}</link>
      <description>${xmlEscape(desc)}</description>
      <pubDate>${toRfc822(item.date, item.startTime)}</pubDate>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(clubName)}</title>
    <link>${xmlEscape(baseUrl)}</link>
    <description>Events and results from ${xmlEscape(clubName)}</description>
    <language>de</language>
${itemsXml}
  </channel>
</rss>`;
}

export function toAtom(items: FeedItem[], baseUrl: string, clubName: string): string {
  const entriesXml = items
    .map((item) => {
      const link = `${baseUrl}/events/${item.id}`;
      const trophy = formatTrophyText(item);
      const desc = [item.description || `${item.type}: ${item.title}`, trophy].filter(Boolean).join("\n");
      return `  <entry>
    <title>${xmlEscape(item.title)}</title>
    <link href="${xmlEscape(link)}" />
    <id>${xmlEscape(link)}</id>
    <updated>${toIso(item.date, item.startTime)}</updated>
    <summary>${xmlEscape(desc)}</summary>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xmlEscape(clubName)}</title>
  <link href="${xmlEscape(baseUrl)}" />
  <id>${xmlEscape(baseUrl)}/feeds/atom</id>
  <updated>${items.length > 0 ? toIso(items[0].date, items[0].startTime) : new Date().toISOString()}</updated>
${entriesXml}
</feed>`;
}

function icsDate(dateStr: string, timeStr?: string | null): string {
  if (!timeStr) {
    return `DTSTART;VALUE=DATE:${dateStr.replace(/-/g, "")}`;
  }
  const compact = `${dateStr.replace(/-/g, "")}T${timeStr.replace(/:/g, "")}00`;
  return `DTSTART:${compact}`;
}

function foldLine(line: string): string {
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    result.push(remaining.substring(0, 75));
    remaining = " " + remaining.substring(75);
  }
  result.push(remaining);
  return result.join("\r\n");
}

export function toIcs(items: FeedItem[], clubName: string): string {
  const events = items
    .map((item) => {
      const lines = [
        "BEGIN:VEVENT",
        `UID:event-${item.id}@openkick`,
        icsDate(item.date, item.startTime),
        foldLine(`SUMMARY:${item.title}`),
      ];
      const trophy = formatTrophyText(item);
      if (item.description || trophy) {
        const parts = [item.description, trophy].filter(Boolean).join("\\n");
        lines.push(foldLine(`DESCRIPTION:${parts.replace(/\n/g, "\\n")}`));
      }
      if (item.location) {
        lines.push(foldLine(`LOCATION:${item.location}`));
      }
      lines.push("END:VEVENT");
      return lines.join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${clubName}//OpenKick//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${clubName}`,
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function toActivityPubOutbox(
  items: FeedItem[],
  baseUrl: string,
): {
  "@context": string;
  type: string;
  totalItems: number;
  orderedItems: { type: string; actor: string; published: string; object: { type: string; id: string; content: string; url: string; published: string; attributedTo: string } }[];
} {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "OrderedCollection",
    totalItems: items.length,
    orderedItems: items.map((item) => {
      const trophy = formatTrophyText(item);
      const trophyHtml = trophy ? `<p>${trophy}</p>` : "";
      return {
      type: "Create",
      actor: `${baseUrl}/api/feeds/activitypub/actor`,
      published: toIso(item.date, item.startTime),
      object: {
        type: "Note",
        id: `${baseUrl}/events/${item.id}`,
        content: `<p><strong>${item.title}</strong></p><p>${item.description || item.type}</p>${item.location ? `<p>Location: ${item.location}</p>` : ""}${trophyHtml}`,
        url: `${baseUrl}/events/${item.id}`,
        published: toIso(item.date, item.startTime),
        attributedTo: `${baseUrl}/api/feeds/activitypub/actor`,
      },
    };
    }),
  };
}

export function toActivityPubActor(baseUrl: string, clubName: string) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Organization",
    id: `${baseUrl}/api/feeds/activitypub/actor`,
    name: clubName,
    preferredUsername: "club",
    summary: `Events and results from ${clubName}`,
    url: baseUrl,
    outbox: `${baseUrl}/api/feeds/activitypub/outbox`,
  };
}

export function toAtProtoFeed(
  items: FeedItem[],
  baseUrl: string,
): { feed: { post: string }[] } {
  return {
    feed: items.map((item) => ({
      post: `at://${baseUrl.replace(/^https?:\/\//, "")}/app.bsky.feed.post/event-${item.id}`,
    })),
  };
}

export function toAtProtoDid(baseUrl: string) {
  const host = baseUrl.replace(/^https?:\/\//, "");
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `did:web:${host}`,
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `${baseUrl}/api/feeds/atprotocol`,
      },
    ],
  };
}
