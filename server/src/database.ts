import initSqlJs, { type Database } from "sql.js";
import fs from "node:fs";
import path from "node:path";

let _db: Database | null = null;
let _dbPath: string | undefined;
let _lastInsertRowId = 0;

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

CREATE TABLE IF NOT EXISTS event_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  startTime TEXT,
  attendanceTime TEXT,
  location TEXT,
  categoryRequirement TEXT,
  maxParticipants INTEGER,
  minParticipants INTEGER,
  recurrenceDay INTEGER NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  customDates TEXT,
  excludedDates TEXT,
  deadlineOffsetHours INTEGER,
  createdBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
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
  seriesId INTEGER REFERENCES event_series(id),
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
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, startDate, endDate, source)
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

CREATE TABLE IF NOT EXISTS tournament_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  placement INTEGER,
  totalTeams INTEGER,
  summary TEXT,
  resultsUrl TEXT,
  achievements TEXT DEFAULT '[]',
  createdBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  llm_provider: "openai",
  bot_language: "de",
  waha_url: "http://localhost:3008",
  feeds_enabled: "true",
  feed_rss_enabled: "true",
  feed_atom_enabled: "true",
  feed_activitypub_enabled: "true",
  feed_atprotocol_enabled: "true",
  feed_ics_enabled: "true",
  feed_sitemap_enabled: "true",
  club_name: "My Club",
  club_description: "A youth football club.",
  contact_info: "",
  club_logo: "",
  onboarding_completed: "false",
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

  // Migrate: add seriesId to events if absent
  const eventCols = db.exec("PRAGMA table_info(events)")[0]?.values.map(r => r[1]) ?? [];
  if (!eventCols.includes('seriesId')) {
    db.run("ALTER TABLE events ADD COLUMN seriesId INTEGER REFERENCES event_series(id)");
  }

  // Migrate: add teamName to events if absent
  if (!eventCols.includes('teamName')) {
    db.run("ALTER TABLE events ADD COLUMN teamName TEXT");
  }

  // Seed default settings (INSERT OR IGNORE to avoid duplicates)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }

  _dbPath = dbPath;

  // Auto-persist: wrap db.run so every mutation is saved to disk.
  // db.export() (called by saveDB) resets last_insert_rowid() to 0 in
  // sql.js, so we capture it before saving and expose via getLastInsertId().
  if (dbPath) {
    const originalRun = db.run.bind(db);
    db.run = (...args: Parameters<typeof db.run>) => {
      const result = originalRun(...args);
      const rowIdResult = db.exec("SELECT last_insert_rowid()");
      _lastInsertRowId =
        (rowIdResult[0]?.values[0]?.[0] as number) ?? 0;
      saveDB(db, dbPath);
      return result;
    };
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

/**
 * Return the rowid from the most recent INSERT executed via db.run().
 * Use this instead of SELECT last_insert_rowid() — db.export() in the
 * auto-persist wrapper resets that SQLite function to 0.
 */
export function getLastInsertId(): number {
  if (_lastInsertRowId !== 0) return _lastInsertRowId;
  if (!_db) return 0;
  const result = _db.exec("SELECT last_insert_rowid()");
  return (result[0]?.values[0]?.[0] as number) ?? 0;
}
