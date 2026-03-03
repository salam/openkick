import { getDB, getLastInsertId } from "../database.js";
import { generateAccessToken } from "../auth.js";
import { sendMessage } from "./whatsapp.js";
import {
  getOrCreateSession,
  updateSessionState,
  resetSession,
} from "./whatsapp-session.js";
import { getBotTemplate } from "./whatsapp-templates.js";

/**
 * Handle the multi-step WhatsApp onboarding flow for unknown phone numbers.
 *
 * States: onboarding_name -> onboarding_child -> onboarding_birthyear -> onboarding_consent -> idle
 */
export async function handleOnboarding(
  phone: string,
  text: string,
  lang: string,
): Promise<void> {
  const session = getOrCreateSession(phone);
  const context: Record<string, unknown> = session.context
    ? JSON.parse(session.context)
    : {};

  switch (session.state) {
    case "onboarding_name":
      await handleName(phone, text, lang, context);
      break;
    case "onboarding_child":
      await handleChild(phone, text, lang, context);
      break;
    case "onboarding_birthyear":
      await handleBirthYear(phone, text, lang, context);
      break;
    case "onboarding_consent":
      await handleConsent(phone, text, lang, context);
      break;
    default:
      break;
  }
}

// Step 1: Collect guardian name, advance to child matching
async function handleName(
  phone: string,
  text: string,
  lang: string,
  context: Record<string, unknown>,
): Promise<void> {
  context.guardianName = text;
  updateSessionState(phone, "onboarding_child", context);
  await sendMessage(phone, getBotTemplate("whatsapp_onboarding_ask_child", lang));
}

// Step 2: Match the child name against the players table
async function handleChild(
  phone: string,
  text: string,
  lang: string,
  context: Record<string, unknown>,
): Promise<void> {
  const db = getDB();
  // Try exact match first, then partial (first name) match
  let result = db.exec(
    "SELECT id, name, yearOfBirth FROM players WHERE LOWER(name) = LOWER(?)",
    [text],
  );

  if (result.length === 0 || result[0].values.length === 0) {
    result = db.exec(
      "SELECT id, name, yearOfBirth FROM players WHERE LOWER(name) LIKE LOWER(?) || ' %'",
      [text],
    );
  }

  if (result.length === 0 || result[0].values.length === 0) {
    await sendMessage(phone, getBotTemplate("whatsapp_onboarding_no_match", lang));
    resetSession(phone);
    return;
  }

  const row = result[0].values[0];
  const playerId = row[0] as number;
  const childName = row[1] as string;

  context.childName = childName;
  context.playerId = playerId;
  updateSessionState(phone, "onboarding_birthyear", context);
  await sendMessage(
    phone,
    getBotTemplate("whatsapp_onboarding_ask_birthyear", lang, { childName }),
  );
}

// Step 3: Verify birth year as a security check
async function handleBirthYear(
  phone: string,
  text: string,
  lang: string,
  context: Record<string, unknown>,
): Promise<void> {
  const enteredYear = parseInt(text, 10);
  const playerId = context.playerId as number;

  const db = getDB();
  const result = db.exec(
    "SELECT yearOfBirth FROM players WHERE id = ?",
    [playerId],
  );

  const actualYear = result[0]?.values[0]?.[0] as number;

  if (enteredYear === actualYear) {
    updateSessionState(phone, "onboarding_consent", context);
    await sendMessage(phone, getBotTemplate("whatsapp_onboarding_ask_consent", lang));
    return;
  }

  // Wrong year — track attempts
  const attempts = ((context.birthYearAttempts as number) ?? 0) + 1;
  context.birthYearAttempts = attempts;

  if (attempts >= 2) {
    await sendMessage(phone, getBotTemplate("whatsapp_onboarding_birthyear_mismatch", lang));
    resetSession(phone);
    return;
  }

  updateSessionState(phone, "onboarding_birthyear", context);
  await sendMessage(phone, getBotTemplate("whatsapp_onboarding_birthyear_mismatch", lang));
}

// Step 4: Collect consent and create guardian + link
async function handleConsent(
  phone: string,
  text: string,
  lang: string,
  context: Record<string, unknown>,
): Promise<void> {
  const affirmative = /^(ja|yes|si|oui)$/i;

  if (affirmative.test(text.trim())) {
    const db = getDB();
    const accessToken = generateAccessToken();
    const guardianName = context.guardianName as string;
    const playerId = context.playerId as number;
    const childName = context.childName as string;

    // Reuse existing guardian if phone already registered
    const existingResult = db.exec("SELECT id FROM guardians WHERE phone = ?", [phone]);
    let guardianId: number;

    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      guardianId = existingResult[0].values[0][0] as number;
    } else {
      db.run(
        `INSERT INTO guardians (name, phone, role, accessToken, consentGiven, language)
         VALUES (?, ?, 'parent', ?, 1, ?)`,
        [guardianName, phone, accessToken, lang],
      );
      guardianId = getLastInsertId();
    }

    db.run(
      "INSERT OR IGNORE INTO guardian_players (guardianId, playerId) VALUES (?, ?)",
      [guardianId, playerId],
    );

    resetSession(phone);
    await sendMessage(
      phone,
      getBotTemplate("whatsapp_onboarding_complete", lang, { childName }),
    );
  } else {
    await sendMessage(phone, getBotTemplate("whatsapp_onboarding_consent_declined", lang));
    resetSession(phone);
  }
}
