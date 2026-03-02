import { getDB } from "../database.js";
import { chatCompletion } from "./llm.js";
import { sendMessage } from "./whatsapp.js";
import { getBotTemplate } from "./whatsapp-templates.js";
import { setAttendance } from "./attendance.js";
import { findNextUpcomingEventAny } from "./next-event.js";

export interface CoachIntent {
  intent:
    | "attendance_overview"
    | "match_sheet"
    | "cancel_event"
    | "send_reminder"
    | "mark_attendance"
    | "admin_link"
    | "unknown";
  playerName?: string | null;
  status?: "attending" | "absent";
  reason?: string | null;
}

/**
 * Parse a WhatsApp message from a coach/admin into a structured intent
 * using the configured LLM provider.
 */
export async function parseCoachIntent(text: string): Promise<CoachIntent> {
  const response = await chatCompletion([
    {
      role: "system",
      content: `You are a football team management bot for coaches and admins.
Classify the coach's message into one of these intents:
- "attendance_overview": coach asks who is coming / attendance status
- "match_sheet": coach asks for lineup / match sheet
- "cancel_event": coach wants to cancel the next training or event
- "send_reminder": coach wants to send reminders to parents
- "mark_attendance": coach marks a specific player as attending or absent
- "admin_link": coach asks for the admin dashboard / web portal link
- "unknown": the message doesn't match any coach command

Return JSON only: { "intent": "...", "playerName": string|null, "status": "attending"|"absent"|null, "reason": string|null }
Extract the player's name if mentioned. Extract the status if marking attendance.`,
    },
    { role: "user", content: text },
  ]);

  try {
    return JSON.parse(response.content) as CoachIntent;
  } catch {
    return { intent: "unknown", playerName: null, status: undefined, reason: null };
  }
}

/**
 * Find the next upcoming event from all sources (events, series, training schedules).
 */
function findNextEvent() {
  return findNextUpcomingEventAny();
}

/**
 * Get all players registered in the system.
 */
function getAllPlayers(): { id: number; name: string }[] {
  const db = getDB();
  const result = db.exec("SELECT id, name FROM players");
  if (result.length === 0) return [];
  return result[0].values.map((row) => ({
    id: row[0] as number,
    name: row[1] as string,
  }));
}

/**
 * Build attendance overview: attending, absent, and pending player names.
 */
function buildAttendanceLists(eventId: number): {
  attending: string[];
  absent: string[];
  pending: string[];
} {
  const db = getDB();
  const allPlayers = getAllPlayers();

  const attendanceResult = db.exec(
    "SELECT playerId, status FROM attendance WHERE eventId = ?",
    [eventId],
  );

  const statusMap = new Map<number, string>();
  if (attendanceResult.length > 0) {
    for (const row of attendanceResult[0].values) {
      statusMap.set(row[0] as number, row[1] as string);
    }
  }

  const attending: string[] = [];
  const absent: string[] = [];
  const pending: string[] = [];

  for (const player of allPlayers) {
    const status = statusMap.get(player.id);
    if (status === "attending") {
      attending.push(player.name);
    } else if (status === "absent") {
      absent.push(player.name);
    } else {
      pending.push(player.name);
    }
  }

  return { attending, absent, pending };
}

/**
 * Handle attendance_overview: show who is coming to the next event.
 */
async function handleAttendanceOverview(phone: string, lang: string): Promise<void> {
  const event = findNextEvent();
  if (!event) {
    await sendMessage(phone, getBotTemplate("whatsapp_coach_no_event", lang));
    return;
  }

  const { attending, absent, pending } = buildAttendanceLists(event.id as number);

  const attendingStr = attending.length > 0
    ? `${attending.join(", ")} (${attending.length})`
    : "-";
  const absentStr = absent.length > 0
    ? `${absent.join(", ")} (${absent.length})`
    : "-";
  const pendingStr = pending.length > 0
    ? `${pending.join(", ")} (${pending.length})`
    : "-";

  await sendMessage(
    phone,
    getBotTemplate("whatsapp_coach_attendance_overview", lang, {
      eventTitle: event.title,
      eventDate: event.date,
      attending: attendingStr,
      absent: absentStr,
      pending: pendingStr,
    }),
  );
}

/**
 * Handle cancel_event: delete the next event and notify all guardians.
 */
async function handleCancelEvent(phone: string, lang: string): Promise<void> {
  const event = findNextEvent();
  if (!event) {
    await sendMessage(phone, getBotTemplate("whatsapp_coach_no_event", lang));
    return;
  }

  const db = getDB();

  // Find all guardians who have players (to notify them)
  const guardiansResult = db.exec(
    "SELECT DISTINCT g.phone, g.language FROM guardians g JOIN guardian_players gp ON gp.guardianId = g.id",
  );

  // Delete the event and its attendance records
  db.run("DELETE FROM attendance WHERE eventId = ?", [event.id]);
  db.run("DELETE FROM events WHERE id = ?", [event.id]);

  // Notify all guardians
  if (guardiansResult.length > 0) {
    for (const row of guardiansResult[0].values) {
      const guardianPhone = row[0] as string;
      const guardianLang = (row[1] as string) || "de";
      await sendMessage(
        guardianPhone,
        getBotTemplate("whatsapp_coach_cancellation_notice", guardianLang, {
          eventTitle: event.title,
          eventDate: event.date,
        }),
      );
    }
  }

  // Confirm to coach
  await sendMessage(
    phone,
    getBotTemplate("whatsapp_coach_event_cancelled", lang, {
      eventTitle: event.title,
      eventDate: event.date,
    }),
  );
}

