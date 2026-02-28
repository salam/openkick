import de from "./translations/de.js";
import en from "./translations/en.js";
import fr from "./translations/fr.js";

const translations: Record<string, Record<string, string>> = {
  de,
  en,
  fr,
};

export function t(
  key: string,
  lang: string = "de",
  params?: Record<string, string>
): string {
  const dict = translations[lang];
  let value = dict?.[key] ?? key;

  if (params) {
    for (const [param, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{{${param}}}`, replacement);
    }
  }

  return value;
}
