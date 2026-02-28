import initSqlJs, { type Database } from "sql.js";
import fs from "node:fs";
import path from "node:path";

let _db: Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  yearOfBirth INTEGER,
  category TEXT,
  position TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guardians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  passwordHash TEXT,
  role TEXT NOT NULL DEFAULT 'parent',
  language TEXT NOT NULL DEFAULT 'de',
  consentGiven INTEGER NOT NULL DEFAULT 0,
  accessToken TEXT,
  resetToken TEXT,
  resetTokenExpiry TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guardian_players (
  guardianId INTEGER NOT NULL REFERENCES guardians(id),
  playerId INTEGER NOT NULL REFERENCES players(id),
  PRIMARY KEY (guardianId, playerId)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  startTime TEXT,
  attendanceTime TEXT,
  deadline TEXT,
  maxParticipants INTEGER,
  minParticipants INTEGER,
  location TEXT,
  categoryRequirement TEXT,
  attachmentPath TEXT,
  sourceUrl TEXT,
  recurring INTEGER NOT NULL DEFAULT 0,
  recurrenceRule TEXT,
  createdBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId INTEGER NOT NULL REFERENCES events(id),
  playerId INTEGER NOT NULL REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'unknown',
  reason TEXT,
  respondedAt TEXT,
  source TEXT NOT NULL DEFAULT 'web'
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId INTEGER NOT NULL REFERENCES events(id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_players (
  teamId INTEGER NOT NULL REFERENCES teams(id),
  playerId INTEGER NOT NULL REFERENCES players(id),
  PRIMARY KEY (teamId, playerId)
);

CREATE TABLE IF NOT EXISTS vacation_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dayOfWeek INTEGER NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  location TEXT,
  categoryFilter TEXT,
  validFrom TEXT,
  validTo TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  templateKey TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduledFor TEXT,
  sentAt TEXT,
  createdBy INTEGER REFERENCES guardians(id)
);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  llm_provider: "openai",
  bot_language: "de",
  waha_url: "http://localhost:3008",
};

export async function initDB(dbPath?: string): Promise<Database> {
  const SQL = await initSqlJs();

  let db: Database;

  if (dbPath && fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  // Create all tables
  db.run(SCHEMA);

  // Migrate existing databases: add columns if absent
  const cols = db.exec("PRAGMA table_info(guardians)")[0]?.values.map(r => r[1]) ?? [];
  if (!cols.includes('resetToken')) {
    db.run("ALTER TABLE guardians ADD COLUMN resetToken TEXT");
  }
  if (!cols.includes('resetTokenExpiry')) {
    db.run("ALTER TABLE guardians ADD COLUMN resetTokenExpiry TEXT");
  }

  // Seed default settings (INSERT OR IGNORE to avoid duplicates)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }

  _db = db;
  return db;
}

export function saveDB(db: Database, dbPath: string): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, buffer);
}

export function getDB(): Database {
  if (!_db) {
    throw new Error("Database not initialized. Call initDB() first.");
  }
  return _db;
}
