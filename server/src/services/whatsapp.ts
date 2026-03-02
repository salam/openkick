import { getDB } from "../database.js";
import { chatCompletion } from "./llm.js";

function getSetting(key: string, fallback: string): string {
  const db = getDB();
  const result = db.exec(`SELECT value FROM settings WHERE key = '${key}'`);
  return (result[0]?.values[0]?.[0] as string) || fallback;
}

function wahaFetchHeaders(): Record<string, string> {
  const apiKey = getSetting("waha_api_key", process.env.WAHA_API_KEY || "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  return headers;
}

export async function sendMessage(
  phone: string,
  text: string,
): Promise<void> {
  const wahaUrl = getSetting("waha_url", "http://localhost:3008");

  await fetch(`${wahaUrl}/api/sendText`, {
    method: "POST",
    headers: wahaFetchHeaders(),
    body: JSON.stringify({
      chatId: `${phone}@c.us`,
      text: `${text} (by OpenKick)`,
      session: "default",
    }),
  });
}

export async function reactToMessage(
  messageId: string,
  reaction: string,
): Promise<void> {
  const wahaUrl = getSetting("waha_url", "http://localhost:3008");

  await fetch(`${wahaUrl}/api/reaction`, {
    method: "PUT",
    headers: wahaFetchHeaders(),
    body: JSON.stringify({
      messageId,
      reaction,
      session: "default",
    }),
  });
}

export interface ParsedAttendance {
  playerName: string | null;
  status: "attending" | "absent";
  reason: string | null;
}

export interface ParsedIntentEntry {
  intent: "attending" | "absent";
  playerName: string | null;
  date: string | null; // YYYY-MM-DD or null for "next event"
  reason: string | null;
}

export interface ParsedIntent {
  intent: "attending" | "absent" | "unknown";
  playerName: string | null;
  reason: string | null;
  entries?: ParsedIntentEntry[];
}

export async function parseIntent(text: string): Promise<ParsedIntent> {
  const today = new Date().toISOString().slice(0, 10);
  const response = await chatCompletion([
    {
      role: "system",
      content: `You are a football team attendance bot. Parse the parent's message about their child's attendance.
Today is ${today}.

The message may mention one or MULTIPLE dates. Return JSON with an "entries" array.
Each entry: { "intent": "attending"|"absent", "playerName": string|null, "date": "YYYY-MM-DD"|null, "reason": string|null }

Rules:
- If specific dates are mentioned (e.g. "am 11. März", "nächsten Mittwoch"), resolve them to YYYY-MM-DD format.
- If no date is mentioned, set date to null (means "next event").
- If the message covers multiple dates, return one entry per date.
- If the message mentions multiple children by name (e.g. "Ava ist krank am 11. März. Marlo nimmt am 18. März teil."), return one entry per child+date combination with the correct playerName for each.
- If the message is unrelated to attendance, return: { "entries": [] }

Return JSON only: { "entries": [...] }`,
    },
    { role: "user", content: text },
  ]);
  try {
    const parsed = JSON.parse(response.content);
    const entries: ParsedIntentEntry[] = Array.isArray(parsed.entries) ? parsed.entries : [];

    if (entries.length === 0) {
      return { intent: "unknown", playerName: null, reason: null, entries: [] };
    }

    // Backwards-compatible: top-level fields from first entry
    return {
      intent: entries[0].intent,
      playerName: entries[0].playerName,
      reason: entries[0].reason,
      entries,
    };
  } catch {
    return { intent: "unknown", playerName: null, reason: null, entries: [] };
  }
}

export async function parseAttendanceMessage(
  text: string,
): Promise<ParsedAttendance> {
  const response = await chatCompletion([
    {
      role: "system",
      content: `You parse WhatsApp messages from parents about their child's training attendance.
Extract: playerName (if mentioned), status (attending or absent), reason (if given).
Reply with JSON only: {"playerName": "...", "status": "attending|absent", "reason": "..."}`,
    },
    { role: "user", content: text },
  ]);
  return JSON.parse(response.content);
}
