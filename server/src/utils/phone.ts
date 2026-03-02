import { getDB } from "../database.js";

/**
 * Normalize a phone number to the format WAHA uses: country code + number, no prefix.
 * Examples:
 *   "+41 76 561 29 00" → "41765612900"
 *   "0041765612900"    → "41765612900"
 *   "076 561 29 00"    → "41765612900"  (with default country code "41")
 *   "41765612900"      → "41765612900"
 *
 * @param raw            The raw phone number input
 * @param countryCode    Default country code to prepend when a local number (leading 0) is detected.
 *                       Falls back to the `default_country_code` setting, then "41" (Switzerland).
 */
export function normalizePhone(raw: string, countryCode?: string): string {
  // 1. Strip whitespace, dashes, parentheses
  let phone = raw.replace(/[\s\-()]/g, "");
  // 2. Strip leading +
  phone = phone.replace(/^\+/, "");
  // 3. Strip leading 00 (international dialling prefix)
  phone = phone.replace(/^00/, "");
  // 4. Convert local format (leading 0) to international
  if (phone.startsWith("0")) {
    const cc = countryCode ?? getDefaultCountryCode();
    phone = cc + phone.slice(1);
  }
  return phone;
}

/**
 * Read the default_country_code setting from the database, falling back to "41" (Switzerland).
 */
function getDefaultCountryCode(): string {
  try {
    const db = getDB();
    const result = db.exec(
      "SELECT value FROM settings WHERE key = 'default_country_code'",
    );
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as string;
    }
  } catch {
    // DB not available — use default
  }
  return "41";
}
