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
  updateMessageLog: vi.fn(),
  obfuscatePhone: vi.fn((p: string) => p),
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

function seedFutureEvent(title: string): number {
  db.run(
    "INSERT INTO events (type, title, date) VALUES ('training', ?, '2099-12-31')",
    [title],
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function setSetting(key: string, value: string) {
  db.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, value],
  );
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

describe("WhatsApp sender filtering", () => {
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

  // --- Test 1: Known guardian phone processes message normally ---
  it("known guardian phone processes message and returns ok or help_sent", async () => {
    const phone = "41791110001";
    seedGuardianAndPlayer(phone, "Luca");
    seedFutureEvent("Training Montag");

    const { parseIntent } = await import("../../services/whatsapp.js");
    vi.mocked(parseIntent).mockResolvedValueOnce({
      intent: "attending",
      playerName: "Luca",
      reason: null,
    });

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "Luca kommt")),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(["ok", "help_sent"]).toContain(json.status);
  });

  // --- Test 2: Unknown phone with bot_allow_onboarding=false (default) -> ignored ---
  it("unknown phone with bot_allow_onboarding=false is silently ignored", async () => {
    // No guardian seeded for this phone -> unknown sender
    // bot_allow_onboarding defaults to false (no setting inserted)
    const { sendMessage } = await import("../../services/whatsapp.js");
    const { updateSessionState } = await import(
      "../../services/whatsapp-session.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload("99998887777", "Hallo")),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ignored");

    // Should NOT start onboarding
    expect(vi.mocked(updateSessionState)).not.toHaveBeenCalled();
    // Should NOT send any message
    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });

  // --- Test 3: Unknown phone with bot_allow_onboarding=true -> starts onboarding ---
  it("unknown phone with bot_allow_onboarding=true starts onboarding", async () => {
    setSetting("bot_allow_onboarding", "true");

    const { sendMessage } = await import("../../services/whatsapp.js");
    const { updateSessionState } = await import(
      "../../services/whatsapp-session.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload("99998887778", "Hallo")),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("onboarding_started");

    // Should start onboarding
    expect(vi.mocked(updateSessionState)).toHaveBeenCalledWith(
      "99998887778",
      "onboarding_name",
      {},
    );

    // Should send welcome message
    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      "99998887778",
      expect.stringContaining("Willkommen"),
    );
  });

  // --- Test 4: fromMe message processes normally (not filtered out) ---
  it("fromMe message from unknown phone is not filtered out", async () => {
    // fromMe=true means this is the bot's own message echoed back
    // It should NOT be filtered by the sender filter, even if unknown phone
    // With bot_allow_onboarding=true it would start onboarding.
    // The key point is fromMe bypasses the sender filter gate.
    setSetting("bot_allow_onboarding", "true");

    const { sendMessage } = await import("../../services/whatsapp.js");
    const { updateSessionState } = await import(
      "../../services/whatsapp-session.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeWebhookPayload("99998887779", "Test", { fromMe: true }),
      ),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    // fromMe should NOT be silently ignored — it falls through to normal processing
    expect(json.status).not.toBe("ignored");
  });

  // --- Test 2b: Explicit bot_allow_onboarding=false also results in ignored ---
  it("unknown phone with explicit bot_allow_onboarding=false is silently ignored", async () => {
    setSetting("bot_allow_onboarding", "false");

    const { sendMessage } = await import("../../services/whatsapp.js");

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload("99998887780", "Hi")),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ignored");
    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });

  // --- Test: Unknown sender with active (non-idle) session still processes ---
  it("unknown phone with active onboarding session continues onboarding", async () => {
    // Session is already in onboarding state (non-idle), so filter should NOT block
    const phone = "99998887781";

    const { getOrCreateSession } = await import(
      "../../services/whatsapp-session.js"
    );
    vi.mocked(getOrCreateSession).mockReturnValue({
      id: 1,
      phone,
      state: "onboarding_name",
      context: "{}",
      wahaMessageId: null,
      updatedAt: new Date().toISOString(),
    });

    const { handleOnboarding } = await import(
      "../../services/whatsapp-onboarding.js"
    );

    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeWebhookPayload(phone, "Hans Mueller")),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("onboarding");

    expect(vi.mocked(handleOnboarding)).toHaveBeenCalledWith(
      phone,
      "Hans Mueller",
      expect.any(String),
    );
  });
});
