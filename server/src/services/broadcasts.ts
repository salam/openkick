import { chatCompletion } from "./llm.js";
import { sendMessage } from "./whatsapp.js";
import { getDB } from "../database.js";

export async function composeTrainingHeadsup(
  event: { title: string; date: string; startTime: string; location: string },
  weather: { temperature: number; description: string },
): Promise<string> {
  const response = await chatCompletion([
    {
      role: "system",
      content:
        "Compose a short, friendly WhatsApp message (in German) about tomorrow's training. Include time, place, and weather. Keep it under 200 characters.",
    },
    {
      role: "user",
      content: `Training: ${event.title}, ${event.date} um ${event.startTime}, ${event.location}. Wetter: ${weather.temperature}°C, ${weather.description}`,
    },
  ]);
  return response.content;
}

export async function composeRainAlert(event: {
  title: string;
  date: string;
  startTime: string;
}): Promise<string> {
  const response = await chatCompletion([
    {
      role: "system",
      content:
        "Compose a short, friendly WhatsApp message (in German) informing parents that training is cancelled due to rain. Include the event name and time. Keep it under 200 characters.",
    },
    {
      role: "user",
      content: `Training abgesagt wegen Regen: ${event.title}, ${event.date} um ${event.startTime}`,
    },
  ]);
  return response.content;
}

export async function composeHolidayAnnouncement(
  name: string,
  startDate: string,
  endDate: string,
): Promise<string> {
  const response = await chatCompletion([
    {
      role: "system",
      content:
        "Compose a short, friendly WhatsApp message (in German) announcing a holiday break with no training. Include the vacation name and dates. Keep it under 200 characters.",
    },
    {
      role: "user",
      content: `Ferien: ${name}, von ${startDate} bis ${endDate}. Kein Training in dieser Zeit.`,
    },
  ]);
  return response.content;
}

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

export async function sendBroadcast(
  broadcastId: number,
): Promise<{ sent: number }> {
  const db = getDB();

  // 1. Load broadcast from DB
  const broadcastRows = rowsToObjects(
    db.exec("SELECT * FROM broadcasts WHERE id = ?", [broadcastId]),
  );
  if (broadcastRows.length === 0) {
    throw new Error("Broadcast not found");
  }

  const broadcast = broadcastRows[0];
  const message = broadcast.message as string | null;
  if (!message) {
    throw new Error("Broadcast has no message");
  }

  // 2. Load all guardians
  const guardianRows = rowsToObjects(
    db.exec("SELECT phone FROM guardians"),
  );

  // 3. Send message to each guardian via sendMessage
  let sent = 0;
  for (const guardian of guardianRows) {
    const phone = guardian.phone as string;
    await sendMessage(phone, message);
    sent++;
  }

  // 4. Update broadcast status to 'sent', set sentAt
  db.run(
    "UPDATE broadcasts SET status = 'sent', sentAt = datetime('now') WHERE id = ?",
    [broadcastId],
  );

  return { sent };
}
