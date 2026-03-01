import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";
import { invalidateHomepageStatsCache } from "../services/statistics.service.js";
import { sendEmail, buildTestEmail } from "../services/email.js";
import { chatCompletion } from "../services/llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const settingsRouter = Router();

// GET /api/settings — return all settings as { key: value } object
settingsRouter.get("/settings", (_req: Request, res: Response) => {
  const db = getDB();
  const result = db.exec("SELECT key, value FROM settings ORDER BY key");

  const settings: Record<string, string> = {};
  if (result.length > 0) {
    const { values } = result[0];
    for (const [key, value] of values) {
      settings[key as string] = value as string;
    }
  }

  res.json(settings);
});

// GET /api/settings/:key — return single setting
settingsRouter.get("/settings/:key", (req: Request, res: Response) => {
  const db = getDB();
  const { key } = req.params;

  const result = db.exec("SELECT key, value FROM settings WHERE key = ?", [key as string]);
  if (result.length === 0 || result[0].values.length === 0) {
    res.status(404).json({ error: "Setting not found" });
    return;
  }

  const [k, v] = result[0].values[0];
  res.json({ key: k, value: v });
});

// PUT /api/settings/:key — create or update a setting
settingsRouter.put("/settings/:key", (req: Request, res: Response) => {
  const db = getDB();
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined || value === null) {
    res.status(400).json({ error: "value is required" });
    return;
  }

  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key as string, String(value)]);

  res.json({ key, value: String(value) });
});

