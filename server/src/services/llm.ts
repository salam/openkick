import { getDB } from "../database.js";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMConfig {
  provider: "openai" | "claude" | "euria";
  model: string;
  apiKey: string;
  productId?: string;
}

function getSetting(key: string): string | undefined {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (result.length === 0 || result[0].values.length === 0) {
    return undefined;
  }
  return result[0].values[0][0] as string;
}

export function getConfigFromSettings(): LLMConfig {
  const provider = (getSetting("llm_provider") ?? "openai") as LLMConfig["provider"];
  const model = getSetting("llm_model") ?? "";
  const apiKey = getSetting("llm_api_key") ?? "";
  const productId = getSetting("llm_product_id");

  return { provider, model, apiKey, ...(productId ? { productId } : {}) };
}

async function callOpenAI(
  messages: LLMMessage[],
  config: LLMConfig,
): Promise<LLMResponse> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(
      `OpenAI API error (${response.status}): ${err?.error?.message ?? JSON.stringify(err)}`,
    );
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        }
      : undefined,
  };
}

async function callClaude(
  messages: LLMMessage[],
  config: LLMConfig,
): Promise<LLMResponse> {
  // Extract system message to top-level field
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");
  const systemText =
    systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join("\n")
      : undefined;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: nonSystemMessages,
    max_tokens: 4096,
  };
  if (systemText) {
    body.system = systemText;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(
      `Claude API error (${response.status}): ${err?.error?.message ?? JSON.stringify(err)}`,
    );
  }

  const data = await response.json();
  const textBlock = data.content?.find(
    (b: { type: string }) => b.type === "text",
  );

  return {
    content: textBlock?.text ?? "",
    model: data.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        }
      : undefined,
  };
}

async function callEuria(
  messages: LLMMessage[],
  config: LLMConfig,
): Promise<LLMResponse> {
  const url = `https://api.infomaniak.com/2/ai/${config.productId}/openai/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(
      `Euria API error (${response.status}): ${err?.error?.message ?? JSON.stringify(err)}`,
    );
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        }
      : undefined,
  };
}

export async function chatCompletion(
  messages: LLMMessage[],
  configOverride?: Partial<LLMConfig>,
): Promise<LLMResponse> {
  const dbConfig = getConfigFromSettings();
  const config: LLMConfig = { ...dbConfig, ...configOverride } as LLMConfig;

  switch (config.provider) {
    case "openai":
      return callOpenAI(messages, config);
    case "claude":
      return callClaude(messages, config);
    case "euria":
      return callEuria(messages, config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

export function getAvailableProviders(): {
  name: string;
  label: string;
  requiresProductId: boolean;
}[] {
  return [
    { name: "openai", label: "OpenAI", requiresProductId: false },
    { name: "claude", label: "Anthropic Claude", requiresProductId: false },
    { name: "euria", label: "Infomaniak Euria", requiresProductId: true },
  ];
}
