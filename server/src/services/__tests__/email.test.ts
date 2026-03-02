import { describe, it, expect } from "vitest";
import { buildTestEmail, buildResetEmail, buildInviteEmail, wrapEmailLayout } from "../email.js";

describe("buildTestEmail", () => {
  it("returns German content by default", () => {
    const { subject, html } = buildTestEmail("FC Muster", "de");
    expect(subject).toContain("FC Muster");
    expect(subject).toContain("E-Mail-Verbindung erfolgreich");
    expect(html).toContain("FC Muster");
    expect(html).toContain("erfolgreich verbunden");
    expect(html).toContain('lang="de"');
  });

  it("returns English content when lang is en", () => {
    const { subject, html } = buildTestEmail("My Club", "en");
    expect(subject).toContain("Email connection successful");
    expect(html).toContain("successfully connected");
    expect(html).toContain("safely ignore");
    expect(html).toContain('lang="en"');
  });

  it("returns French content when lang is fr", () => {
    const { subject, html } = buildTestEmail("Mon Club", "fr");
    expect(subject).toContain("Connexion e-mail reussie");
    expect(html).toContain("connecte avec succes");
    expect(html).toContain('lang="fr"');
  });

  it("falls back to German for unknown language", () => {
    const { subject, html } = buildTestEmail("Club X", "xx");
    expect(subject).toContain("E-Mail-Verbindung erfolgreich");
    expect(html).toContain("erfolgreich verbunden");
  });

  it("includes Powered by OpenKick footer", () => {
    const { html } = buildTestEmail("FC Test", "en");
    expect(html).toContain("Powered by OpenKick");
  });

  it("includes disclaimer text", () => {
    const { html } = buildTestEmail("FC Test", "de");
    expect(html).toContain("ignorieren");
  });
});

describe("wrapEmailLayout", () => {
  it("produces a full HTML document with the shared structure", () => {
    const html = wrapEmailLayout({
      lang: "en",
      iconHtml: "&#9733;",
      iconBg: "#EEE",
      heading: "Test Heading",
      bodyHtml: "Test body content",
      disclaimer: "Test disclaimer",
    });
    expect(html).toContain('lang="en"');
    expect(html).toContain("Test Heading");
    expect(html).toContain("Test body content");
    expect(html).toContain("Test disclaimer");
    expect(html).toContain("Powered by OpenKick");
    expect(html).toContain("&#9733;");
  });

  it("includes CTA button when ctaUrl and ctaLabel are provided", () => {
    const html = wrapEmailLayout({
      lang: "de",
      iconHtml: "!",
      iconBg: "#FFF",
      heading: "H",
      bodyHtml: "B",
      ctaLabel: "Click Me",
      ctaUrl: "https://example.com/action",
      disclaimer: "D",
    });
    expect(html).toContain("Click Me");
    expect(html).toContain("https://example.com/action");
  });

  it("omits CTA button when ctaUrl is not provided", () => {
    const html = wrapEmailLayout({
      lang: "de",
      iconHtml: "!",
      iconBg: "#FFF",
      heading: "H",
      bodyHtml: "B",
      disclaimer: "D",
    });
    expect(html).not.toContain("display:inline-block;padding:12px 32px");
  });
});

describe("buildResetEmail", () => {
  it("returns German reset email by default", () => {
    const { subject, html } = buildResetEmail("https://example.com/reset/abc", "de");
    expect(subject).toContain("Passwort");
    expect(html).toContain("https://example.com/reset/abc");
    expect(html).toContain("Passwort zurücksetzen");
    expect(html).toContain('lang="de"');
    expect(html).toContain("Powered by OpenKick");
  });

  it("returns English reset email", () => {
    const { subject, html } = buildResetEmail("https://example.com/reset/abc", "en");
    expect(subject).toBe("Password Reset");
    expect(html).toContain("Reset your password");
    expect(html).toContain("Reset password");
    expect(html).toContain('lang="en"');
  });

  it("returns French reset email", () => {
    const { subject, html } = buildResetEmail("https://example.com/reset/abc", "fr");
    expect(subject).toContain("mot de passe");
    expect(html).toContain("Réinitialisez votre mot de passe");
    expect(html).toContain('lang="fr"');
  });

  it("falls back to German for unknown language", () => {
    const { subject } = buildResetEmail("https://example.com/reset/abc", "xx");
    expect(subject).toContain("Passwort");
  });
});

describe("buildInviteEmail", () => {
  it("returns German invite email by default", () => {
    const { subject, html } = buildInviteEmail("Max", "coach", "https://example.com/reset/abc", "de");
    expect(subject).toContain("eingeladen");
    expect(html).toContain("Max");
    expect(html).toContain("coach");
    expect(html).toContain("https://example.com/reset/abc");
    expect(html).toContain("Passwort festlegen");
    expect(html).toContain('lang="de"');
    expect(html).toContain("Powered by OpenKick");
  });

  it("returns English invite email", () => {
    const { subject, html } = buildInviteEmail("Jane", "admin", "https://example.com/reset/abc", "en");
    expect(subject).toBe("You've been invited to OpenKick");
    expect(html).toContain("Jane");
    expect(html).toContain("admin");
    expect(html).toContain("Set password");
    expect(html).toContain('lang="en"');
  });

  it("returns French invite email", () => {
    const { subject, html } = buildInviteEmail("Marie", "coach", "https://example.com/reset/abc", "fr");
    expect(subject).toContain("invité");
    expect(html).toContain("Marie");
    expect(html).toContain('lang="fr"');
  });

  it("falls back to German for unknown language", () => {
    const { subject } = buildInviteEmail("X", "coach", "https://example.com/reset/abc", "xx");
    expect(subject).toContain("eingeladen");
  });
});
