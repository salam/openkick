import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import {
  parseIntent,
  sendMessage,
  reactToMessage,
} from "../services/whatsapp.js";
import { setAttendance } from "../services/attendance.js";
import { transcribeAudio } from "../services/whisper.js";
import {
  getOrCreateSession,
  updateSessionState,
  resetSession,
  isDuplicate,
  logMessage,
} from "../services/whatsapp-session.js";
import { handleOnboarding } from "../services/whatsapp-onboarding.js";
import { t } from "../utils/i18n.js";

export const whatsappRouter = Router();

interface WAHAWebhookPayload {
  event: string;
  payload: {
    id: string;
    from: string;
    author?: string;
    body: string;
    hasMedia: boolean;
    isGroupMsg?: boolean;
    media?: {
      data: string; // base64-encoded
      mimetype: string;
      filename?: string;
    };
  };
}

function findGuardianByPhone(phone: string) {
  const db = getDB();
  const result = db.exec(
    "SELECT id, name, language FROM guardians WHERE phone = ?",
    [phone],
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return {
    id: result[0].values[0][0] as number,
    name: result[0].values[0][1] as string | null,
    language: (result[0].values[0][2] as string) || "de",
  };
}

function findPlayersForGuardian(guardianId: number) {
  const db = getDB();
  const result = db.exec(
    "SELECT p.id, p.name FROM players p JOIN guardian_players gp ON gp.playerId = p.id WHERE gp.guardianId = ?",
    [guardianId],
  );
  if (result.length === 0) return [];
  return result[0].values.map((row) => ({
    id: row[0] as number,
    name: row[1] as string,
  }));
}

function findNextUpcomingEvent(): {
  id: number;
  title: string;
  date: string;
} | null {
  const db = getDB();
  const result = db.exec(
    "SELECT id, title, date FROM events WHERE date >= date('now') ORDER BY date ASC, startTime ASC LIMIT 1",
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return {
    id: result[0].values[0][0] as number,
    title: result[0].values[0][1] as string,
    date: (result[0].values[0][2] as string) || "",
  };
}

/**
 * Handle disambiguation reply: user picks a child by number.
 */
function handleDisambiguation(
  phone: string,
  text: string,
  contextJson: string,
  lang: string,
): void {
  const context = JSON.parse(contextJson) as {
    pendingPlayerIds: number[];
    pendingStatus: "attending" | "absent";
    pendingEventId: number;
  };

  const index = parseInt(text.trim(), 10);
  if (
    isNaN(index) ||
    index < 1 ||
    index > context.pendingPlayerIds.length
  ) {
    sendMessage(phone, t("whatsapp_help", lang)).catch(() => {});
    return;
  }

  const playerId = context.pendingPlayerIds[index - 1];
  const { finalStatus } = setAttendance(
    context.pendingEventId,
    playerId,
    context.pendingStatus,
    "whatsapp",
  );

  // Look up player name for confirmation
  const db = getDB();
  const playerResult = db.exec("SELECT name FROM players WHERE id = ?", [
    playerId,
  ]);
  const playerName =
    playerResult.length > 0 && playerResult[0].values.length > 0
      ? (playerResult[0].values[0][0] as string)
      : "Spieler";

  // Look up event for confirmation
  const eventResult = db.exec(
    "SELECT title, date FROM events WHERE id = ?",
    [context.pendingEventId],
  );
  const eventTitle =
    eventResult.length > 0 ? (eventResult[0].values[0][0] as string) : "";
  const eventDate =
    eventResult.length > 0 ? (eventResult[0].values[0][1] as string) : "";

  const confirmKey =
    finalStatus === "waitlist"
      ? "whatsapp_confirm_waitlist"
      : finalStatus === "attending"
        ? "whatsapp_confirm_attending"
        : "whatsapp_confirm_absent";

  sendMessage(
    phone,
    t(confirmKey, lang, { playerName, eventTitle, eventDate }),
  ).catch(() => {});

  resetSession(phone);
}

// POST /webhook receives WAHA webhook events
whatsappRouter.post(
  "/webhook",
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as WAHAWebhookPayload;

    // 1. Only handle message events
    if (body.event !== "message") {
      res.status(200).json({ status: "ignored" });
      return;
    }

    // 2. Extract phone, messageId, body text
    const messageId = body.payload.id;

    // 3. Handle group messages
    const isGroup =
      body.payload.from.endsWith("@g.us") ||
      body.payload.isGroupMsg === true;
    const senderChatId = isGroup ? body.payload.author : body.payload.from;

    if (!senderChatId) {
      res.status(200).json({ status: "ignored" });
      return;
    }

    // 4. Strip @c.us suffix
    const phone = senderChatId.replace(/@c\.us$/, "");

    // 5. Dedup check
    if (messageId && isDuplicate(messageId)) {
      res.status(200).json({ status: "duplicate" });
      return;
    }

    // 6. Log incoming message
    if (messageId) {
      logMessage(messageId, phone, "in", body.payload.body);
    }

    try {
      // 7. Handle audio transcription
      let messageText: string;
      if (body.payload.hasMedia && body.payload.media?.data) {
        const audioBuffer = Buffer.from(body.payload.media.data, "base64");
        const filename = body.payload.media.filename || "audio.ogg";
        messageText = await transcribeAudio(audioBuffer, filename);
      } else {
        messageText = body.payload.body;
      }

      // 8. Get or create session
      const session = getOrCreateSession(phone);

      // 9. Handle non-idle session states
      if (session.state !== "idle") {
        // Determine language (look up guardian if exists)
        const guardian = findGuardianByPhone(phone);
        const lang = guardian?.language || "de";

        if (session.state.startsWith("onboarding_")) {
          await handleOnboarding(phone, messageText, lang);
          res.status(200).json({ status: "onboarding" });
          return;
        }

        if (session.state === "disambiguating_child") {
          handleDisambiguation(phone, messageText, session.context, lang);
          res.status(200).json({ status: "ok" });
          return;
        }

        // Unknown non-idle state: reset and continue
        resetSession(phone);
      }

      // 10. Look up guardian by phone
      const guardian = findGuardianByPhone(phone);

      // 11. If no guardian found: start onboarding (DM only) or react in group
      if (!guardian) {
        if (isGroup && messageId) {
          reactToMessage(messageId, "\u2049\uFE0F").catch(() => {});
          res.status(200).json({ status: "unknown_sender" });
          return;
        }

        updateSessionState(phone, "onboarding_name", {});
        await sendMessage(
          phone,
          t("whatsapp_welcome", "de") +
            "\n\n" +
            t("whatsapp_onboarding_ask_name", "de"),
        );
        res.status(200).json({ status: "onboarding_started" });
        return;
      }

      const lang = guardian.language || "de";

      // 12. Parse intent
      const parsed = await parseIntent(messageText);

      // 13. Unknown intent: send help message
      if (parsed.intent === "unknown") {
        await sendMessage(phone, t("whatsapp_help", lang));
        if (isGroup && messageId) {
          reactToMessage(messageId, "\uD83D\uDC40").catch(() => {});
        }
        res.status(200).json({ status: "help_sent" });
        return;
      }

      // 14. Attending or absent intent
      const event = findNextUpcomingEvent();
      if (!event) {
        await sendMessage(phone, "Kein bevorstehendes Event gefunden.");
        res.status(200).json({ status: "no_event" });
        return;
      }

      const players = findPlayersForGuardian(guardian.id);
      if (players.length === 0) {
        await sendMessage(phone, "Kein Spieler mit deinem Konto verknuepft.");
        res.status(200).json({ status: "no_players" });
        return;
      }

      // If a player name was mentioned, try to match it
      let targetPlayers = players;
      if (parsed.playerName) {
        const matched = players.filter((p) =>
          p.name.toLowerCase().includes(parsed.playerName!.toLowerCase()),
        );
        if (matched.length > 0) {
          targetPlayers = matched;
        }
      }

      // Multi-child disambiguation (only when no name matched)
      if (targetPlayers.length > 1 && !parsed.playerName) {
        const options = targetPlayers
          .map((p, i) => `${i + 1}) ${p.name}`)
          .join("\n");
        updateSessionState(phone, "disambiguating_child", {
          pendingPlayerIds: targetPlayers.map((p) => p.id),
          pendingStatus: parsed.intent,
          pendingEventId: event.id,
        });
        await sendMessage(
          phone,
          t("whatsapp_disambiguate", lang, { options }),
        );
        res.status(200).json({ status: "disambiguating" });
        return;
      }

      // Single player (or matched by name): set attendance
      for (const player of targetPlayers) {
        const { finalStatus } = setAttendance(
          event.id,
          player.id,
          parsed.intent as "attending" | "absent",
          "whatsapp",
          parsed.reason ?? undefined,
        );

        const confirmKey =
          finalStatus === "waitlist"
            ? "whatsapp_confirm_waitlist"
            : finalStatus === "attending"
              ? "whatsapp_confirm_attending"
              : "whatsapp_confirm_absent";

        await sendMessage(
          phone,
          t(confirmKey, lang, {
            playerName: player.name,
            eventTitle: event.title,
            eventDate: event.date,
          }),
        );
      }

      // 15. React with eyes on group messages
      if (isGroup && messageId) {
        reactToMessage(messageId, "\uD83D\uDC40").catch(() => {});
      }

      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ status: "error" });
    }
  },
);
