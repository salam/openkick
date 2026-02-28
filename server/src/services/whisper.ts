import { getDB } from "../database.js";

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<string> {
  // Read OpenAI API key from settings (reuse the same key used for LLM calls)
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = 'llm_api_key'");
  const apiKey = result[0]?.values[0]?.[0] as string | undefined;

  if (!apiKey) throw new Error("No API key configured for transcription");

  // Create FormData with the audio file
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(audioBuffer)]), filename);
  formData.append("model", "whisper-1");

  // POST to OpenAI Whisper API
  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { text: string };
  return data.text;
}