/**
 * Handle send_reminder: send reminders to guardians of players who haven't responded.
 */
async function handleSendReminder(phone: string, lang: string): Promise<void> {
  const event = findNextEvent();
  if (!event) {
    await sendMessage(phone, getBotTemplate("whatsapp_coach_no_event", lang));
    return;
  }

  const db = getDB();

  // Find guardians whose players have NOT responded to this event
  const pendingResult = db.exec(
    `SELECT DISTINCT g.phone, g.language
     FROM players p
     JOIN guardian_players gp ON gp.playerId = p.id
     JOIN guardians g ON g.id = gp.guardianId
     WHERE p.id NOT IN (
       SELECT playerId FROM attendance WHERE eventId = ?
     )`,
    [event.id],
  );

  let reminderCount = 0;
  if (pendingResult.length > 0) {
    for (const row of pendingResult[0].values) {
      const guardianPhone = row[0] as string;
      const guardianLang = (row[1] as string) || "de";
      await sendMessage(
        guardianPhone,
        getBotTemplate("whatsapp_reminder_with_link", guardianLang, {
          eventTitle: event.title,
          eventDate: event.date,
          url: "/rsvp",
        }),
      );
      reminderCount++;
    }
  }

  // Confirm to coach
  await sendMessage(
    phone,
    getBotTemplate("whatsapp_coach_reminder_sent", lang, {
      count: String(reminderCount),
      eventTitle: event.title,
    }),
  );
}

/**
 * Handle mark_attendance: find a player by name and set their attendance.
 */
async function handleMarkAttendance(
  phone: string,
  intent: CoachIntent,
  lang: string,
): Promise<void> {
  const event = findNextEvent();
  if (!event) {
    await sendMessage(phone, getBotTemplate("whatsapp_coach_no_event", lang));
    return;
  }

  if (!intent.playerName) {
    await sendMessage(phone, getBotTemplate("whatsapp_coach_help", lang));
    return;
  }

  const db = getDB();
  const playerResult = db.exec(
    "SELECT id, name FROM players WHERE LOWER(name) LIKE ?",
    [`%${intent.playerName.toLowerCase()}%`],
  );

  if (playerResult.length === 0 || playerResult[0].values.length === 0) {
    await sendMessage(
      phone,
      getBotTemplate("whatsapp_coach_player_not_found", lang, {
        name: intent.playerName,
      }),
    );
    return;
  }

  const playerId = playerResult[0].values[0][0] as number;
  const playerName = playerResult[0].values[0][1] as string;
  const status = intent.status || "attending";

  setAttendance(event.id as number, playerId, status, "whatsapp");

  const statusLabel = getBotTemplate(
    status === "attending" ? "attendance_confirmed_label" : "attendance_absent_label",
    lang,
  );
  await sendMessage(
    phone,
    getBotTemplate("whatsapp_coach_mark_confirmed", lang, {
      playerName,
      eventTitle: event.title,
      status: statusLabel,
    }),
  );
}

/**
 * Handle match_sheet: show the lineup / attending players for the next event.
 * Uses the same format as attendance overview.
 */
async function handleMatchSheet(phone: string, lang: string): Promise<void> {
  await handleAttendanceOverview(phone, lang);
}

/**
 * Handle admin_link: send the coach a link to the web dashboard.
 */
async function handleAdminLink(phone: string, lang: string): Promise<void> {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = 'base_url'");
  const baseUrl = result.length > 0 && result[0].values.length > 0
    ? (result[0].values[0][0] as string)
    : "";

  const url = `${baseUrl}/dashboard`;

  await sendMessage(
    phone,
    getBotTemplate("whatsapp_coach_admin_link", lang, { url }),
  );
}

/**
 * Main dispatcher: routes a parsed coach intent to the appropriate handler.
 */
export async function handleCoachIntent(
  phone: string,
  intent: CoachIntent,
  lang: string,
): Promise<void> {
  switch (intent.intent) {
    case "attendance_overview":
      await handleAttendanceOverview(phone, lang);
      break;
    case "match_sheet":
      await handleMatchSheet(phone, lang);
      break;
    case "cancel_event":
      await handleCancelEvent(phone, lang);
      break;
    case "send_reminder":
      await handleSendReminder(phone, lang);
      break;
    case "mark_attendance":
      await handleMarkAttendance(phone, intent, lang);
      break;
    case "admin_link":
      await handleAdminLink(phone, lang);
      break;
    default:
      await sendMessage(phone, getBotTemplate("whatsapp_coach_help", lang));
      break;
  }
}
