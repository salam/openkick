import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDB, getDB } from "../../database.js";
import type { Database } from "sql.js";

// We'll dynamically import the module under test after mocking fetch
let chatCompletion: typeof import("../llm.js").chatCompletion;
let getAvailableProviders: typeof import("../llm.js").getAvailableProviders;
let getConfigFromSettings: typeof import("../llm.js").getConfigFromSettings;

let db: Database;

beforeEach(async () => {
  db = await initDB();
  const mod = await import("../llm.js");
  chatCompletion = mod.chatCompletion;
  getAvailableProviders = mod.getAvailableProviders;
  getConfigFromSettings = mod.getConfigFromSettings;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setSetting(key: string, value: string) {
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    key,
    value,
  ]);
}

describe("OpenAI provider", () => {
  it("formats request correctly (url, headers, body shape)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello!" } }],
          model: "gpt-4o",
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      ),
    );

    const messages = [{ role: "user" as const, content: "Hi" }];
    const result = await chatCompletion(messages, {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test-key",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((options as RequestInit).method).toBe("POST");

    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toEqual(messages);

    expect(result.content).toBe("Hello!");
    expect(result.model).toBe("gpt-4o");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });
});

describe("Claude provider", () => {
  it("formats request with x-api-key header and correct body shape", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Bonjour!" }],
          model: "claude-sonnet-4-20250514",
          usage: { input_tokens: 8, output_tokens: 3 },
        }),
        { status: 200 },
      ),
    );

    const messages = [
      { role: "system" as const, content: "You are helpful." },
      { role: "user" as const, content: "Hello" },
    ];
    const result = await chatCompletion(messages, {
      provider: "claude",
      model: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");

    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.model).toBe("claude-sonnet-4-20250514");
    // System message should be extracted as top-level `system` field
    expect(body.system).toBe("You are helpful.");
    // Messages should NOT contain the system message
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(body.max_tokens).toBe(4096);

    expect(result.content).toBe("Bonjour!");
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.usage).toEqual({ promptTokens: 8, completionTokens: 3 });
  });
});

describe("Euria provider", () => {
  it("uses correct Infomaniak URL pattern with product_id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hallo!" } }],
          model: "euria",
          usage: { prompt_tokens: 6, completion_tokens: 2 },
        }),
        { status: 200 },
      ),
    );

    const messages = [{ role: "user" as const, content: "Greetings" }];
    const result = await chatCompletion(messages, {
      provider: "euria",
      model: "euria",
      apiKey: "ik-test-key",
      productId: "12345",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://api.infomaniak.com/2/ai/12345/openai/v1/chat/completions",
    );

    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ik-test-key");

    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.model).toBe("euria");
    expect(body.messages).toEqual(messages);

    expect(result.content).toBe("Hallo!");
  });
});

describe("chatCompletion", () => {
  it("dispatches to configured provider from settings DB", async () => {
    setSetting("llm_provider", "openai");
    setSetting("llm_model", "gpt-4o-mini");
    setSetting("llm_api_key", "sk-from-db");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "From DB config" } }],
          model: "gpt-4o-mini",
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
        { status: 200 },
      ),
    );

    const result = await chatCompletion([
      { role: "user", content: "test" },
    ]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");

    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-from-db");

    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o-mini");

    expect(result.content).toBe("From DB config");
  });

  it("reads provider config from settings DB", () => {
    setSetting("llm_provider", "claude");
    setSetting("llm_model", "claude-sonnet-4-20250514");
    setSetting("llm_api_key", "sk-ant-db");

    const config = getConfigFromSettings();
    expect(config.provider).toBe("claude");
    expect(config.model).toBe("claude-sonnet-4-20250514");
    expect(config.apiKey).toBe("sk-ant-db");
  });

  it("reads euria product_id from settings DB", () => {
    setSetting("llm_provider", "euria");
    setSetting("llm_model", "euria");
    setSetting("llm_api_key", "ik-key");
    setSetting("llm_product_id", "99999");

    const config = getConfigFromSettings();
    expect(config.provider).toBe("euria");
    expect(config.productId).toBe("99999");
  });

  it("throws when API returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
      }),
    );

    await expect(
      chatCompletion(
        [{ role: "user", content: "test" }],
        { provider: "openai", model: "gpt-4o", apiKey: "bad-key" },
      ),
    ).rejects.toThrow();
  });
});

describe("getAvailableProviders", () => {
  it("returns list of provider configs", () => {
    const providers = getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBe(3);

    const names = providers.map((p) => p.name);
    expect(names).toContain("openai");
    expect(names).toContain("claude");
    expect(names).toContain("euria");

    const euria = providers.find((p) => p.name === "euria");
    expect(euria?.requiresProductId).toBe(true);

    const openai = providers.find((p) => p.name === "openai");
    expect(openai?.requiresProductId).toBe(false);

    const claude = providers.find((p) => p.name === "claude");
    expect(claude?.requiresProductId).toBe(false);
  });
});
