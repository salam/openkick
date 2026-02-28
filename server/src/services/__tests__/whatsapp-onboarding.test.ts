import { describe, it, expect, beforeEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

vi.mock("../whatsapp.js", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

let db: Database;

function seedPlayer(name: string, yearOfBirth: number) {
  db.run(
    "INSERT INTO players (name, yearOfBirth) VALUES (?, ?)",
    [name, yearOfBirth],
  );
}

describe("whatsapp onboarding", () => {
  beforeEach(async () => {
    db = await initDB();
    vi.mocked((await import("../whatsapp.js")).sendMessage).mockReset();
    vi.mocked((await import("../whatsapp.js")).sendMessage).mockResolvedValue(undefined);
  });

  it("step 1: stores guardian name and advances to onboarding_child", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_name", {});

    await handleOnboarding("491234567", "Maria Mueller", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_child");
    expect(JSON.parse(session.context).guardianName).toBe("Maria Mueller");
  });

  it("step 2: matches child name and advances to onboarding_birthyear", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_child", { guardianName: "Maria" });

    await handleOnboarding("491234567", "Luca", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_birthyear");
    const ctx = JSON.parse(session.context);
    expect(ctx.childName).toBe("Luca Mueller");
  });

  it("step 2: no match resets to idle", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_child", { guardianName: "Maria" });

    await handleOnboarding("491234567", "Nonexistent", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");
  });

  it("step 3: correct birth year advances to onboarding_consent", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_birthyear", {
      guardianName: "Maria", childName: "Luca Mueller", playerId: 1,
    });

    await handleOnboarding("491234567", "2016", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_consent");
  });

  it("step 3: wrong birth year stays in onboarding_birthyear", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_birthyear", {
      guardianName: "Maria", childName: "Luca Mueller", playerId: 1, birthYearAttempts: 0,
    });

    await handleOnboarding("491234567", "2015", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("onboarding_birthyear");
  });

  it("step 4: consent yes creates guardian and links to player", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_consent", {
      guardianName: "Maria Mueller", childName: "Luca Mueller", playerId: 1,
    });

    await handleOnboarding("491234567", "Ja", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");

    const guardians = db.exec("SELECT * FROM guardians WHERE phone = '491234567'");
    expect(guardians[0]?.values).toHaveLength(1);

    const links = db.exec("SELECT * FROM guardian_players WHERE playerId = 1");
    expect(links[0]?.values).toHaveLength(1);
  });

  it("step 4: consent no resets without creating guardian", async () => {
    const { handleOnboarding } = await import("../whatsapp-onboarding.js");
    const { getOrCreateSession, updateSessionState } = await import("../whatsapp-session.js");

    seedPlayer("Luca Mueller", 2016);
    getOrCreateSession("491234567");
    updateSessionState("491234567", "onboarding_consent", {
      guardianName: "Maria", childName: "Luca Mueller", playerId: 1,
    });

    await handleOnboarding("491234567", "Nein", "de");

    const session = getOrCreateSession("491234567");
    expect(session.state).toBe("idle");

    const guardians = db.exec("SELECT * FROM guardians WHERE phone = '491234567'");
    expect(guardians).toHaveLength(0);
  });
});
