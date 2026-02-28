import { chatCompletion } from "./llm.js";
import { getDB } from "../database.js";

export interface ImportedResults {
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  achievements: { type: string; label: string }[];
}

function getClubName(): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = 'club_name'");
  if (result.length === 0 || result[0].values.length === 0) return "My Club";
  return result[0].values[0][0] as string;
}

function getTeamIdentifier(eventId: number): string {
  const db = getDB();
  const rows = db.exec("SELECT teamName, title FROM events WHERE id = ?", [eventId]);
  if (rows.length === 0 || rows[0].values.length === 0) return getClubName();
  const teamName = rows[0].values[0][0] as string | null;
  return teamName || getClubName();
}

const EXTRACTION_PROMPT = `Extract tournament results from the following page content.
Look for results of the team whose name contains the search term provided.
Use wildcard / partial matching — the team name on the page may differ slightly.

Return JSON with these fields:
- placement: final ranking as integer (or null if unclear)
- totalTeams: total number of teams in the tournament as integer (or null)
- summary: 2-3 sentence summary of highlights, key match results (or null)
- achievements: array of awards/trophies won, each with "type" and "label".
  Valid types: "1st_place", "2nd_place", "3rd_place", "fair_play", "best_player", "custom".
  Use "custom" for any award not in the predefined list.

Return only the JSON object, no other text.`;

export function parseResultsResponse(content: string): ImportedResults {
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }
  const parsed = JSON.parse(jsonStr);
  return {
    placement: parsed.placement != null ? Number(parsed.placement) : null,
    totalTeams: parsed.totalTeams != null ? Number(parsed.totalTeams) : null,
    summary: parsed.summary ?? null,
    achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
  };
}

export async function importResultsFromUrl(
  eventId: number,
  url: string
): Promise<ImportedResults> {
  const teamName = getTeamIdentifier(eventId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
  }
  const html = await response.text();
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const llmResponse = await chatCompletion([
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: `Team to find (use partial/wildcard matching): %${teamName}%\n\nPage content:\n${text}` },
  ]);
  return parseResultsResponse(llmResponse.content);
}
