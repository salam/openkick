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
