import initSqlJs, { type Database } from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { CHECKLIST_TEMPLATE_SEEDS } from "./data/checklist-templates.js";

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
  lastNameInitial TEXT,
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

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  eventId INTEGER,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId INTEGER NOT NULL UNIQUE,
  lastAlertType TEXT,
  lastAlertAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_results_url (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  crawlIntervalMin INTEGER NOT NULL DEFAULT 10,
  lastCrawledAt TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tournamentId, url)
);

CREATE TABLE IF NOT EXISTS live_ticker_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  matchLabel TEXT,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  score TEXT,
  matchTime TEXT,
  source TEXT NOT NULL DEFAULT 'crawl',
  crawledAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tournamentId, homeTeam, awayTeam, matchLabel)
);

CREATE TABLE IF NOT EXISTS game_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER REFERENCES events(id),
  tournamentName TEXT NOT NULL,
  teamName TEXT,
  date TEXT NOT NULL,
  placeRanking INTEGER,
  isTrophy INTEGER NOT NULL DEFAULT 0,
  trophyType TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_history_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historyId INTEGER NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
  playerInitial TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_history_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historyId INTEGER NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
  matchLabel TEXT,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  score TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'idle',
  context TEXT DEFAULT '{}',
  wahaMessageId TEXT,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wahaMessageId TEXT UNIQUE,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'in',
  body TEXT,
  intent TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rsvp_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  playerId INTEGER NOT NULL REFERENCES players(id),
  eventId INTEGER NOT NULL REFERENCES events(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  expiresAt TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardianId INTEGER NOT NULL REFERENCES guardians(id),
  type TEXT NOT NULL CHECK(type IN ('export', 'deletion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
  reason TEXT,
  adminNote TEXT,
  processedBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  processedAt TEXT,
  completedAt TEXT,
  resultPath TEXT
);

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  team_id INTEGER,
  anonymous INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  deadline TEXT,
  price_per_item REAL,
  created_by INTEGER REFERENCES guardians(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  options_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  player_nickname TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  value TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_response_player
  ON survey_responses(survey_id, player_nickname)
  WHERE player_nickname IS NOT NULL;

CREATE TABLE IF NOT EXISTS club_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL DEFAULT 1,
  classification TEXT NOT NULL CHECK (classification IN ('sportamt_zurich','sfv','fvrz','custom')),
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (club_id, classification)
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('admin','training','tournament')),
  classification_filter TEXT,
  items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES checklist_templates(id),
  event_id INTEGER REFERENCES events(id),
  semester TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  completed_by INTEGER REFERENCES guardians(id),
  is_custom INTEGER NOT NULL DEFAULT 0,
  UNIQUE (instance_id, label)
);

CREATE INDEX IF NOT EXISTS idx_checklist_instances_event ON checklist_instances(event_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_semester ON checklist_instances(semester);
CREATE INDEX IF NOT EXISTS idx_checklist_items_instance ON checklist_items(instance_id);

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
  // SEO & Social Media
  og_title: "",
  og_description: "",
  og_image: "",
  twitter_title: "",
  twitter_description: "",
  twitter_handle: "",
  meta_keywords: "",
  // Security contact
  security_contact_email: "",
  security_contact_url: "",
  security_pgp_key_url: "",
  security_policy_url: "",
  security_acknowledgments_url: "",
  security_preferred_languages: "en, de",
  security_canonical_url: "",
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
  if (!cols.includes('consentGivenAt')) {
    db.run("ALTER TABLE guardians ADD COLUMN consentGivenAt TEXT");
  }
  if (!cols.includes('consentWithdrawnAt')) {
    db.run("ALTER TABLE guardians ADD COLUMN consentWithdrawnAt TEXT");
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

  // Migrate: add lastNameInitial to players if absent
  const playerCols = db.exec("PRAGMA table_info(players)")[0]?.values.map(r => r[1]) ?? [];
  if (!playerCols.includes('lastNameInitial')) {
    try { db.run('ALTER TABLE players ADD COLUMN lastNameInitial TEXT'); } catch {}
  }

  // Migrate: add new columns to game_history if absent
  const ghCols = db.exec("PRAGMA table_info(game_history)")[0]?.values.map(r => r[1]) ?? [];
  if (!ghCols.includes('tournamentId')) {
    try { db.run('ALTER TABLE game_history ADD COLUMN tournamentId INTEGER REFERENCES events(id)'); } catch {}
  }
  if (!ghCols.includes('teamName')) {
    try { db.run('ALTER TABLE game_history ADD COLUMN teamName TEXT'); } catch {}
  }
  if (!ghCols.includes('placeRanking')) {
    try { db.run('ALTER TABLE game_history ADD COLUMN placeRanking INTEGER'); } catch {}
  }
  if (!ghCols.includes('isTrophy')) {
    try { db.run('ALTER TABLE game_history ADD COLUMN isTrophy INTEGER NOT NULL DEFAULT 0'); } catch {}
  }
  if (!ghCols.includes('trophyType')) {
    try { db.run('ALTER TABLE game_history ADD COLUMN trophyType TEXT'); } catch {}
  }
  if (!ghCols.includes('notes')) {
    try { db.run('ALTER TABLE game_history ADD COLUMN notes TEXT'); } catch {}
  }

  // Migrate: add matchLabel to game_history_matches if absent
  const ghmCols = db.exec("PRAGMA table_info(game_history_matches)")[0]?.values.map(r => r[1]) ?? [];
  if (!ghmCols.includes('matchLabel')) {
    try { db.run('ALTER TABLE game_history_matches ADD COLUMN matchLabel TEXT'); } catch {}
  }

  // Seed default settings (INSERT OR IGNORE to avoid duplicates)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }

  // Seed checklist templates if empty
  const templateCount = db.exec("SELECT COUNT(*) FROM checklist_templates");
  if ((templateCount[0]?.values[0]?.[0] as number) === 0) {
    for (const seed of CHECKLIST_TEMPLATE_SEEDS) {
      db.run(
        "INSERT INTO checklist_templates (type, classification_filter, items_json) VALUES (?, ?, ?)",
        [seed.type, seed.classificationFilter, JSON.stringify(seed.items)]
      );
    }
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
