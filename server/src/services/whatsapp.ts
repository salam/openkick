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
      text,
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

export interface ParsedIntent {
  intent: "attending" | "absent" | "unknown";
  playerName: string | null;
  reason: string | null;
}

export async function parseIntent(text: string): Promise<ParsedIntent> {
  const response = await chatCompletion([
    {
      role: "system",
      content: `You are a football team attendance bot. Classify the parent's message.
Return JSON only: { "intent": "attending"|"absent"|"unknown", "playerName": string|null, "reason": string|null }
- "attending": the parent confirms their child will attend
- "absent": the parent reports their child cannot attend
- "unknown": the message is unrelated to attendance
Extract the child's name if mentioned. Extract the reason if given.`,
    },
    { role: "user", content: text },
  ]);
  try {
    return JSON.parse(response.content);
  } catch {
    return { intent: "unknown", playerName: null, reason: null };
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
