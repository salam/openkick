import { describe, it, expect } from "vitest";
import { t } from "../../utils/i18n.js";

describe("whatsapp i18n keys", () => {
  const keys = [
    "whatsapp_welcome",
    "whatsapp_onboarding_ask_name",
    "whatsapp_onboarding_ask_child",
    "whatsapp_onboarding_ask_birthyear",
    "whatsapp_onboarding_ask_consent",
    "whatsapp_onboarding_no_match",
    "whatsapp_onboarding_birthyear_mismatch",
    "whatsapp_onboarding_consent_declined",
    "whatsapp_onboarding_complete",
    "whatsapp_confirm_attending",
    "whatsapp_confirm_absent",
    "whatsapp_confirm_waitlist",
    "whatsapp_disambiguate",
    "whatsapp_help",
    "whatsapp_reminder_with_link",
  ];

  for (const key of keys) {
    it("has DE translation for " + key, () => {
      const result = t(key, "de");
      expect(result).not.toBe(key);
    });

    it("has EN translation for " + key, () => {
      const result = t(key, "en");
      expect(result).not.toBe(key);
    });
  }
});
