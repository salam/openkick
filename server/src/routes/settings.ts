import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDB } from "../database.js";
import { sendEmail } from "../services/email.js";

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
settingsRouter.post("/settings/upload-logo", (req: Request, res: Response) => {
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

  const publicPath = `/uploads/${savedName}`;
  const db = getDB();
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["club_logo", publicPath]);

  res.json({ key: "club_logo", value: publicPath });
});

// DELETE /api/settings/remove-logo — delete the uploaded club logo
settingsRouter.delete("/settings/remove-logo", (_req: Request, res: Response) => {
  const db = getDB();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("club_logo") as { value: string } | undefined;

  if (row?.value) {
    const filePath = path.resolve(__dirname, "../../../public", row.value.replace(/^\//, ""));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  db.run("DELETE FROM settings WHERE key = ?", ["club_logo"]);
  res.json({ key: "club_logo", value: "" });
});

// POST /api/settings/test-smtp — send a test email to verify SMTP config
settingsRouter.post("/settings/test-smtp", async (req: Request, res: Response) => {
  const { to } = req.body;
  if (!to) {
    res.status(400).json({ success: false, message: "to address is required" });
    return;
  }
  try {
    await sendEmail(to, "OpenKick SMTP Test", "<p>SMTP configuration is working.</p>");
    res.json({ success: true, message: "Test email sent successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, message });
  }
});
