import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import {
  parseAttendanceMessage,
  sendMessage,
  reactToMessage,
} from "../services/whatsapp.js";
import { setAttendance } from "../services/attendance.js";
import { transcribeAudio } from "../services/whisper.js";

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

function stripPhoneSuffix(from: string): string {
  // "41791234567@c.us" -> "41791234567"
  return from.replace(/@c\.us$/, "");
}

function findGuardianByPhone(phone: string) {
  const db = getDB();
  const result = db.exec("SELECT id, name FROM guardians WHERE phone = ?", [
    phone,
  ]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return {
    id: result[0].values[0][0] as number,
    name: result[0].values[0][1] as string | null,
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

function findNextUpcomingEvent(): { id: number; title: string } | null {
  const db = getDB();
  const result = db.exec(
    "SELECT id, title FROM events WHERE date >= date('now') ORDER BY date ASC, startTime ASC LIMIT 1",
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return {
    id: result[0].values[0][0] as number,
    title: result[0].values[0][1] as string,
  };
}

// POST /webhook — receives WAHA webhook events
whatsappRouter.post(
  "/webhook",
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as WAHAWebhookPayload;

    // Only handle message events
    if (body.event !== "message") {
      res.status(200).json({ status: "ignored" });
      return;
    }

    const isGroup = body.payload.from.endsWith("@g.us") || body.payload.isGroupMsg === true;
    const senderChatId = isGroup ? body.payload.author : body.payload.from;

    if (!senderChatId) {
      res.status(200).json({ status: "ignored" });
      return;
    }

    const phone = senderChatId.replace(/@c\.us$/, "");
    const guardian = findGuardianByPhone(phone);

    if (!guardian) {
      // Unknown sender — ignore gracefully
      res.status(200).json({ status: "unknown_sender" });
      return;
    }

    try {
      let messageText: string;

      if (body.payload.hasMedia && body.payload.media) {
        // Audio message — transcribe first
        const audioBuffer = Buffer.from(
          body.payload.media.data,
          "base64",
        );
        const filename =
          body.payload.media.filename || "audio.ogg";
        messageText = await transcribeAudio(audioBuffer, filename);
      } else {
        messageText = body.payload.body;
      }

      const parsed = await parseAttendanceMessage(messageText);
      const players = findPlayersForGuardian(guardian.id);

      if (players.length === 0) {
        await sendMessage(phone, "Kein Spieler mit deinem Konto verknüpft.");
        res.status(200).json({ status: "no_players" });
        return;
      }

      const event = findNextUpcomingEvent();
      if (!event) {
        await sendMessage(phone, "Kein bevorstehendes Event gefunden.");
        res.status(200).json({ status: "no_event" });
        return;
      }

      // If a player name was mentioned, try to match it
      let targetPlayers = players;
      if (parsed.playerName) {
        const matched = players.filter(
          (p) =>
            p.name.toLowerCase().includes(parsed.playerName!.toLowerCase()),
        );
        if (matched.length > 0) {
          targetPlayers = matched;
        }
      }

      // Update attendance for each target player
      for (const player of targetPlayers) {
        setAttendance(
          event.id,
          player.id,
          parsed.status,
          "whatsapp",
          parsed.reason ?? undefined,
        );
      }

      // Send confirmation
      const playerNames = targetPlayers.map((p) => p.name).join(", ");
      const statusText =
        parsed.status === "attending" ? "angemeldet" : "abgemeldet";
      await sendMessage(
        phone,
        `${playerNames} wurde für "${event.title}" ${statusText}.`,
      );

      // If group message, react with eyes emoji on the original message
      if (isGroup && body.payload.id) {
        reactToMessage(body.payload.id, "👀").catch(() => {
          // Best-effort reaction — don't fail the webhook
        });
      }

      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ status: "error" });
    }
  },
);
