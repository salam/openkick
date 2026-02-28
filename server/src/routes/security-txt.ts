import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";

export const securityTxtRouter = Router();

function getSetting(key: string): string {
  const db = getDB();
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  return (result[0]?.values[0]?.[0] as string) || "";
}

securityTxtRouter.get("/.well-known/security.txt", (_req: Request, res: Response) => {
  const lines: string[] = [
    "# Security Policy",
    "# This file is dynamically generated. See https://securitytxt.org/",
    "",
  ];

  const email = getSetting("security_contact_email");
  const url = getSetting("security_contact_url");
  if (email) lines.push(`Contact: mailto:${email}`);
  if (url) lines.push(`Contact: ${url}`);

  lines.push("Contact: https://github.com/mho/openkick/security/advisories/new");

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  lines.push(`Expires: ${expires.toISOString()}`);

  const pgp = getSetting("security_pgp_key_url");
  if (pgp) lines.push(`Encryption: ${pgp}`);

  const ack = getSetting("security_acknowledgments_url");
  if (ack) lines.push(`Acknowledgments: ${ack}`);

  const langs = getSetting("security_preferred_languages") || "en, de";
  lines.push(`Preferred-Languages: ${langs}`);

  const canonical = getSetting("security_canonical_url");
  if (canonical) lines.push(`Canonical: ${canonical}`);

  const policy = getSetting("security_policy_url");
  if (policy) lines.push(`Policy: ${policy}`);

  lines.push("");
  res.set("Content-Type", "text/plain; charset=utf-8").send(lines.join("\n"));
});
