<p align="center">
  <img src="./design/logo.svg" alt="OpenKick" width="200" />
</p>

<h1 align="center">OpenKick</h1>

<p align="center">
  <strong>Self-hosted attendance and tournament management for youth football clubs</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#contributing">Contributing</a> &middot;
  <a href="#license">License</a>
</p>

---

OpenKick replaces scattered WhatsApp threads with a lightweight, privacy-first system that coaches and parents actually want to use. Parents keep sending casual WhatsApp messages — OpenKick understands them, updates attendance, and keeps everyone in the loop.

## Why OpenKick?

Existing tools (Spond, Teamy, TeamSnap) require app installs, accounts, and collect far more data than a youth club needs. OpenKick takes a different approach:

- **No app to install.** Parents text on WhatsApp like they already do.
- **Minimal data.** Only a child's name and a phone number. Nothing more.
- **Self-hosted.** Your data stays on your server. Full control, no vendor lock-in.
- **Open source.** Inspect, modify, and extend it to fit your club.

## Features

### Attendance tracking
- Understands free-form WhatsApp messages ("Luca is sick", "late today", "not coming")
- One-click availability via quick-reply buttons or a mobile-friendly web page
- Automatic reminders for parents who haven't responded
- Attendance history and statistics for coaches

### Tournament management
- Create tournaments with deadlines, participant limits, and attached PDFs
- Registration via WhatsApp or web — share a link in the group chat
- Automatic wait-list when slots fill up
- Alerts when registrations are too few or too many

### Team formation
- Automatic team assignment based on age, position, or custom rules
- Coaches can review and adjust before publishing

### Communication
- Confirmation messages after every sign-up or cancellation
- Scheduled reminders before deadlines and match days
- Broadcast messages to all parents

### Onboarding
- Parents join by scanning a QR code or clicking a link
- The bot asks for the child's name — done

## Architecture

OpenKick is built from proven open-source components:

| Layer | Component | Role |
|---|---|---|
| WhatsApp API | [WAHA](https://waha.devlike.pro/) | Send and receive WhatsApp messages via REST |
| Chatbot | [BuilderBot](https://www.builderbot.app/) | Parse messages, manage conversation flows |
| Workflows | [n8n](https://n8n.io/) | Orchestrate reminders, deadlines, notifications |
| Web app | React / Vue + Node.js | Dashboard for coaches, event pages for parents |
| Database | PostgreSQL / SQLite | Events, players, attendance records |
| Deployment | Docker Compose | Single command to run the full stack |

## Getting Started

> OpenKick is in early development. Instructions will be updated as the project matures.

### Prerequisites

- Docker and Docker Compose
- A WhatsApp number for the bot

### Quick start

```bash
git clone https://github.com/your-org/openkick.git
cd openkick
cp .env.example .env   # configure your WhatsApp number and settings
docker compose up
```

Open `http://localhost:3000` to access the coach dashboard. Scan the QR code to connect your WhatsApp number.

## Contributing

Contributions are welcome. Whether it's a bug report, feature idea, or pull request — every bit helps.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Open a pull request

Please keep PRs focused and atomic. See [CONTRIBUTING.md](CONTRIBUTING.md) for details (coming soon).

## Privacy

OpenKick is designed for minimal data collection:

- Only stores child name/nickname and parent phone number
- No email, no payment data, no tracking
- All data stays on your server
- Parents can request deletion at any time
- Built with Swiss/EU data protection regulations in mind

## Security

Security is a first-class concern. OpenKick follows a **zero-trust data exposure** model — personal data (phone numbers, emails) is write-only and never displayed in chats, the web UI, or API responses unless you are an admin with a verified strong password.

### For developers

Run the security audit during development:

```bash
./tools/security-audit.sh          # full audit
./tools/security-audit.sh --quick  # fast subset for CI
```

This checks for hardcoded secrets, dependency vulnerabilities, SQL injection patterns, insecure CORS, file permissions, and more.

### Reporting vulnerabilities

**Found a security issue? Please report it responsibly.**

- **Preferred:** Open a [private security advisory](https://github.com/your-org/openkick/security/advisories/new)
- **Email:** `security@openkick.example.com`
- **Do NOT** open a public GitHub issue for security vulnerabilities

We acknowledge reports within 48 hours and credit reporters in our release notes. See [SECURITY.md](SECURITY.md) for full details and our [security.txt](public/.well-known/security.txt) for machine-readable disclosure info.

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built for the love of the game.
</p>