// POST /api/settings/upload-logo — accept base64-encoded image, save to public/uploads/
settingsRouter.post("/settings/upload-logo", async (req: Request, res: Response) => {
  const { data, filename } = req.body;

  if (!data || !filename) {
    res.status(400).json({ error: "data and filename are required" });
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  const allowedExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
  if (!allowedExts.includes(ext)) {
    res.status(400).json({ error: "Invalid file type. Allowed: png, jpg, jpeg, gif, svg, webp" });
    return;
  }

  const buffer = Buffer.from(data, "base64");
  if (buffer.length > 10 * 1024 * 1024) {
    res.status(400).json({ error: "File too large. Maximum 10MB." });
    return;
  }

  const uploadDir = path.resolve(__dirname, "../../../public/uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const savedName = `club-logo${ext}`;
  fs.writeFileSync(path.join(uploadDir, savedName), buffer);

  // Generate favicon variants from the uploaded logo
  try {
    const logoBuffer = fs.readFileSync(path.join(uploadDir, savedName));
    const sharpInput = sharp(logoBuffer);

    await Promise.all([
      sharpInput.clone().resize(16, 16).png().toFile(path.join(uploadDir, "favicon-16x16.png")),
      sharpInput.clone().resize(32, 32).png().toFile(path.join(uploadDir, "favicon-32x32.png")),
      sharpInput.clone().resize(180, 180).png().toFile(path.join(uploadDir, "apple-touch-icon.png")),
      sharpInput.clone().resize(192, 192).png().toFile(path.join(uploadDir, "android-chrome-192x192.png")),
      sharpInput.clone().resize(512, 512).png().toFile(path.join(uploadDir, "android-chrome-512x512.png")),
    ]);

    const icoBuffer = await pngToIco(path.join(uploadDir, "favicon-32x32.png"));
    fs.writeFileSync(path.join(uploadDir, "favicon.ico"), icoBuffer);

    const manifest = {
      name: "",
      short_name: "",
      icons: [
        { src: "/uploads/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/uploads/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: "#10b981",
      background_color: "#ffffff",
      display: "standalone",
    };
    fs.writeFileSync(path.join(uploadDir, "site.webmanifest"), JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error("Favicon generation failed:", err);
  }

  const publicPath = `/uploads/${savedName}`;
  const db = getDB();
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["club_logo", publicPath]);

  res.json({ key: "club_logo", value: publicPath });
});

// DELETE /api/settings/remove-logo — delete the uploaded club logo
settingsRouter.delete("/settings/remove-logo", (_req: Request, res: Response) => {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", ["club_logo"]);
  const row = result.length > 0 && result[0].values.length > 0
    ? { value: result[0].values[0][0] as string }
    : undefined;

  if (row?.value) {
    const filePath = path.resolve(__dirname, "../../../public", row.value.replace(/^\//, ""));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Clean up favicon variants
  for (const f of [
    "favicon.ico", "favicon-16x16.png", "favicon-32x32.png",
    "apple-touch-icon.png", "android-chrome-192x192.png",
    "android-chrome-512x512.png", "site.webmanifest",
  ]) {
    const fp = path.join(path.resolve(__dirname, "../../../public/uploads"), f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  db.run("DELETE FROM settings WHERE key = ?", ["club_logo"]);
  res.json({ key: "club_logo", value: "" });
});

// POST /api/settings/upload-bg — accept base64-encoded background image
settingsRouter.post("/settings/upload-bg", async (req: Request, res: Response) => {
  const { data, filename } = req.body;
  if (!data || !filename) {
    res.status(400).json({ error: "data and filename are required" });
    return;
  }
  const ext = path.extname(filename).toLowerCase();
  const allowedExts = [".png", ".jpg", ".jpeg", ".webp"];
  if (!allowedExts.includes(ext)) {
    res.status(400).json({ error: "Invalid file type. Allowed: png, jpg, jpeg, webp" });
    return;
  }
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > 10 * 1024 * 1024) {
    res.status(400).json({ error: "File too large. Maximum 10MB." });
    return;
  }
  const uploadDir = path.resolve(__dirname, "../../../public/uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const savedName = `hero-bg${ext}`;
  fs.writeFileSync(path.join(uploadDir, savedName), buffer);
  const publicPath = `/uploads/${savedName}`;
  const db = getDB();
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["homepage_bg_image", publicPath]);
  res.json({ key: "homepage_bg_image", value: publicPath });
});

// DELETE /api/settings/remove-bg — delete the uploaded background image
settingsRouter.delete("/settings/remove-bg", (_req: Request, res: Response) => {
  const db = getDB();
  const bgResult = db.exec("SELECT value FROM settings WHERE key = ?", ["homepage_bg_image"]);
  const row = bgResult.length > 0 && bgResult[0].values.length > 0
    ? { value: bgResult[0].values[0][0] as string }
    : undefined;
  if (row?.value) {
    const filePath = path.resolve(__dirname, "../../../public", row.value.replace(/^\//, ""));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.run("DELETE FROM settings WHERE key = ?", ["homepage_bg_image"]);
  res.json({ key: "homepage_bg_image", value: "" });
});

// POST /api/settings/test-llm — verify LLM API key and model work
settingsRouter.post("/settings/test-llm", async (_req: Request, res: Response) => {
  try {
    const result = await chatCompletion([
      { role: "user", content: "Reply with exactly: OK" },
    ]);
    res.json({ success: true, message: `Connected to ${result.model}.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.json({ success: false, message });
  }
});

// POST /api/settings/test-smtp — send a test email to verify SMTP config
settingsRouter.post("/settings/test-smtp", async (req: Request, res: Response) => {
  const { to } = req.body;
  if (!to) {
    res.status(400).json({ success: false, message: "to address is required" });
    return;
  }
  try {
    const db = getDB();
    const clubRow = db.exec("SELECT value FROM settings WHERE key = 'club_name'");
    const clubName = (clubRow[0]?.values[0]?.[0] as string) || "OpenKick";
    const langRow = db.exec("SELECT value FROM settings WHERE key = 'bot_language'");
    const lang = (langRow[0]?.values[0]?.[0] as string) || "de";

    const { subject, html } = buildTestEmail(clubName, lang);
    await sendEmail(to, subject, html);
    res.json({ success: true, message: "Test email sent successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, message });
  }
});

// GET /api/admin/settings/homepage-stats
settingsRouter.get(
  "/admin/settings/homepage-stats",
  authMiddleware,
  requireRole("admin"),
  (_req: Request, res: Response) => {
    const db = getDB();
    const defaults = { lifetimeAthletes: true, activeAthletes: true, tournamentsPlayed: true, trophiesWon: true, trainingSessionsThisSeason: true, activeCoaches: true };
    const row = db.exec("SELECT value FROM settings WHERE key = 'homepage_stats_settings'");
    const settings = row.length > 0 && row[0].values.length > 0
      ? JSON.parse(row[0].values[0][0] as string)
      : defaults;
    res.json(settings);
  },
);

// PUT /api/admin/settings/homepage-stats
settingsRouter.put(
  "/admin/settings/homepage-stats",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const db = getDB();
    const defaults = { lifetimeAthletes: true, activeAthletes: true, tournamentsPlayed: true, trophiesWon: true, trainingSessionsThisSeason: true, activeCoaches: true };
    const row = db.exec("SELECT value FROM settings WHERE key = 'homepage_stats_settings'");
    const current = row.length > 0 && row[0].values.length > 0
      ? JSON.parse(row[0].values[0][0] as string)
      : defaults;

    const merged = { ...current, ...req.body };
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "homepage_stats_settings",
      JSON.stringify(merged),
    ]);

    invalidateHomepageStatsCache();
    res.json(merged);
  },
);
