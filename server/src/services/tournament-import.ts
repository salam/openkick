import { chatCompletion } from "./llm.js";
import { getDocument } from "pdfjs-dist";

export interface ImportedTournament {
  title: string;
  date: string; // ISO date
  startTime: string | null;
  location: string | null;
  categoryRequirement: string | null; // comma-separated SFV categories
  deadline: string | null;
  maxParticipants: number | null;
  description: string | null;
}

const EXTRACTION_PROMPT = `Extract tournament details from the following text.
Return JSON with these fields:
- title: tournament name
- date: date in YYYY-MM-DD format
- startTime: start time in HH:MM format (or null)
- location: venue/address (or null)
- categoryRequirement: comma-separated SFV junior categories like "E,F" (or null)
- deadline: registration deadline in YYYY-MM-DD format (or null)
- maxParticipants: max number of participants (or null)
- description: brief description (or null)
Return only the JSON object, no other text.`;

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text +=
      content.items.map((item: { str?: string }) => item.str ?? "").join(" ") +
      "\n";
  }
  return text;
}

function parseLLMResponse(content: string): ImportedTournament {
  // Try to extract JSON from the response, handling potential markdown code blocks
  let jsonStr = content.trim();

  // Strip markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  // Validate required fields
  if (!parsed.title || typeof parsed.title !== "string") {
    throw new Error("Missing or invalid 'title' in LLM response");
  }
  if (!parsed.date || typeof parsed.date !== "string") {
    throw new Error("Missing or invalid 'date' in LLM response");
  }

  return {
    title: parsed.title,
    date: parsed.date,
    startTime: parsed.startTime ?? null,
    location: parsed.location ?? null,
    categoryRequirement: parsed.categoryRequirement ?? null,
    deadline: parsed.deadline ?? null,
    maxParticipants:
      parsed.maxParticipants != null ? Number(parsed.maxParticipants) : null,
    description: parsed.description ?? null,
  };
}

export async function extractFromPdf(
  pdfBuffer: Buffer,
): Promise<ImportedTournament> {
  const text = await extractPdfText(pdfBuffer);

  const response = await chatCompletion([
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: text },
  ]);

  return parseLLMResponse(response.content);
}

export async function extractFromUrl(
  url: string,
): Promise<ImportedTournament> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
  }

  const html = await response.text();
  // Strip HTML tags with a simple regex
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const llmResponse = await chatCompletion([
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: text },
  ]);

  return parseLLMResponse(llmResponse.content);
}
