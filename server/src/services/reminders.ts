import { getDB } from "../database.js";
import { sendMessage } from "./whatsapp.js";
import { t } from "../utils/i18n.js";

interface PendingReminder {
  eventId: number;
  eventTitle: string;
  eventDate: string;
  guardianPhone: string;
  guardianLanguage: string;
  guardianAccessToken: string | null;
  playerName: string;
}

export function findPendingReminders(): PendingReminder[] {
  const db = getDB();

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const result = db.exec(
    `SELECT
       e.id AS eventId,
       e.title AS eventTitle,
       e.date AS eventDate,
       g.phone AS guardianPhone,
       g.language AS guardianLanguage,
       g.accessToken AS guardianAccessToken,
       p.name AS playerName
     FROM events e
     JOIN players p
     JOIN guardian_players gp ON gp.playerId = p.id
     JOIN guardians g ON g.id = gp.guardianId
     LEFT JOIN attendance a ON a.eventId = e.id AND a.playerId = p.id
     WHERE e.deadline >= ?
       AND e.deadline <= ?
       AND a.id IS NULL`,
    [now, in24h],
  );

  if (result.length === 0) return [];

  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as unknown as PendingReminder;
  });
}

function getBaseUrl(): string {
  return process.env.BASE_URL ?? "http://localhost:3000";
}

export async function sendReminders(): Promise<number> {
  const pending = findPendingReminders();
  let sent = 0;
  const baseUrl = getBaseUrl();
  for (const reminder of pending) {
    let message: string;
    if (reminder.guardianAccessToken) {
      const url = `${baseUrl}/rsvp?token=${reminder.guardianAccessToken}&event=${reminder.eventId}`;
      message = t("whatsapp_reminder_with_link", reminder.guardianLanguage, {
        eventTitle: reminder.eventTitle,
        eventDate: reminder.eventDate ?? "",
        url,
      });
    } else {
      message = t("reminder", reminder.guardianLanguage, {
        event: reminder.eventTitle,
      });
    }
    await sendMessage(reminder.guardianPhone, message);
    sent++;
  }
  return sent;
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

export function startReminderScheduler(intervalMs = 3600000): void {
  if (reminderInterval) return;
  reminderInterval = setInterval(() => sendReminders(), intervalMs);
}

export function stopReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
