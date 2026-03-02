import nodemailer from "nodemailer";
import { getDB } from "../database.js";

function getSetting(key: string): string | undefined {
  const result = getDB().exec(
    "SELECT value FROM settings WHERE key = ?",
    [key],
  );
  return result[0]?.values[0]?.[0] as string | undefined;
}

export interface SmtpConfig {
  host: string | undefined;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  from: string | undefined;
}

export function getSmtpConfig(): SmtpConfig {
  return {
    host: getSetting("smtp_host") || process.env.SMTP_HOST,
    port: Number(getSetting("smtp_port") || process.env.SMTP_PORT || "587"),
    user: getSetting("smtp_user") || process.env.SMTP_USER,
    pass: getSetting("smtp_pass") || process.env.SMTP_PASS,
    from: getSetting("smtp_from") || process.env.SMTP_FROM,
  };
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const { host, port, user, pass, from } = getSmtpConfig();

  if (!host || !user || !pass) {
    throw new Error("SMTP not configured");
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({ from, to, subject, html });
}

/* ── Shared email layout ──────────────────────────────────────── */

interface EmailLayoutOptions {
  lang: string;
  iconHtml: string;
  iconBg: string;
  heading: string;
  bodyHtml: string;
  /** Optional CTA button */
  ctaLabel?: string;
  ctaUrl?: string;
  disclaimer: string;
}

export function wrapEmailLayout(opts: EmailLayoutOptions): string {
  const ctaBlock = opts.ctaUrl && opts.ctaLabel
    ? `<tr><td align="center" style="padding:0 32px;">
        <a href="${opts.ctaUrl}" style="display:inline-block;padding:12px 32px;background:#18181B;color:#FFFFFF;font-size:15px;font-weight:600;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-decoration:none;border-radius:8px;">${opts.ctaLabel}</a>
      </td></tr>
      <tr><td style="height:24px;"></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="${opts.lang}">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:48px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#F4F4F5;">

        <tr><td style="height:48px;"></td></tr>

        <tr>
          <td align="center" style="padding:0 32px;">
            <div style="width:72px;height:72px;border-radius:50%;background:${opts.iconBg};text-align:center;line-height:72px;font-size:36px;">${opts.iconHtml}</div>
          </td>
        </tr>

        <tr><td style="height:24px;"></td></tr>

        <tr>
          <td align="center" style="padding:0 32px;">
            <h1 style="margin:0;font-size:20px;line-height:1.3;color:#18181B;font-weight:700;font-family:Arsenal,Inter,sans-serif;">${opts.heading}</h1>
          </td>
        </tr>

        <tr><td style="height:20px;"></td></tr>

        <tr>
          <td style="padding:0 32px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#71717A;text-align:center;">
              ${opts.bodyHtml}
            </p>
          </td>
        </tr>

        <tr><td style="height:24px;"></td></tr>

        ${ctaBlock}

        <tr>
          <td style="padding:0 32px;">
            <div style="height:1px;background:#E4E4E7;"></div>
          </td>
        </tr>

        <tr><td style="height:20px;"></td></tr>

        <tr>
          <td style="padding:0 32px;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#A1A1AA;text-align:center;">
              ${opts.disclaimer}
            </p>
          </td>
        </tr>

        <tr><td style="height:40px;"></td></tr>

      </table>

      <p style="margin:24px 0 0;font-size:11px;color:#A1A1AA;text-align:center;font-weight:500;">
        Powered by OpenKick
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── Test-email builder with i18n ──────────────────────────────── */

const testEmailStrings: Record<string, { subject: string; heading: string; body: string; disclaimer: string }> = {
  de: {
    subject: "E-Mail-Verbindung erfolgreich",
    heading: "E-Mail erfolgreich verbunden!",
    body: "Dein Verein <strong>{{club}}</strong> ist jetzt mit diesem E-Mail-Konto verbunden. Ab sofort können Einladungen, Erinnerungen und andere Nachrichten automatisch versendet werden.",
    disclaimer: "Falls du diese Nachricht nicht erwartet hast, kannst du sie einfach ignorieren.",
  },
  en: {
    subject: "Email connection successful",
    heading: "Email successfully connected!",
    body: "Your club <strong>{{club}}</strong> is now connected to this email account. From now on, invitations, reminders and other messages can be sent automatically.",
    disclaimer: "If you did not expect this message, you can safely ignore it.",
  },
  fr: {
    subject: "Connexion e-mail reussie",
    heading: "E-mail connecte avec succes !",
    body: "Votre club <strong>{{club}}</strong> est maintenant connecte a ce compte e-mail. Dorenavant, les invitations, rappels et autres messages pourront etre envoyes automatiquement.",
    disclaimer: "Si vous n'attendiez pas ce message, vous pouvez simplement l'ignorer.",
  },
};

export function buildTestEmail(clubName: string, lang: string): { subject: string; html: string } {
  const s = testEmailStrings[lang] || testEmailStrings.de;
  const subject = s.subject + ` — ${clubName}`;

  const html = wrapEmailLayout({
    lang,
    iconHtml: "&#10003;",
    iconBg: "#ECFDF5",
    heading: s.heading,
    bodyHtml: s.body.replace("{{club}}", clubName),
    disclaimer: s.disclaimer,
  });

  return { subject, html };
}

/* ── Password-reset email builder with i18n ────────────────────── */

const resetEmailStrings: Record<string, { subject: string; heading: string; body: string; cta: string; disclaimer: string }> = {
  de: {
    subject: "Passwort zurücksetzen",
    heading: "Passwort zurücksetzen",
    body: "Wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort zu wählen. Der Link ist 1 Stunde gültig.",
    cta: "Passwort zurücksetzen",
    disclaimer: "Falls du diese Anfrage nicht gestellt hast, kannst du diese Nachricht einfach ignorieren.",
  },
  en: {
    subject: "Password Reset",
    heading: "Reset your password",
    body: "We received a request to reset your password. Click the button below to choose a new password. The link is valid for 1 hour.",
    cta: "Reset password",
    disclaimer: "If you did not request this, you can safely ignore this message.",
  },
  fr: {
    subject: "Réinitialisation du mot de passe",
    heading: "Réinitialisez votre mot de passe",
    body: "Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Le lien est valide pendant 1 heure.",
    cta: "Réinitialiser le mot de passe",
    disclaimer: "Si vous n'avez pas fait cette demande, vous pouvez ignorer ce message.",
  },
};

export function buildResetEmail(resetUrl: string, lang: string): { subject: string; html: string } {
  const s = resetEmailStrings[lang] || resetEmailStrings.de;

  const html = wrapEmailLayout({
    lang,
    iconHtml: "&#128274;",
    iconBg: "#FEF3C7",
    heading: s.heading,
    bodyHtml: s.body,
    ctaLabel: s.cta,
    ctaUrl: resetUrl,
    disclaimer: s.disclaimer,
  });

  return { subject: s.subject, html };
}

/* ── Invite email builder with i18n ────────────────────────────── */

const inviteEmailStrings: Record<string, { subject: string; heading: string; body: string; cta: string; disclaimer: string }> = {
  de: {
    subject: "Du wurdest zu OpenKick eingeladen",
    heading: "Du wurdest eingeladen!",
    body: "Hallo <strong>{{name}}</strong>, du wurdest als <strong>{{role}}</strong> eingeladen. Klicke auf den Button unten, um dein Passwort festzulegen und loszulegen.",
    cta: "Passwort festlegen",
    disclaimer: "Falls du diese Einladung nicht erwartet hast, kannst du diese Nachricht einfach ignorieren.",
  },
  en: {
    subject: "You've been invited to OpenKick",
    heading: "You've been invited!",
    body: "Hi <strong>{{name}}</strong>, you've been invited as a <strong>{{role}}</strong>. Click the button below to set your password and get started.",
    cta: "Set password",
    disclaimer: "If you did not expect this invitation, you can safely ignore this message.",
  },
  fr: {
    subject: "Vous avez été invité(e) sur OpenKick",
    heading: "Vous avez été invité(e) !",
    body: "Bonjour <strong>{{name}}</strong>, vous avez été invité(e) en tant que <strong>{{role}}</strong>. Cliquez sur le bouton ci-dessous pour définir votre mot de passe et commencer.",
    cta: "Définir le mot de passe",
    disclaimer: "Si vous n'attendiez pas cette invitation, vous pouvez ignorer ce message.",
  },
};

export function buildInviteEmail(name: string, role: string, resetUrl: string, lang: string): { subject: string; html: string } {
  const s = inviteEmailStrings[lang] || inviteEmailStrings.de;

  const html = wrapEmailLayout({
    lang,
    iconHtml: "&#9993;",
    iconBg: "#EFF6FF",
    heading: s.heading,
    bodyHtml: s.body.replace("{{name}}", name).replace("{{role}}", role),
    ctaLabel: s.cta,
    ctaUrl: resetUrl,
    disclaimer: s.disclaimer,
  });

  return { subject: s.subject, html };
}
