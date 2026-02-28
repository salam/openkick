import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

let db: Database;

// We need to mock fetch before importing the module under test
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("whisper service", () => {
  beforeEach(async () => {
    db = await initDB();
    // Seed an API key into settings
    db.run(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_api_key', 'test-api-key-123')",
    );
    fetchMock.mockReset();
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("transcribeAudio sends FormData to OpenAI Whisper API", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Hello world" }),
    });

    // Dynamic import so the mock is in place
    const { transcribeAudio } = await import("../whisper.js");

    const audioBuffer = Buffer.from("fake-audio-data");
    await transcribeAudio(audioBuffer, "audio.ogg");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("transcribeAudio returns transcribed text string", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "This is the transcription" }),
    });

    const { transcribeAudio } = await import("../whisper.js");

    const audioBuffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(audioBuffer, "audio.ogg");

    expect(result).toBe("This is the transcription");
  });

  it("transcribeAudio reads API key from settings DB", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "test" }),
    });

    const { transcribeAudio } = await import("../whisper.js");

    const audioBuffer = Buffer.from("fake-audio-data");
    await transcribeAudio(audioBuffer, "audio.ogg");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer test-api-key-123");
  });

  it("transcribeAudio throws when no API key is configured", async () => {
    db.run("DELETE FROM settings WHERE key = 'llm_api_key'");

    const { transcribeAudio } = await import("../whisper.js");

    const audioBuffer = Buffer.from("fake-audio-data");
    await expect(
      transcribeAudio(audioBuffer, "audio.ogg"),
    ).rejects.toThrow("No API key configured for transcription");
  });

  it("transcribeAudio handles API error gracefully", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const { transcribeAudio } = await import("../whisper.js");

    const audioBuffer = Buffer.from("fake-audio-data");
    await expect(
      transcribeAudio(audioBuffer, "audio.ogg"),
    ).rejects.toThrow("Whisper API error: 401 Unauthorized");
  });
});
