# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

We take the security of OpenKick seriously. If you discover a vulnerability, please report it responsibly.

### How to report

1. **GitHub Security Advisories (preferred):** Open a [private security advisory](https://github.com/your-org/openkick/security/advisories/new). This keeps the report confidential until a fix is released.
2. **Email:** Send details to `security@openkick.example.com`. Encrypt with our PGP key if possible (see `public/.well-known/pgp-key.txt`).

### What to include

- A description of the vulnerability and its impact
- Steps to reproduce or a proof-of-concept
- Affected version(s)
- Any suggested fix (optional but appreciated)

### What to expect

- **Acknowledgment** within 48 hours
- **Triage and severity assessment** within 5 business days
- **Fix timeline** communicated once the issue is confirmed
- **Credit** in the release notes and acknowledgments section (unless you prefer to stay anonymous)

### Please do NOT

- Open a public GitHub issue for security vulnerabilities
- Access, modify, or delete data belonging to other users
- Perform denial-of-service attacks against production systems

## Security Design Principles

OpenKick follows these core principles:

- **Zero-trust data exposure:** PII (phone numbers, emails) is write-only — never displayed in chats, the web UI, API responses, or logs. Only admins with a verified strong password may view unmasked PII.
- **Strong admin passwords:** Admin accounts must use passwords that are at least 12 characters, mixed case, with digits and special characters, and not found in common-password lists. Password strength is re-evaluated on every login.
- **Minimal data collection:** Only the child's name/nickname and parent's phone number are stored.
- **Self-hosted by default:** All data stays on the club's server; nothing is sent to third parties.
- **Daily automated audits:** A cron-based data protection analysis script (`tools/data-protection-audit.sh`) probes the deployment for misconfigurations daily.
- **Dev-time security scanning:** `tools/security-audit.sh` checks for hardcoded secrets, dependency vulnerabilities, insecure code patterns, and more during development and CI.

## Acknowledgments

We gratefully thank the following individuals for responsibly disclosing security issues:

*No reports yet — be the first!*
