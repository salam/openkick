import { type Request, type Response, type NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDB } from "../database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = path.resolve(__dirname, "../../../public");

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
  parts.push(`<link rel="icon" href="/uploads/favicon.ico">`);
  parts.push(
    `<link rel="icon" type="image/png" sizes="16x16" href="/uploads/favicon-16x16.png">`,
  );
  parts.push(
    `<link rel="icon" type="image/png" sizes="32x32" href="/uploads/favicon-32x32.png">`,
  );
  parts.push(
    `<link rel="apple-touch-icon" sizes="180x180" href="/uploads/apple-touch-icon.png">`,
  );
  parts.push(`<link rel="manifest" href="/uploads/site.webmanifest">`);

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

/**
 * Creates middleware that intercepts requests for HTML files, reads them from
 * disk, injects club settings / meta tags / favicons into <head>, and serves
 * the modified HTML. Non-HTML requests pass through to the next middleware.
 */
export function createHtmlInjector(publicDir?: string) {
  const dir = publicDir || DEFAULT_PUBLIC_DIR;

  return function htmlInjector(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Only handle GET/HEAD for potential HTML pages
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    // Skip API and known non-HTML paths
    if (req.path.startsWith("/api") || req.path.startsWith("/mcp")) {
      next();
      return;
    }

    // Resolve the file path on disk
    const urlPath = req.path.endsWith("/") ? req.path + "index.html" : req.path;

    // Try exact path first, then with .html extension, then as directory/index.html
    const candidates = [
      path.join(dir, urlPath),
      path.join(dir, urlPath + ".html"),
      path.join(dir, urlPath, "index.html"),
    ];

    const found = candidates.find(
      (c) => c.endsWith(".html") && fs.existsSync(c) && fs.statSync(c).isFile(),
    );

    if (!found) {
      next();
      return;
    }

    try {
      let html = fs.readFileSync(found, "utf-8");
      const settings = getSettings();
      const baseUrl = `${req.protocol}://${req.get("host") || "localhost"}`;
      const injection = buildInjection(settings, baseUrl);

      // Replace <title>
      const title = settings.og_title || settings.club_name;
      const fullTitle = `${title} - ${settings.club_description || "Youth Football Management"}`;
      html = html.replace(
        /<title>[^<]*<\/title>/,
        `<title>${esc(fullTitle)}</title>`,
      );

      // Inject before </head>
      html = html.replace("</head>", `${injection}\n</head>`);

      res.type("html").send(html);
    } catch {
      next();
    }
  };
}

/** Default middleware using the standard public directory */
export const htmlInjector = createHtmlInjector();
