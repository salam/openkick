import { describe, it, expect } from "vitest";
import { t } from "../i18n.js";

describe("i18n", () => {
  it("t('welcome', 'de') returns German welcome string", () => {
    expect(t("welcome", "de")).toBe("Willkommen bei OpenKick!");
  });

  it("t('welcome', 'en') returns English welcome string", () => {
    expect(t("welcome", "en")).toBe("Welcome to OpenKick!");
  });

  it("t('welcome', 'fr') returns French welcome string", () => {
    expect(t("welcome", "fr")).toBe("Bienvenue sur OpenKick!");
  });

  it("t('nonexistent_key', 'de') returns the key itself as fallback", () => {
    expect(t("nonexistent_key", "de")).toBe("nonexistent_key");
  });

  it("t('welcome') with no lang defaults to 'de'", () => {
    expect(t("welcome")).toBe("Willkommen bei OpenKick!");
  });

  it("t('attendance_confirmed', 'en', { name: 'Luca' }) does string interpolation", () => {
    expect(t("attendance_confirmed", "en", { name: "Luca" })).toBe(
      "Luca is marked as attending."
    );
  });

  it("t('attendance_confirmed', 'de', { name: 'Luca' }) does string interpolation in German", () => {
    expect(t("attendance_confirmed", "de", { name: "Luca" })).toBe(
      "Luca ist als anwesend markiert."
    );
  });

  it("t('reminder', 'fr', { event: 'Training' }) does string interpolation in French", () => {
    expect(t("reminder", "fr", { event: "Training" })).toBe(
      "Rappel : Merci de t'inscrire pour Training."
    );
  });

  it("handles multiple placeholders", () => {
    expect(
      t("deadline_approaching", "en", { event: "Training", date: "Friday" })
    ).toBe("Registration deadline for Training ends on Friday.");
  });
});
