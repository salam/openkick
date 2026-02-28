import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

// Mock the whatsapp service
vi.mock("../../services/whatsapp.js", () => ({
  parseAttendanceMessage: vi.fn(),
  parseIntent: vi.fn(),
  sendMessage: vi.fn(),
  reactToMessage: vi.fn(),
}));

// Mock the whisper service
vi.mock("../../services/whisper.js", () => ({
  transcribeAudio: vi.fn(),
}));

// Mock the whatsapp-session service
vi.mock("../../services/whatsapp-session.js", () => ({
  getOrCreateSession: vi.fn(),
  updateSessionState: vi.fn(),
  resetSession: vi.fn(),
  isDuplicate: vi.fn(),
  logMessage: vi.fn(),
}));

// Mock the whatsapp-onboarding service
vi.mock("../../services/whatsapp-onboarding.js", () => ({
  handleOnboarding: vi.fn(),
}));

// Mock the attendance service
vi.mock("../../services/attendance.js", () => ({
  setAttendance: vi.fn(),
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

function seedMultiplePlayersForGuardian(phone: string, playerNames: string[]) {
  db.run("INSERT INTO guardians (phone, name, role) VALUES (?, ?, 'parent')", [
    phone,
    "Parent of " + playerNames.join(" & "),
  ]);
  const guardianResult = db.exec("SELECT last_insert_rowid() AS id");
  const guardianId = guardianResult[0].values[0][0] as number;

  const playerIds: number[] = [];
  for (const name of playerNames) {
    db.run("INSERT INTO players (name) VALUES (?)", [name]);
    const playerResult = db.exec("SELECT last_insert_rowid() AS id");
    const playerId = playerResult[0].values[0][0] as number;
    playerIds.push(playerId);
    db.run("INSERT INTO guardian_players (guardianId, playerId) VALUES (?, ?)", [
      guardianId,
      playerId,
    ]);
  }

  return { guardianId, playerIds };
}

function seedFutureEvent(title: string): number {
  db.run(
    "INSERT INTO events (type, title, date) VALUES ('training', ?, '2099-12-31')",
    [title],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function makeWebhookPayload(
  phone: string,
  body: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    event: "message",
    payload: {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      from: `${phone}@c.us`,
      body,
      hasMedia: false,
      ...overrides,
    },
  };
}

describe("WhatsApp webhook route", () => {
  beforeEach(async () => {
    await createTestApp();

    const { parseIntent, sendMessage, reactToMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockReset();
    vi.mocked(sendMessage).mockReset();
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(reactToMessage).mockReset();
    vi.mocked(reactToMessage).mockResolvedValue(undefined);

    const { transcribeAudio } = await import("../../services/whisper.js");
    vi.mocked(transcribeAudio).mockReset();

    const {
      getOrCreateSession,
      updateSessionState,
      resetSession,
      isDuplicate,
      logMessage,
    } = await import("../../services/whatsapp-session.js");
    vi.mocked(getOrCreateSession).mockReset();
    vi.mocked(getOrCreateSession).mockReturnValue({
      id: 1,
      phone: "",
      state: "idle",
      context: "{}",
      wahaMessageId: null,
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(updateSessionState).mockReset();
    vi.mocked(resetSession).mockReset();
    vi.mocked(isDuplicate).mockReset();
    vi.mocked(isDuplicate).mockReturnValue(false);
    vi.mocked(logMessage).mockReset();

    const { handleOnboarding } = await import(
      "../../services/whatsapp-onboarding.js"
    );
    vi.mocked(handleOnboarding).mockReset();
    vi.mocked(handleOnboarding).mockResolvedValue(undefined);

    const { setAttendance } = await import("../../services/attendance.js");
    vi.mocked(setAttendance).mockReset();
    vi.mocked(setAttendance).mockReturnValue({ finalStatus: "attending" });
  });

  afterEach(async () => {
    await teardown();
  });

  // --- Deduplication ---
  it("deduplication: second message with same wahaMessageId is ignored", async () => {
    const phone = "41791234567";
    seedGuardianAndPlayer(phone, "Luca");
    seedFutureEvent("Training Montag");

    const { isDuplicate } = await import("../../services/whatsapp-session.js");
    const { sendMessage } = await import("../../services/whatsapp.js");

    // First call: not a duplicate
    vi.mocked(isDuplicate).mockReturnValueOnce(false);
    const { parseIntent } = await import("../../services/whatsapp.js");
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "attending",
      playerName: "Luca",
      reason: null,
    });

    const payload = makeWebhookPayload(phone, "Luca kommt", {
      id: "dedup_test_msg_1",
    });

    const res1 = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(200);

    // Second call: IS a duplicate
    vi.mocked(isDuplicate).mockReturnValueOnce(true);

    const res2 = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);

    // parseIntent was called once for the first message only
    expect(vi.mocked(parseIntent)).toHaveBeenCalledTimes(1);
  });

  // --- Unknown sender -> onboarding ---
  it("unknown sender triggers onboarding welcome and sets session state", async () => {
    const { sendMessage } = await import("../../services/whatsapp.js");
    const { updateSessionState } = await import(
      "../../services/whatsapp-session.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeWebhookPayload("99999999999", "Hallo"),
      ),
    });

    expect(res.status).toBe(200);

    // Should start onboarding
    expect(vi.mocked(updateSessionState)).toHaveBeenCalledWith(
      "99999999999",
      "onboarding_name",
      {},
    );

    // Should send welcome + ask_name
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      "99999999999",
      expect.stringContaining("Willkommen"),
    );
  });

  // --- Known sender, single child, "kommt" -> attending ---
  it("known sender with single child: attending intent calls setAttendance and sends confirmation", async () => {
    const phone = "41791234567";
    const { playerId } = seedGuardianAndPlayer(phone, "Luca");
    const eventId = seedFutureEvent("Training Montag");

    const { parseIntent, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "attending",
      playerName: null,
      reason: null,
    });

    const { setAttendance } = await import("../../services/attendance.js");
    vi.mocked(setAttendance).mockReturnValue({ finalStatus: "attending" });

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "kommt")),
    });

    expect(res.status).toBe(200);

    expect(vi.mocked(parseIntent)).toHaveBeenCalledWith("kommt");
    expect(vi.mocked(setAttendance)).toHaveBeenCalledWith(
      eventId,
      playerId,
      "attending",
      "whatsapp",
      undefined,
    );

    // Confirmation message
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("Luca"),
    );
  });

  // --- Known sender, single child, "nicht dabei" -> absent ---
  it("known sender with single child: absent intent calls setAttendance with absent", async () => {
    const phone = "41791234568";
    const { playerId } = seedGuardianAndPlayer(phone, "Max");
    const eventId = seedFutureEvent("Training Dienstag");

    const { parseIntent, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "absent",
      playerName: "Max",
      reason: "krank",
    });

    const { setAttendance } = await import("../../services/attendance.js");
    vi.mocked(setAttendance).mockReturnValue({ finalStatus: "absent" });

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "Max ist krank")),
    });

    expect(res.status).toBe(200);

    expect(vi.mocked(setAttendance)).toHaveBeenCalledWith(
      eventId,
      playerId,
      "absent",
      "whatsapp",
      "krank",
    );

    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("Max"),
    );
  });

  // --- Known sender, multi-child, no name -> disambiguation ---
  it("known sender with multiple children and no name triggers disambiguation", async () => {
    const phone = "41791234571";
    const { playerIds } = seedMultiplePlayersForGuardian(phone, [
      "Luca",
      "Mia",
    ]);
    seedFutureEvent("Training Freitag");

    const { parseIntent, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "attending",
      playerName: null,
      reason: null,
    });

    const { updateSessionState } = await import(
      "../../services/whatsapp-session.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "kommt")),
    });

    expect(res.status).toBe(200);

    // Should enter disambiguating_child state
    expect(vi.mocked(updateSessionState)).toHaveBeenCalledWith(
      phone,
      "disambiguating_child",
      expect.objectContaining({
        pendingPlayerIds: playerIds,
        pendingStatus: "attending",
      }),
    );

    // Should send disambiguation menu
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("1)"),
    );
  });

  // --- Disambiguation reply "1" ---
  it("disambiguation reply '1' sets attendance for first child and resets session", async () => {
    const phone = "41791234572";
    seedGuardianAndPlayer(phone, "Luca"); // need guardian in DB
    const eventId = seedFutureEvent("Training Samstag");

    const { getOrCreateSession } = await import(
      "../../services/whatsapp-session.js"
    );
    vi.mocked(getOrCreateSession).mockReturnValue({
      id: 1,
      phone,
      state: "disambiguating_child",
      context: JSON.stringify({
        pendingPlayerIds: [10, 20],
        pendingStatus: "attending",
        pendingEventId: eventId,
      }),
      wahaMessageId: null,
      updatedAt: new Date().toISOString(),
    });

    const { setAttendance } = await import("../../services/attendance.js");
    vi.mocked(setAttendance).mockReturnValue({ finalStatus: "attending" });

    const { sendMessage } = await import("../../services/whatsapp.js");
    const { resetSession } = await import("../../services/whatsapp-session.js");

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "1")),
    });

    expect(res.status).toBe(200);

    // Should call setAttendance with first player (index 0 -> id 10)
    expect(vi.mocked(setAttendance)).toHaveBeenCalledWith(
      eventId,
      10,
      "attending",
      "whatsapp",
    );

    // Should reset session
    expect(vi.mocked(resetSession)).toHaveBeenCalledWith(phone);

    // Should send confirmation
    expect(vi.mocked(sendMessage)).toHaveBeenCalled();
  });

  // --- Unknown intent -> help message ---
  it("unknown intent from known sender sends help message", async () => {
    const phone = "41791234573";
    seedGuardianAndPlayer(phone, "Emma");
    seedFutureEvent("Training Sonntag");

    const { parseIntent, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "unknown",
      playerName: null,
      reason: null,
    });

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeWebhookPayload(phone, "Was gibt es zum Mittag?"),
      ),
    });

    expect(res.status).toBe(200);

    // Should send help message
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("kommt"),
    );
  });

  // --- Onboarding session state delegates to handleOnboarding ---
  it("message during onboarding session delegates to handleOnboarding", async () => {
    const phone = "41791234574";
    // Guardian exists but session is in onboarding state
    seedGuardianAndPlayer(phone, "Test");

    const { getOrCreateSession } = await import(
      "../../services/whatsapp-session.js"
    );
    vi.mocked(getOrCreateSession).mockReturnValue({
      id: 1,
      phone,
      state: "onboarding_child",
      context: JSON.stringify({ guardianName: "Hans" }),
      wahaMessageId: null,
      updatedAt: new Date().toISOString(),
    });

    const { handleOnboarding } = await import(
      "../../services/whatsapp-onboarding.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "Luca")),
    });

    expect(res.status).toBe(200);

    expect(vi.mocked(handleOnboarding)).toHaveBeenCalledWith(
      phone,
      "Luca",
      expect.any(String),
    );
  });

  // --- Audio transcription still works ---
  it("audio message triggers Whisper transcription then parseIntent", async () => {
    const phone = "41791234568";
    seedGuardianAndPlayer(phone, "Max");
    seedFutureEvent("Training Dienstag");

    const { transcribeAudio } = await import("../../services/whisper.js");
    vi.mocked(transcribeAudio).mockResolvedValueOnce("Max ist krank");

    const { parseIntent, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "absent",
      playerName: "Max",
      reason: "krank",
    });

    const { setAttendance } = await import("../../services/attendance.js");
    vi.mocked(setAttendance).mockReturnValue({ finalStatus: "absent" });

    const audioData = Buffer.from("fake-audio").toString("base64");

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message",
        payload: {
          id: "audio_msg_1",
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
    expect(vi.mocked(transcribeAudio)).toHaveBeenCalledOnce();
    expect(vi.mocked(parseIntent)).toHaveBeenCalledWith("Max ist krank");
  });

  // --- Group message: react with eyes emoji ---
  it("group message: reacts with eyes emoji and processes intent", async () => {
    const phone = "41791234570";
    seedGuardianAndPlayer(phone, "Mia");
    seedFutureEvent("Training Donnerstag");

    const { parseIntent, sendMessage, reactToMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "absent",
      playerName: "Mia",
      reason: "Ferien",
    });

    const { setAttendance } = await import("../../services/attendance.js");
    vi.mocked(setAttendance).mockReturnValue({ finalStatus: "absent" });

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message",
        payload: {
          id: "false_120363xxxxx@g.us_AAAAAA",
          from: "120363xxxxx@g.us",
          author: `${phone}@c.us`,
          body: "Mia hat Ferien",
          hasMedia: false,
          isGroupMsg: true,
        },
      }),
    });

    expect(res.status).toBe(200);

    // Reacted with eyes emoji on the group message
    expect(vi.mocked(reactToMessage)).toHaveBeenCalledWith(
      "false_120363xxxxx@g.us_AAAAAA",
      "👀",
    );

    // DM sent to sender's personal chat
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("Mia"),
    );
  });

  // --- Unknown sender in group -> react with interrobang ---
  it("reacts with interrobang to group message from unknown sender", async () => {
    const { sendMessage, reactToMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(reactToMessage).mockResolvedValueOnce(undefined);

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message",
        payload: {
          id: "false_120363xxxxx@g.us_BBBBBB",
          from: "120363xxxxx@g.us",
          author: "99999999999@c.us",
          body: "random message",
          hasMedia: false,
          isGroupMsg: true,
        },
      }),
    });

    expect(res.status).toBe(200);

    expect(vi.mocked(reactToMessage)).toHaveBeenCalledWith(
      "false_120363xxxxx@g.us_BBBBBB",
      "\u2049\uFE0F",
    );

    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });

  // --- Waitlist confirmation ---
  it("sends waitlist confirmation when setAttendance returns waitlist", async () => {
    const phone = "41791234575";
    seedGuardianAndPlayer(phone, "Noah");
    seedFutureEvent("Spiel Samstag");

    const { parseIntent, sendMessage } = await import(
      "../../services/whatsapp.js"
    );
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "attending",
      playerName: "Noah",
      reason: null,
    });

    const { setAttendance } = await import("../../services/attendance.js");
    vi.mocked(setAttendance).mockReturnValue({ finalStatus: "waitlist" });

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "Noah kommt")),
    });

    expect(res.status).toBe(200);

    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      phone,
      expect.stringContaining("Warteliste"),
    );
  });
});
