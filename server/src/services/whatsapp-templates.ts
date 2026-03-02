import { getDB } from "../database.js";
import { t } from "../utils/i18n.js";

/**
 * Resolve a bot message template by key.
 *
 * 1. Queries the `settings` table for `bot_template_<key>`.
 * 2. If a custom template exists, interpolates `{{var}}` placeholders with
 *    the supplied params and returns the result.
 * 3. If no custom template is found, falls back to the built-in i18n system
 *    via `t(key, lang, params)`.
 */
export function getBotTemplate(
  key: string,
  lang: string = "de",
  params?: Record<string, string>,
): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [
    `bot_template_${key}`,
  ]);
  const customTemplate = result[0]?.values[0]?.[0] as string | undefined;

  if (customTemplate) {
    let value = customTemplate;
    if (params) {
      for (const [param, replacement] of Object.entries(params)) {
        value = value.replaceAll(`{{${param}}}`, replacement);
      }
    }
    return value;
  }

  // Fall back to the built-in i18n translation
  return t(key, lang, params);
}
