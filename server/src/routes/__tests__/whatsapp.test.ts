import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

// Mock the whatsapp service
vi.mock("../../services/whatsapp.js", () => ({
  parseAttendanceMessage: vi.fn(),
  sendMessage: vi.fn(),
}));

// Mock the whisper service
vi.mock("../../services/whisper.js", () => ({
  transcribeAudio: vi.fn(),
}));

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const { whatsappRouter } = await import("../whatsapp.js");
  const app = express();
  app.use(express.json());
  app.use("/api/whatsapp", whatsappRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  db.close();
}

function seedGuardianAndPlayer(phone: string, playerName: string) {
  db.run("INSERT INTO guardians (phone, name, role) VALUES (?, ?, 'parent')", [
    phone,
    "Parent of " + playerName,
  ]);
  const guardianResult = db.exec("SELECT last_insert_rowid() AS id");
  const guardianId = guardianResult[0].values[0][0] as number;

  db.run("INSERT INTO players (name) VALUES (?)", [playerName]);
  const playerResult = db.exec("SELECT last_insert_rowid() AS id");
  const playerId = playerResult[0].values[0][0] as number;

  db.run("INSERT INTO guardian_players (guardianId, playerId) VALUES (?, ?)", [
    guardianId,
    playerId,
  ]);

  return { guardianId, playerId };
}

function seedFutureEvent(title: string): number {
  db.run(
    "INSERT INTO events (type, title, date) VALUES ('training', ?, '2099-12-31')",
    [title],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

describe("WhatsApp webhook route", () => {
  beforeEach(async () => {
    await createTestApp();
    const { parseAttendanceMessage, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseAttendanceMessage).mockReset();
    vi.mocked(sendMessage).mockReset();
    vi.mocked(sendMessage).mockResolvedValue(undefined);

    const { transcribeAudio } = await import("../../services/whisper.js");
    vi.mocked(transcribeAudio).mockReset();
  });

  afterEach(async () => {
    await teardown();
  });

  it("POST /api/whatsapp/webhook with text message triggers parseAttendanceMessage and updates attendance", async () => {
    const phone = "41791234567";
    const { playerId } = seedGuardianAndPlayer(phone, "Luca");
    const eventId = seedFutureEvent("Training Montag");

    const { parseAttendanceMessage, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseAttendanceMessage).mockResolvedValueOnce({
      playerName: "Luca",
      status: "absent",
      reason: "krank",
    });

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message",
        payload: {
          from: `${phone}@c.us`,
          body: "Luca krank",
          hasMedia: false,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");

    // Verify parseAttendanceMessage was called
    expect(vi.mocked(parseAttendanceMessage)).toHaveBeenCalledWith(
      "Luca krank",
    );

    // Verify attendance was updated in DB
    const attendance = db.exec(
      "SELECT status, reason, source FROM attendance WHERE eventId = ? AND playerId = ?",
      [eventId, playerId],
    );
    expect(attendance[0].values[0][0]).toBe("absent");
    expect(attendance[0].values[0][1]).toBe("krank");
    expect(attendance[0].values[0][2]).toBe("whatsapp");

    // Verify confirmation was sent
    expect(vi.mocked(sendMessage)).toHaveBeenCalled();
  });

  it("POST /api/whatsapp/webhook with audio message triggers Whisper transcription then attendance parse", async () => {
    const phone = "41791234568";
    seedGuardianAndPlayer(phone, "Max");
    seedFutureEvent("Training Dienstag");

    const { transcribeAudio } = await import("../../services/whisper.js");
    vi.mocked(transcribeAudio).mockResolvedValueOnce("Max ist krank");

    const { parseAttendanceMessage, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseAttendanceMessage).mockResolvedValueOnce({
      playerName: "Max",
      status: "absent",
      reason: "krank",
    });

    const audioData = Buffer.from("fake-audio").toString("base64");

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message",
        payload: {
          from: `${phone}@c.us`,
          body: "",
          hasMedia: true,
          media: {
            data: audioData,
            mimetype: "audio/ogg",
            filename: "voice.ogg",
          },
        },
      }),
    });

    expect(res.status).toBe(200);

    // Verify transcription was called
    expect(vi.mocked(transcribeAudio)).toHaveBeenCalledOnce();

    // Verify parse was called with transcribed text
    expect(vi.mocked(parseAttendanceMessage)).toHaveBeenCalledWith(
      "Max ist krank",
    );

    // Verify confirmation was sent
    expect(vi.mocked(sendMessage)).toHaveBeenCalled();
  });

  it("webhook sends confirmation message back to sender", async () => {
    const phone = "41791234569";
    seedGuardianAndPlayer(phone, "Anna");
    seedFutureEvent("Training Mittwoch");

    const { parseAttendanceMessage, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseAttendanceMessage).mockResolvedValueOnce({
      playerName: "Anna",
      status: "attending",
      reason: null,
    });

    await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message",
        payload: {
          from: `${phone}@c.us`,
          body: "Anna kommt",
          hasMedia: false,
        },
      }),
    });

    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("Anna"),
    );
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("angemeldet"),
    );
  });

  it("webhook handles unknown sender (guardian not in DB) gracefully", async () => {
    const { parseAttendanceMessage, sendMessage } = await import(
      "../../services/whatsapp.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message",
        payload: {
          from: "99999999999@c.us",
          body: "Hello",
          hasMedia: false,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("unknown_sender");

    // Should NOT have tried to parse or send messages
    expect(vi.mocked(parseAttendanceMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });
});
