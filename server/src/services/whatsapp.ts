import { getDB } from "../database.js";
import { chatCompletion } from "./llm.js";

export async function sendMessage(
  phone: string,
  text: string,
): Promise<void> {
  const db = getDB();
  const result = db.exec(
    "SELECT value FROM settings WHERE key = 'waha_url'",
  );
  const wahaUrl =
    (result[0]?.values[0]?.[0] as string) || "http://localhost:3008";

  await fetch(`${wahaUrl}/api/sendText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: `${phone}@c.us`,
      text,
      session: "default",
    }),
  });
}

export interface ParsedAttendance {
  playerName: string | null;
  status: "attending" | "absent";
  reason: string | null;
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
