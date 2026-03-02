import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

// Mock fetch globally before importing the module under test
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock the llm module
vi.mock("../llm.js", () => ({
  chatCompletion: vi.fn(),
}));

describe("whatsapp sendMessage suffix", () => {
  beforeEach(async () => {
    db = await initDB();
    fetchMock.mockReset();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('appends " (by OpenKick)" suffix to the text sent to WAHA', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { sendMessage } = await import("../whatsapp.js");
    await sendMessage("41791234567", "Training tomorrow at 18:00");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.text).toBe("Training tomorrow at 18:00 (by OpenKick)");
  });

  it("appends suffix even for short messages", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { sendMessage } = await import("../whatsapp.js");
    await sendMessage("41791234567", "Hi");

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.text).toBe("Hi (by OpenKick)");
  });
});
