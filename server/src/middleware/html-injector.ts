import { type Request, type Response, type NextFunction } from "express";
import { getDB } from "../database.js";

interface ClubSettings {
  club_name: string;
  club_description: string;
  club_logo: string;
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_title: string;
  twitter_description: string;
  twitter_handle: string;
  meta_keywords: string;
}

function getSettings(): ClubSettings {
  const db = getDB();
  const result = db.exec("SELECT key, value FROM settings");
  const all: Record<string, string> = {};
  if (result.length > 0) {
    for (const [key, value] of result[0].values) {
      all[key as string] = value as string;
    }
  }
  return {
    club_name: all.club_name || "OpenKick",
    club_description: all.club_description || "Youth Football Management",
    club_logo: all.club_logo || "",
    og_title: all.og_title || "",
    og_description: all.og_description || "",
    og_image: all.og_image || "",
    twitter_title: all.twitter_title || "",
    twitter_description: all.twitter_description || "",
    twitter_handle: all.twitter_handle || "",
    meta_keywords: all.meta_keywords || "",
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildInjection(s: ClubSettings, baseUrl: string): string {
  const title = s.og_title || s.club_name;
  const description = s.og_description || s.club_description;
  const image = s.og_image || (s.club_logo ? `${baseUrl}${s.club_logo}` : "");
  const twitterTitle = s.twitter_title || title;
  const twitterDesc = s.twitter_description || description;

  const parts: string[] = [];

  // Favicon links
  parts.push(`<link rel="icon" href="${baseUrl}/uploads/favicon.ico">`);
  parts.push(
    `<link rel="icon" type="image/png" sizes="16x16" href="${baseUrl}/uploads/favicon-16x16.png">`,
  );
  parts.push(
    `<link rel="icon" type="image/png" sizes="32x32" href="${baseUrl}/uploads/favicon-32x32.png">`,
  );
  parts.push(
    `<link rel="apple-touch-icon" sizes="180x180" href="${baseUrl}/uploads/apple-touch-icon.png">`,
  );
  parts.push(`<link rel="manifest" href="${baseUrl}/uploads/site.webmanifest">`);

  // Meta tags
  parts.push(`<meta name="description" content="${esc(description)}">`);
  if (s.meta_keywords)
    parts.push(`<meta name="keywords" content="${esc(s.meta_keywords)}">`);

  // Open Graph
  parts.push(`<meta property="og:title" content="${esc(title)}">`);
  parts.push(`<meta property="og:description" content="${esc(description)}">`);
  parts.push(`<meta property="og:type" content="website">`);
  if (image)
    parts.push(`<meta property="og:image" content="${esc(image)}">`);

  // Twitter Card
  parts.push(
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
  );
  parts.push(`<meta name="twitter:title" content="${esc(twitterTitle)}">`);
  parts.push(`<meta name="twitter:description" content="${esc(twitterDesc)}">`);
  if (image)
    parts.push(`<meta name="twitter:image" content="${esc(image)}">`);
  if (s.twitter_handle)
    parts.push(`<meta name="twitter:site" content="${esc(s.twitter_handle)}">`);

  // Settings script for React
  const safeJson = JSON.stringify(s).replace(/</g, "\\u003c");
  parts.push(`<script>window.__CLUB_SETTINGS__=${safeJson}</script>`);

  return parts.join("\n");
}

export function htmlInjector(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalSend = res.send.bind(res);

  res.send = function (body: any) {
    const contentType = res.get("Content-Type") || "";
    if (typeof body === "string" && contentType.includes("text/html")) {
      const settings = getSettings();
      const baseUrl = `${req.protocol}://${req.get("host") || "localhost"}`;
      const injection = buildInjection(settings, baseUrl);

      // Replace <title> with dynamic title
      const title = settings.og_title || settings.club_name;
      const fullTitle = `${title} - ${settings.club_description || "Youth Football Management"}`;
      body = body.replace(
        /<title>[^<]*<\/title>/,
        `<title>${esc(fullTitle)}</title>`,
      );

      // Inject before </head>
      body = body.replace("</head>", `${injection}\n</head>`);
    }
    return originalSend(body);
  } as any;

  next();
}
