import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Mock the llm module before importing the module under test
vi.mock("../llm.js", () => ({
  chatCompletion: vi.fn(),
}));

// Mock pdfjs-dist
vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
}));

import { chatCompletion } from "../llm.js";
import { getDocument } from "pdfjs-dist";
import { extractFromPdf, extractFromUrl } from "../tournament-import.js";
import type { ImportedTournament } from "../tournament-import.js";

const VALID_LLM_RESPONSE: ImportedTournament = {
  title: "Juniorenturnier Zürich",
  date: "2026-06-15",
  startTime: "09:00",
  location: "Sportanlage Buchlern, Zürich",
  categoryRequirement: "E,F",
  deadline: "2026-06-08",
  maxParticipants: 32,
  description: "Juniorenturnier für Kategorien E und F",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractFromPdf", () => {
  it("extracts text from PDF, sends to LLM, and returns event details", async () => {
    // Mock pdfjs-dist getDocument
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: "Juniorenturnier" },
          { str: " Zürich" },
          { str: " 15. Juni 2026" },
        ],
      }),
    };
    const mockDoc = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    };
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve(mockDoc),
    } as any);

    // Mock LLM response
    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify(VALID_LLM_RESPONSE),
      model: "gpt-4o",
    });

    const pdfBuffer = Buffer.from("fake-pdf-content");
    const result = await extractFromPdf(pdfBuffer);

    // Verify getDocument was called with the buffer data
    expect(getDocument).toHaveBeenCalledOnce();
    const callArg = vi.mocked(getDocument).mock.calls[0][0] as { data: Uint8Array };
    expect(callArg.data).toBeInstanceOf(Uint8Array);

    // Verify chatCompletion was called with extracted text
    expect(chatCompletion).toHaveBeenCalledOnce();
    const messages = vi.mocked(chatCompletion).mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("Juniorenturnier");

    // Verify result shape
    expect(result).toEqual(VALID_LLM_RESPONSE);
  });
});

describe("extractFromUrl", () => {
  it("fetches URL content, sends to LLM, and returns event details", async () => {
    // Mock global fetch for URL fetching
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        "<html><body><h1>Juniorenturnier Zürich</h1><p>15. Juni 2026</p></body></html>",
        { status: 200 },
      ),
    );

    // Mock LLM response
    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify(VALID_LLM_RESPONSE),
      model: "gpt-4o",
    });

    const result = await extractFromUrl("https://example.com/tournament");

    // Verify fetch was called with the URL
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/tournament",
    );

    // Verify chatCompletion was called with stripped HTML
    expect(chatCompletion).toHaveBeenCalledOnce();
    const messages = vi.mocked(chatCompletion).mock.calls[0][0];
    expect(messages[1].content).not.toContain("<html>");
    expect(messages[1].content).not.toContain("<body>");
    expect(messages[1].content).toContain("Juniorenturnier Zürich");

    // Verify result
    expect(result).toEqual(VALID_LLM_RESPONSE);
  });

  it("throws when URL fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    await expect(
      extractFromUrl("https://example.com/not-found"),
    ).rejects.toThrow("Failed to fetch URL (404)");
  });
});

describe("extracted data shape", () => {
  it("has correct shape with all fields present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Tournament info</body></html>", {
        status: 200,
      }),
    );

    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify(VALID_LLM_RESPONSE),
      model: "gpt-4o",
    });

    const result = await extractFromUrl("https://example.com/tournament");

    // Verify all expected fields exist
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("date");
    expect(result).toHaveProperty("startTime");
    expect(result).toHaveProperty("location");
    expect(result).toHaveProperty("categoryRequirement");
    expect(result).toHaveProperty("deadline");
    expect(result).toHaveProperty("maxParticipants");
    expect(result).toHaveProperty("description");

    // Verify types
    expect(typeof result.title).toBe("string");
    expect(typeof result.date).toBe("string");
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("normalises nullable fields to null when absent from LLM response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Minimal tournament</body></html>", {
        status: 200,
      }),
    );

    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify({
        title: "Minimal Tournament",
        date: "2026-07-01",
      }),
      model: "gpt-4o",
    });

    const result = await extractFromUrl("https://example.com/minimal");

    expect(result.title).toBe("Minimal Tournament");
    expect(result.date).toBe("2026-07-01");
    expect(result.startTime).toBeNull();
    expect(result.location).toBeNull();
    expect(result.categoryRequirement).toBeNull();
    expect(result.deadline).toBeNull();
    expect(result.maxParticipants).toBeNull();
    expect(result.description).toBeNull();
  });
});

describe("LLM response parsing errors", () => {
  it("handles invalid JSON from LLM gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Tournament</body></html>", { status: 200 }),
    );

    vi.mocked(chatCompletion).mockResolvedValue({
      content: "This is not valid JSON at all",
      model: "gpt-4o",
    });

    await expect(
      extractFromUrl("https://example.com/tournament"),
    ).rejects.toThrow();
  });

  it("handles JSON wrapped in markdown code fences", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Tournament</body></html>", { status: 200 }),
    );

    vi.mocked(chatCompletion).mockResolvedValue({
      content:
        "```json\n" + JSON.stringify(VALID_LLM_RESPONSE) + "\n```",
      model: "gpt-4o",
    });

    const result = await extractFromUrl("https://example.com/tournament");
    expect(result).toEqual(VALID_LLM_RESPONSE);
  });

  it("throws when required title field is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Tournament</body></html>", { status: 200 }),
    );

    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify({ date: "2026-06-15" }),
      model: "gpt-4o",
    });

    await expect(
      extractFromUrl("https://example.com/tournament"),
    ).rejects.toThrow("Missing or invalid 'title'");
  });

  it("throws when required date field is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Tournament</body></html>", { status: 200 }),
    );

    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify({ title: "Some Tournament" }),
      model: "gpt-4o",
    });

    await expect(
      extractFromUrl("https://example.com/tournament"),
    ).rejects.toThrow("Missing or invalid 'date'");
  });
});
