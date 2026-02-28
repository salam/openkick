import { getDB } from "../database.js";

export interface WhatsAppSession {
  id: number;
  phone: string;
  state: string;
  context: string; // JSON string
  wahaMessageId: string | null;
  updatedAt: string;
}

export type SessionState =
  | "idle"
  | "onboarding_name"
  | "onboarding_child"
  | "onboarding_birthyear"
  | "onboarding_consent"
  | "disambiguating_child";

export function getOrCreateSession(phone: string): WhatsAppSession {
  const db = getDB();
  const rows = db.exec("SELECT * FROM whatsapp_sessions WHERE phone = ?", [phone]);
  if (rows.length > 0 && rows[0].values.length > 0) {
    const cols = rows[0].columns;
    const vals = rows[0].values[0];
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = vals[i]));
    return obj as unknown as WhatsAppSession;
  }
  db.run("INSERT INTO whatsapp_sessions (phone, state, context) VALUES (?, 'idle', '{}')", [phone]);
  return getOrCreateSession(phone);
}

export function updateSessionState(
  phone: string,
  state: SessionState,
  context: Record<string, unknown>,
): void {
  const db = getDB();
  db.run(
    "UPDATE whatsapp_sessions SET state = ?, context = ?, updatedAt = datetime('now') WHERE phone = ?",
    [state, JSON.stringify(context), phone],
  );
}

export function resetSession(phone: string): void {
  updateSessionState(phone, "idle", {});
}

export function isDuplicate(wahaMessageId: string): boolean {
  const db = getDB();
  const rows = db.exec("SELECT id FROM message_log WHERE wahaMessageId = ?", [wahaMessageId]);
  return rows.length > 0 && rows[0].values.length > 0;
}

export function logMessage(
  wahaMessageId: string,
  phone: string,
  direction: "in" | "out",
  body: string,
  intent?: string,
): void {
  const db = getDB();
  db.run(
    "INSERT OR IGNORE INTO message_log (wahaMessageId, phone, direction, body, intent) VALUES (?, ?, ?, ?, ?)",
    [wahaMessageId, phone, direction, body, intent ?? null],
  );
}
