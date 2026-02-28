# Attendance and Tournament Management Solutions for a Youth Football Club

## 1. Existing Tools (Commercial SaaS)

Several commercial sports-team management platforms already provide attendance tracking and event-management functions. The most popular tools are aimed at general sports teams rather than specifically at amateur youth football clubs, but many features align with the club's needs.

| Tool & Company | Relevant Features | Evidence |
|---|---|---|
| **Teamy** (Teamy B.V.) | Mobile and web app focused on attendance registration. Players (or parents) can indicate availability with one click, updates are visible immediately, coaches see who is available for the next match or training, and the administrator can configure notifications and reminders[1]. It can require a reason for absence and allows setting the start time, deadline, and participant limit for an event[2]. Events can be shared via WhatsApp, Signal or similar apps[3]. | The Teamy help page describes these functions[4]. |
| **Spond** (Spond AS) | Admins can create matches or events with a start time, location and desired attendance time[5]; tasks (e.g., "bring food", "drive players") can be assigned to participants[6]; default response status can automatically enrol invitees for recurring events (they only opt-out when absent)[7]; automatic reminders can be sent to participants who haven't responded[8]; PDFs and other files can be attached to events[9]; a registration deadline can be configured[10] and a maximum number of participants can be set, creating a waiting list when the limit is reached[11]. Inviting members is done by sending a group link, which can be shared via SMS, email, Facebook or WhatsApp[12]. | These functions are documented in Spond's help articles[5][7][12]. |
| **Save This Date / RSVP by WhatsApp** | Lets organisers share an event page via WhatsApp and collect RSVPs in one place; guests receive a WhatsApp message pointing to the event page and submit their response in seconds[13]. It avoids scrolling through chats by providing a single RSVP link[14]. It supports private invitations or public registration links that can be shared in WhatsApp groups[15]. | Save This Date's guide describes the WhatsApp RSVP flow[13] and the two registration modes[15]. |
| **Cal.com (open-source scheduling)** | Open-source calendar-scheduling platform. Integrates with WhatsApp by allowing WhatsApp to be set as the meeting location; users install the WhatsApp app from Cal.com's app store and choose WhatsApp as the meeting location for a booking[16]. The company emphasises that Cal.com is open source and accessible[17]. | Cal.com's blog notes that its product is open source and that users can select WhatsApp as a meeting location after installing the relevant app[16]. |
| **SportMember, TeamSnap, SportsEngine, Stack Team App, InstaTeam etc.** | Comprehensive club management: event scheduling, attendance tracking, member registration, payments and communications. Generally require users to sign up through mobile apps or websites. Some (e.g., SportMember) send notifications via e-mail, push messages, SMS or WhatsApp[18] but do not allow unstructured WhatsApp sign-ups. | Example from SportMember: the sign-up page asks users to accept digital communications via e-mail, push messages, SMS or WhatsApp[18]. |

### Limitations Relative to the Club's Needs

- **Requires structured sign-ups or app accounts:** Existing tools expect parents to use the app or sign in through a web interface. They do not parse free-form WhatsApp messages and automatically update attendance.
- **Data-heavy:** Commercial platforms collect personal data (e.g., names, e-mail addresses, phone numbers, sometimes payment details) and often require user registration; this may exceed the minimal-data approach requested.
- **Limited control:** SaaS offerings are closed-source; clubs have little control over data storage or custom workflows.
- **Cost:** While some tools have free tiers, full functionality (e.g., tournament management, unlimited members) often requires paid plans.

## 2. Open-Source or Self-Hosted Tools

No complete open-source solution exists specifically for managing youth football attendance via WhatsApp, but several components can be combined to build a custom system.

| Component | Purpose | Evidence |
|---|---|---|
| **WAHA - WhatsApp HTTP API** (self-hosted) | Self-hosted WhatsApp API that runs an instance of WhatsApp Web on your server. You start WAHA, scan a QR code to pair a WhatsApp number and then interact via an HTTP/REST API[19]. The core version is free and unlimited[20] and designed to be run on your own server[21]. It allows sending and receiving messages, including text, images, videos and voice notes[22]. | WAHA's website explains that it is a free, open-source, self-hosted WhatsApp API and describes how to run it and use its REST API[19][22]. |
| **BuilderBot** (open-source WhatsApp chatbot framework) | Free and open-source framework for creating chatbots that connect to messaging channels such as WhatsApp and Telegram[23]. It provides a modular structure and examples for responding to keywords, sending messages, and integrating flows[24]. | The BuilderBot documentation states that it is an open-source framework that allows developers to build chatbots for WhatsApp[23]. |
| **n8n workflows** (open-source automation) | Open-source, self-hosted workflow automation tool. A pre-built template for "Student absence alerts via email & WhatsApp" demonstrates how to retrieve attendance from a database, identify absent students and send notifications via email and WhatsApp using an API[25]. The workflow sends WhatsApp messages through an API like Facebook Graph or Twilio[26]. | The n8n template page explains that the workflow reads attendance records, prepares messages and sends them via WhatsApp API[25]. |
| **Open-source event planners (e.g., Gath.io)** | Gath.io (self-hosted) manages events and RSVPs via e-mail and link-based registration; it can be self-hosted. However, it does not natively integrate with WhatsApp and would need bridging via WAHA or a chatbot. | Community discussions mention gath.io as a self-hosted event planner with RSVP management. |
| **Cal.com** | While primarily for scheduling meetings, Cal.com is open-source and supports WhatsApp as a meeting location[16]. Clubs could create simple booking links for tournaments or training sessions. | Cal.com's blog notes that the product is open source and the WhatsApp app can be selected as a meeting location[16]. |

### Summary

- There is no ready-made open-source tool tailored to youth sports attendance via WhatsApp.
- WAHA provides the technical foundation for receiving and sending WhatsApp messages without relying on proprietary SaaS.
- Combining WAHA with a chatbot framework (BuilderBot) and automation platform (n8n) would allow the club to parse free-form messages, update a database, and send confirmations or reminders.
- Additional open-source tools (Cal.com, gath.io) can handle scheduling or RSVP pages.

## 3. Recommended Features for a New Tool

If existing solutions do not fully satisfy the club's requirements, a bespoke system could provide the following features:

- **Free-form WhatsApp sign-ups:** A dedicated WhatsApp number automatically recognises keywords or patterns in parents' messages (e.g., "Luca sick", "Luca + tournament") and updates attendance. It should also accept attachments like medical notes or tournament PDFs.
- **Interactive chat:** For parents who prefer a structured flow, the chatbot can respond with quick-reply buttons (e.g., "Attend", "Absent", "Next tournament") or share a link to a responsive web form.
- **Web interface (responsive):** Coaches and parents can view upcoming trainings and tournaments, see attendance lists, join/withdraw from events, and upload documents. Minimal personal data (child name or initials) should be stored.
- **Calendar & deadlines:** Each event should have a date, start time, attendance time, registration deadline and maximum participant limit (with automatic wait-list). Spond's features such as automatic reminders[8], registration deadlines[10] and waiting lists[11] provide a good model.
- **Team formation:** For tournaments, the tool should assign registered players to teams automatically (e.g., balancing positions and numbers) and notify coaches when there are too few or too many participants.
- **Notifications & reminders:** Send automatic WhatsApp reminders to parents who haven't responded and confirmations when their child's status changes. Additional notifications can be sent via e-mail or push messages.
- **Document uploads:** Allow coaches to attach PDF tournament invitations or rules to the event; parents can download them. Spond supports attachments up to 100 MB[9].
- **Minimal data & privacy:** Collect only necessary information (child's name or nickname and parent's phone number). Provide consent screens and comply with Swiss/EU privacy regulations.
- **Admin dashboard:** Coaches can create events, see attendance statistics, manage teams, and export data. The system should highlight players on waiting lists or with repeated absences.
- **Easy onboarding:** New parents can join by scanning a QR code or clicking a group link (similar to Spond's group invitation via WhatsApp[12]). The chatbot could ask for the child's name during the first interaction.
- **Modular & self-hosted:** Use open-source components (WAHA, BuilderBot, n8n) to allow local hosting and avoid dependence on SaaS. The system should be modular so additional features (e.g., payments) can be added later.

## 4. Product Requirements Document (PRD)

### 4.1 Purpose & Background

Parents currently notify coaches about training attendance and tournament participation via unstructured WhatsApp messages. The process is time-consuming and makes it hard to track who is available. Coaches need a lightweight tool that preserves the simplicity of WhatsApp communication while adding structure and automation. No existing product fully meets the club's requirements; therefore, this project aims to design a self-hosted, privacy-conscious solution.

### 4.2 Goals & Objectives

- **Reduce administrative workload:** automate collection of attendance replies and tournament registrations.
- **Increase transparency:** provide coaches with an up-to-date overview of who is attending trainings and tournaments.
- **Keep parents' workflow simple:** allow parents to continue sending casual WhatsApp messages while offering a structured web/chat interface for those who prefer it.
- **Minimize personal data:** only store essential information (child's name, year of birth, parent's phone number).
- **Enable self-hosting:** use open-source components to ensure data ownership and adaptability.

### 4.3 User Personas

| Persona | Description & Needs |
|---|---|
| **Parent/Guardian** | Wants to notify the coach quickly when a child will attend or miss training/tournaments. Prefers to use WhatsApp; may not install another app. Needs confirmation that the message was received. |
| **Coach/Trainer** | Manages weekly trainings and multiple tournaments. Needs a simple dashboard to see attendance lists, send reminders and form teams. |
| **Club Administrator** | Oversees multiple teams. Needs tools to create events, manage user accounts and ensure compliance with data privacy regulations. |

### 4.4 User Stories

- **As a parent**, I want to send a WhatsApp message ("Johnny is sick") and receive confirmation that my child is marked as absent so I don't worry about missing training.
- **As a parent**, I want a link where I can sign my child up for a tournament and see deadlines and available slots.
- **As a coach**, I want a dashboard showing who is attending upcoming sessions, with filters for age groups and attendance history.
- **As a coach**, I want to be alerted when the number of tournament registrations is below the minimum required or above the maximum so I can recruit or split teams.
- **As an administrator**, I want to add new events (trainings, friendly matches, tournaments) quickly, set deadlines and maximum participants, and attach PDF invitations or rules.
- **As a club administrator**, I want to export attendance data for insurance or reporting purposes while ensuring it is anonymised.

### 4.5 Scope & Features

#### 4.5.1 Attendance Management

- **WhatsApp interaction:** Use WAHA's API[19] and a chatbot framework (e.g., BuilderBot[23]) to listen for messages. Parse free-form text (e.g., "late", "not coming", "is sick") and update the attendance status. Provide quick-reply buttons for structured responses.
- **Web interface:** A responsive site where parents can indicate "Participating" or "Absent" for each training session; mimic Teamy's one-click availability[1].
- **Name-entry-first web flow (privacy mode):** By default, the web interface does **not** display a list of children's names. Instead, the parent enters their child's name into a search field. If the name is found, the parent proceeds to the guided interaction (mark attendance, register for tournaments, fill surveys). If not found, the system offers onboarding. This prevents casual visitors from seeing who is in the club. Coaches can optionally enable a "show player list" mode in club settings, but it is **off by default**.
- **Automatic reminders:** Send WhatsApp reminders to non-responding parents before the deadline (similar to Spond's automatic reminders[8]).
- **Attendance history:** Maintain simple logs of each player's attendance for coaches and administrators (no long-term personal data).

#### 4.5.2 Tournament Management & Team Formation

- **Event creation:** Coaches can create tournaments with start date, time, registration deadline, maximum participants and attachments. These parameters mirror Spond's event features[10][11].
- **Registration options:** Parents can register via WhatsApp or through the web form. A public registration link can be shared in group chats, similar to Save This Date's public event registration[15].
- **Wait-list & automatic enrolment:** When the participant limit is reached, new registrants are placed on a waiting list and automatically promoted when a slot opens[11].
- **Open call mode (no participant limit):** Coaches can create a "call for participation" tournament with no maximum participant limit. Registration stays open until the deadline. After the deadline closes, the system automatically forms teams from all registered players using the team assignment algorithm. This mode is ideal for friendly tournaments where the club can send as many teams as needed.
- **Team assignment:** An algorithm assigns players to teams based on age, skill or other parameters (this should be configurable). In open-call mode, team formation runs automatically after the registration deadline and splits all registered players into balanced teams.
- **Alerts:** The system notifies the coach when registrations are below a minimum threshold (e.g., 8 players) or exceed the maximum.
- **Public tournament view (initials only):** Parents can view published tournament details on the website — team assignments, kick-off times, and dates — but player names are shown as **first-name initials only** (e.g., "Team A, 7:20 on Sep 28: J., F. H., K. A."). Full names are never displayed publicly.
- **Disambiguation with last-name initial:** When two or more players share the same first-name initial (e.g., two "L."), the system detects the collision and asks the affected parents (via WhatsApp or during onboarding) to provide a last-name initial for disambiguation. The display then becomes e.g., "L. M." and "L. S.". The system never asks for or stores full last names — only the single initial character.
- **Tournament team name:** When creating or editing a tournament, the coach can enter the **official team name** as registered with the tournament organiser (e.g., "FC Example E1", "FC Example Gelb"). This name is displayed on the public tournament view, the live ticker, and the game history. If no custom name is provided, the system defaults to the club name + team label (e.g., "FC Example — Team A").
- **Upcoming tournaments on homepage:** The website homepage (which shows the club logo, club name, and club description from settings) displays a list of upcoming tournaments with date, time, location, registration status (open / closing soon / closed), and a "Register" button. Tournaments are sorted by date; past tournaments disappear from this list and move to the history view.
- **Live ticker (match-day results):** On game day, the system periodically crawls the tournament organiser's results page (URL stored with the event) using the **Brave Search API** and the configured **LLM** to extract structured match results (scores, standings, match times). Results are displayed as a live ticker on the tournament's detail page. Crawl interval is configurable (default: every 10 minutes during the event window). If the page cannot be parsed or is unavailable, the system falls back to manual score entry by the coach. At the end of the match day, final results are automatically stored in the club's history.
- **Game history & trophy cabinet:** A dedicated "History" tab on the website shows all past tournaments the club has participated in, ordered chronologically. Each entry includes: tournament name, date, place/ranking achieved, and participant initials (using the same privacy-preserving initial format). Coaches can mark notable achievements as "trophies" (e.g., 1st place, 2nd place, fair-play award) which are displayed with a trophy icon. The history is permanent and accumulates across seasons/school years.

#### 4.5.3 Communication & Notifications

- **Confirmation messages:** After each action (register, cancel), send a WhatsApp confirmation.
- **Event reminders:** Send reminders before deadlines and event dates.
- **Broadcasts:** Coaches can broadcast messages to all parents via WhatsApp (via WAHA's send-text API[22]) or share an event link.

#### 4.5.4 Onboarding & User Management

- **Group link / QR code:** New parents join the system by scanning a QR code or clicking a link (mirroring Spond's group link sharing[12]). The bot asks for the child's name/year of birth.
- **Role management:** Assign roles (parent, coach, administrator) with corresponding permissions.

#### 4.5.5 Data & Privacy

- **Minimal data:** Store only the child's name or nickname, parent's phone number and attendance records.
- **Consent:** Provide a short privacy notice during onboarding.
- **Export & deletion:** Allow parents to request deletion of their data.
- **Self-hosting:** Provide Docker containers and documentation to deploy the system on the club's server.
- **Zero-trust data exposure:** The system must follow a strict write-only principle for sensitive data (personally identifiable information, or PII). Phone numbers, email addresses and other contact details are **never displayed** in the WhatsApp chat interface, web interface, API responses or logs. These fields are accepted on input (write-only) but masked or omitted on output. The only exception is the **admin role** (see below).
- **Admin PII access with strong password enforcement:** An administrator whose password passes a complexity check (minimum 12 characters, mixed case, digits, special characters; must not appear in common-password lists such as the "Have I Been Pwned" top-100k list) may view unmasked PII in the admin dashboard. If the admin password is weak or uses a default/simple value, PII is masked even for the admin. The system must re-evaluate password strength on every login and downgrade PII visibility immediately if the password no longer meets the policy (e.g., after a policy update).
- **No data export of PII:** Attendance exports, reports and API endpoints must anonymise or pseudonymise personal data. Raw PII is never included in exports; only hashed identifiers or nicknames are used.

#### 4.5.6 Data Protection Analysis (Daily Automated Audit)

The system must include an automated **data protection analysis tool** that proactively tests for data exposure vulnerabilities. It runs as an external online checker — a scheduled cron job on the server (or any machine with network access to the deployment).

- **What it checks:**
  - **Database file exposure:** Attempts to access the SQLite/PostgreSQL data files via HTTP(S) (e.g., `https://example.com/db.sqlite3`, common backup paths like `/backups/*.sql.gz`). Any successful download is a critical finding.
  - **API permission bypass:** Sends unauthenticated and low-privilege requests to all API endpoints that return PII. Verifies that PII fields are masked or absent in responses for non-admin callers.
  - **Directory listing:** Checks whether the web server exposes directory listings for sensitive paths (`/backups/`, `/data/`, `/uploads/`, `.env`).
  - **Default credentials:** Attempts login with common default credentials (`admin/admin`, `admin/password`, etc.) and flags any successful authentication.
  - **TLS configuration:** Verifies that HTTPS is active and that HTTP requests are redirected (no plaintext PII transmission).
  - **Log exposure:** Checks whether application logs are accessible via the web and whether they contain PII.

- **How it runs:**
  - Implemented as a standalone script: `tools/data-protection-audit.sh` (or `.py`).
  - Accepts the deployment URL as a parameter (e.g., `./tools/data-protection-audit.sh https://club.example.com`).
  - Designed to run from outside the server (black-box perspective, testing what an attacker would see).
  - Scheduled as a daily cron job. The deployment guide includes a section explaining how to install the cron entry:

    ```bash
    # Run data protection audit daily at 03:00
    0 3 * * * /opt/openkick/tools/data-protection-audit.sh https://club.example.com >> /var/log/openkick-audit.log 2>&1
    ```

  - The setup wizard (`tools/deploy-production.sh`) offers to install this cron job automatically during deployment.

- **Reporting:**
  - On success (no issues found): logs a single OK line with a timestamp.
  - On failure (any vulnerability detected): sends an alert to the admin via WhatsApp (using WAHA) and/or email, with a summary of findings and severity (critical / warning).
  - Maintains a rolling log file (`/var/log/openkick-audit.log`) with 30-day retention.
  - Provides a `--json` flag for machine-readable output, enabling integration with monitoring dashboards.

- **Guiding principle — assume breach:** The audit operates on the assumption that misconfigurations happen. Its purpose is to catch them before an attacker does. All checks must be non-destructive (read-only probes, no data modification).

#### 4.5.7 Development-Time Security Audit

A shell script (`tools/security-audit.sh`) must run during development and in CI pipelines to catch security issues before they reach production.

- **What it checks:**
  - **Hardcoded secrets:** Scans source files for patterns matching passwords, API keys, tokens, and private keys committed to the repository.
  - **Dependency vulnerabilities:** Runs `npm audit` and flags critical/high severity issues.
  - **File permissions:** Verifies that database files (`.sqlite3`, `.db`) and `.env` files are not world-readable.
  - **Docker misconfigurations:** Detects containers running as root, privileged mode, or hardcoded credentials in compose files.
  - **Code-level security patterns:** SQL injection (string interpolation in queries), dangerous dynamic code execution, insecure randomness (`Math.random()` in security contexts), and PII leakage in log statements.
  - **CORS & security headers:** Flags wildcard CORS and missing `helmet` middleware.
  - **security.txt presence:** Verifies that a `security.txt` file exists following RFC 9116.
  - **.gitignore coverage:** Ensures sensitive file patterns (`.env`, `*.sqlite3`, `node_modules`, `/backups`) are gitignored.

- **Modes:**
  - `./tools/security-audit.sh` — full audit (all checks).
  - `./tools/security-audit.sh --quick` — fast subset suitable for CI pre-merge checks.

- **Exit codes:**
  - `0` — no findings (warnings are non-blocking).
  - `1` — one or more findings detected (blocks CI).

- **Integration:** The CI pipeline must run `tools/security-audit.sh --quick` on every pull request. The full audit should run nightly.

#### 4.5.8 Security Disclosure & security.txt

The project must follow security best practices for vulnerability disclosure:

- **security.txt:** A machine-readable file at `public/.well-known/security.txt` following [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116), containing contact information, policy links, preferred languages, and an expiry date.
- **SECURITY.md:** A human-readable security policy at the repository root, describing how to report vulnerabilities, expected response times, and the project's security design principles.
- **README invitation:** The README must include a Security section that explains the zero-trust model, links to the security audit script, and invites responsible disclosure of vulnerabilities.
- **No public issue tracking for vulnerabilities:** Security issues must be reported via GitHub Security Advisories (private) or email, never as public issues.

#### 4.5.9 Statistics & Reporting

The system must provide aggregated statistics for coaches, administrators and the club board. All reports use anonymised or pseudonymised data (nicknames, hashed IDs) and never expose PII.

- **Semester periods:** Statistics are grouped by semester — spring semester (February–July) and autumn semester (August–January) — as well as by school year (autumn to summer, e.g., 2025/26).
- **Training hours:** Total training hours offered per team, per semester and per school year.
- **Person hours:** Sum of (number of attending players × session duration) per team, semester, and school year. This measures the club's effective training volume.
- **Coach hours:** Total hours each coach has led or assisted sessions, per semester and school year. Useful for volunteer recognition and insurance reporting.
- **No-show statistics:** Per-player and per-team no-show rate (registered but did not attend without prior cancellation). Highlight chronic no-shows so coaches can follow up.
- **Attendance rate:** Per-player and per-team attendance percentage over a configurable period.
- **Tournament participation:** Number of tournaments attended per player, per team, per semester.
- **Dashboard widgets:** Key metrics displayed on the coach dashboard as cards or charts (bar chart for attendance trend, pie chart for absence reasons).
- **Homepage club statistics (public):** The website homepage displays a set of headline statistics visible to everyone (no login required). These are purely aggregate numbers with no PII:
  - **Lifetime athletes:** Total number of players who have ever been registered with the club.
  - **Active athletes:** Number of players currently active (attended at least one session in the current semester).
  - **Tournaments played:** Lifetime count of tournaments the club has participated in.
  - **Trophies won:** Total count of trophy-marked achievements from the game history.
  - **Training sessions this season:** Number of training sessions held in the current school year.
  - **Active coaches:** Number of coaches who have led at least one session in the current semester.
  The admin can enable or disable each stat individually in club settings. All numbers update automatically.
- **Export:** Statistics can be exported as CSV or PDF. Exports are anonymised (see PRD 4.5.5).

#### 4.5.10 Administrative Checklists

An interactive checklist module helps club owners and coaches stay on top of administrative, legal and logistical requirements. Checklists are context-aware and adapt based on the club's classification.

- **Club profile & classification:** During setup, the administrator selects applicable classifications:
  - City of Zurich official sports activity (Sportamt Zürich)
  - Swiss Football Association (SFV / ASF) member club
  - Regional league participation (e.g., IFV, FVRZ)
  - Other associations or custom classifications
- **Administrative checklist:** A master checklist of recurring administrative tasks, filtered by the club's classifications. Examples:
  - Liability insurance (Haftpflichtversicherung) valid and renewed
  - Accident insurance for players confirmed
  - Coach certifications (J+S, SFV C-Diploma) up to date
  - Facility usage permits / field reservations secured
  - Registration with Sportamt Zürich submitted (if applicable)
  - SFV team registration and licence fees paid (if applicable)
  - Parent consent forms / disclaimers collected for all players
  - First-aid kit inspected and restocked
  - Bills and invoices paid (membership fees, tournament fees)
- **Per-training checklist:** A short, repeatable checklist for each training session:
  - Balls, cones, bibs packed
  - First-aid kit available
  - Attendance taken (links to the attendance module)
  - Field condition checked
  - Water / drinks reminder sent to parents
- **Per-tournament checklist:** A checklist for each tournament participation:
  - Registration submitted before deadline
  - Teams formed and published
  - Custom Trikots ordered (links to survey module for sizing)
  - Trikots packed and accounted for
  - Tournament rules / PDF downloaded and reviewed
  - Transport organised (drivers, carpooling)
  - Player passes / ID cards prepared (if league requires)
  - Post-tournament feedback survey sent (links to survey module)
- **Custom items:** Coaches and administrators can add, remove and reorder checklist items.
- **Progress tracking:** Each checklist instance tracks completion per item with timestamps. Incomplete items can trigger reminders.
- **Recurring checklists:** Administrative checklists reset per semester or per school year. Per-training checklists reset for each session. Per-tournament checklists are created per event.

#### 4.5.11 Surveys & Questionnaires

A lightweight survey system allows coaches to collect structured feedback, orders and preferences from parents. Surveys are shareable via link (web, WhatsApp, Signal, email).

- **Survey builder:** Coaches can create simple surveys with the following question types:
  - Single choice (radio buttons)
  - Multiple choice (checkboxes)
  - Star rating (1–5 stars)
  - Free text (optional comment field)
  - Size picker (dropdown with standard sizes: XS, S, M, L, XL, XXL, plus children's sizes: 116, 128, 140, 152, 164)
- **Anonymous or identified:** When creating a survey, the coach chooses whether responses are anonymous or linked to a player/parent. Anonymous surveys store no identifiers; identified surveys link to the player's nickname only (no PII).
- **Shareable link:** Each survey gets a unique URL that can be posted anywhere — WhatsApp group, Signal, email, printed QR code.
- **Mobile-friendly:** Survey pages are responsive and optimised for quick completion on a phone.
- **Two ready-made survey templates:**
  1. **Trikot & cap order:** Collects per player: Trikot size (children's / adult sizes), cap size (adjustable / S-M / L-XL), name or number to print on back (optional). Includes a summary view for the coach showing quantities per size.
  2. **End-of-semester feedback:** 5-star rating for overall satisfaction, 5-star rating for training quality, 5-star rating for communication, free-text field for "What should we improve?", free-text field for "What did you enjoy most?". Anonymous by default.
- **Results dashboard:** Coaches see aggregated results — average star ratings, size distribution charts, individual text responses (anonymous or attributed).
- **Deadline & reminders:** Surveys can have a response deadline. Reminders are sent via WhatsApp to parents who haven't responded (only for identified surveys; anonymous surveys cannot track who has responded).
- **Close & archive:** Coaches can close a survey to stop accepting responses and archive it for future reference.

#### 4.5.12 Payments

The system supports optional payment collection for club activities. Administrators configure which payment providers and use cases are active.

- **Payment providers:** The system integrates with the following providers. The administrator enables one or more during setup:
  - **Stripe** — card payments, SEPA, Apple Pay, Google Pay, and Twint (via Stripe's Twint payment method, available for Swiss accounts).
  - **Datatrans** — Swiss PSP supporting credit cards, PostFinance, and Twint. Commonly used by Swiss clubs and associations.
  - **Twint (via PSP):** Twint does not offer a direct developer API. It is available as a payment method through Stripe or Datatrans. The admin selects "Twint" as an offered payment method, and the system routes it through the configured PSP.
- **Admin payment settings:** In the admin dashboard under "Payment Settings", the administrator can:
  - Enable or disable each payment provider.
  - Enable or disable each payment use case (see below).
  - Set a default currency (CHF by default).
  - View a transaction log with date, amount, purpose, and status (no PII — only player nickname or anonymous).
- **Payment use cases:**
  - **Tournament participation fee:** When creating a tournament, the coach can set an optional participation fee. Parents pay during registration (via web form). Registration is confirmed only after successful payment. Unpaid registrations are flagged and can be reminded.
  - **Trikot & merchandise orders (survey payments):** When a survey includes orderable items (e.g., Trikot & cap order template from PRD 4.5.11), the coach can attach a price per item. After submitting the survey, the parent is redirected to a payment page with their order total. The order is marked as "paid" or "pending" in the results dashboard.
  - **Donations (homepage widget):** An optional donation widget can be displayed on the homepage. The admin sets a suggested amount (or "any amount") and a short description (e.g., "Support our tournament travel fund"). Donations are anonymous by default; donors can optionally leave a name or message.
- **Payment flow:** All payments use the provider's hosted checkout page (Stripe Checkout, Datatrans Lightbox). The club's server never handles raw card data. The system receives a webhook callback on payment success/failure and updates the record accordingly.
- **Receipts:** After successful payment, the parent receives a confirmation via WhatsApp (if identified) and can download a simple receipt (PDF) from the web interface.
- **Refunds:** Coaches can initiate refunds from the admin dashboard (e.g., if a tournament is cancelled). The refund is processed through the PSP's API.
- **Privacy:** Payment records store only the player nickname, amount, purpose, and transaction ID. No credit card numbers, bank details, or billing addresses are stored in the OpenKick database.

#### 4.5.13 Club Branding & Customisation

Every OpenKick instance should feel like the club's own tool, not a generic platform. Administrators can customise the appearance and identity of the web application and WhatsApp messages.

- **Homepage:** The homepage at `/` displays the club logo, club name, and club description — all taken from settings. No hardcoded "OpenKick" text appears on the homepage. The server injects these values (and all meta/OG tags) into the HTML at request time so that crawlers and social media previews see the correct branding.
- **Club name & subtitle:** Displayed on the homepage, header, login page, footer copyright, and WhatsApp bot greeting. Example: "FC Example — Junioren E".
- **Logo:** Upload a club logo (SVG, PNG, or JPG, max 2 MB). Displayed on the homepage, header, login page, footer, and as the WhatsApp bot profile picture (if supported by WAHA). On upload, the server automatically generates favicon variants (ICO, 16×16, 32×32, apple-touch-icon 180×180, Android Chrome 192×192 and 512×512) and a `site.webmanifest`.
- **Tint colour (primary colour):** A single brand colour (hex value or colour picker) applied to buttons, links, active states, and the header bar. The system auto-generates accessible contrast variants (dark/light) for text and backgrounds.
- **SEO & Social Media:** Administrators can individually configure: OG title, OG description, OG image, Twitter/X title, Twitter/X description, Twitter/X handle, and meta keywords. Empty fields fall back to club profile values (club name, club description, club logo). These tags are injected server-side into every HTML page's `<head>`.
- **Official contact information:** Displayed in the footer and the "About" / "Contact" page:
  - Club name (legal name if different from display name)
  - Street address
  - Postal code and city
  - Email address
  - Phone number (optional)
  - Website URL (optional)
- **Imprint (Impressum):** A free-text or structured field for the legal imprint, required by Swiss law for websites. Displayed on a dedicated `/imprint` page and linked from the footer. Fields:
  - Responsible person (name)
  - Club association type (e.g., Verein nach Art. 60 ZGB)
  - UID / commercial register number (optional)
  - Data protection officer or contact (optional)
- **Security contact (security.txt):** Administrators configure security contact details (email, URL, PGP key URL, policy URL, acknowledgments URL, preferred languages, canonical URL) through the settings page. The server dynamically generates an RFC 9116 compliant `/.well-known/security.txt` from these settings. The open-source project contact is always included automatically.
- **Footer:** The footer on every page shows: club name in the copyright line, links to Imprint, Privacy Policy, Login, feeds (RSS, Atom, Calendar), data endpoints (Sitemap, llms.txt, robots.txt), and API links (Health, MCP, security.txt).
- **WhatsApp bot identity:** The bot's display name and greeting message are derived from the club name and subtitle. The greeting is customisable (e.g., "Hallo! Ich bin der Bot vom FC Example. Schreib mir den Namen deines Kindes, um loszulegen.").
- **Settings UI:** All branding settings are managed from a "Club Settings" page in the admin dashboard. Changes take effect immediately (no restart required). Settings sections: Club Profile, SEO & Social Media, Security Contact.

### 4.6 Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Usability** | Parents can send messages without changing habits; the web interface must be mobile-friendly. |
| **Reliability** | System must handle concurrent messages without losing responses; use queueing to process WhatsApp webhooks. |
| **Security & Privacy** | Use HTTPS; restrict access to the admin dashboard; comply with Swiss/EU data-protection laws; store minimal data. Enforce zero-trust data exposure (PII is write-only; never displayed except to strong-password admins). Run daily automated data protection audits via cron. Enforce strong admin passwords (min 12 chars, complexity rules, checked against common-password lists). |
| **Scalability** | Should support multiple teams with up to ~100 players; WAHA can scale to hundreds of sessions[27]. |
| **Extensibility** | Modular architecture to add features (equipment tracking, etc.) later. Payments are a first-class module (see PRD 4.5.12). |
| **Localization** | Interface should support German and French as well as English; follow the user's timezone (Europe/Zurich). |

### 4.7 Technical Architecture (High-Level)

- **WhatsApp API Layer:** WAHA instance connected to the club's WhatsApp number; exposes REST endpoints for sending/receiving messages.
- **Chatbot:** BuilderBot (Node.js) or similar framework processes incoming messages, recognises commands, and sends replies. It triggers workflows in n8n or custom scripts.
- **Workflow Engine:** n8n for orchestrating processes (update attendance, check deadlines, send reminders). The existing student-absence workflow shows how to fetch records, prepare email/WhatsApp messages and send them[25].
- **Web Application:** A small web app (e.g., React or Vue) with a backend (e.g., Node.js/Express, Python/FastAPI) uses a database (SQLite or PostgreSQL). Coaches log in to manage events; parents can open event pages. Cal.com's open-source scheduling model[16] can inspire the event page design.
- **Database:** Stores events, players and attendance records. Minimal personal data; hashed identifiers for privacy.
- **Deployment:** Docker compose stack for WAHA, chatbot service, n8n, and web app; can be deployed on a local server or VPS.

### 4.8 Success Metrics

- 90% of parents use the system for training attendance after 2 months.
- Reduction of WhatsApp chat noise (e.g., 50% fewer follow-up messages).
- Coaches spend 75% less time compiling attendance lists.
- At least one tournament successfully managed through the system within 3 months of launch.

### 4.9 Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **WhatsApp API restrictions** | WAHA relies on WhatsApp Web emulation; WhatsApp may block numbers that send automated messages[28]. Use a business API or official provider if possible; set message rate limits. |
| **Data privacy concerns** | Host servers in Switzerland/EU; store minimal data; provide clear consent. |
| **Technical complexity** | Start with core features (attendance and simple tournament registration). Use open-source components to reduce development time. |
| **User adoption** | Provide training for coaches and clear onboarding for parents; allow fallback to manual communication until adoption stabilises. |
| **Accidental data exposure** | Daily automated audit (`tools/data-protection-audit.sh`) detects misconfigured permissions, exposed database files, directory listings, and default credentials. Alerts are sent to the admin immediately. Zero-trust architecture ensures PII is never returned in API responses or UI unless the caller is an admin with a verified strong password. |

### 4.10 Deployment & Installation

The system must be easy to deploy both on a personal machine (for testing and development) and on a production server (for the club). All deployment paths use Docker so the club does not need to install individual services manually.

#### 4.10.1 Prerequisites

| Requirement | Minimum |
|---|---|
| **Operating system** | Linux (Ubuntu 22.04+), macOS 13+, or Windows 11 with WSL 2 |
| **Docker** | Docker Engine 24+ and Docker Compose v2+ |
| **Hardware** | 2 CPU cores, 2 GB RAM, 10 GB disk (production: 4 cores / 4 GB recommended) |
| **Domain (production)** | A domain or subdomain pointing to the server's IP (for HTTPS) |
| **WhatsApp number** | A dedicated phone number for the club's WhatsApp account |

#### 4.10.2 Local Development Setup

A single script (`tools/setup-local.sh`) must perform the following steps:

1. Check that Docker and Docker Compose are installed; print instructions if not.
2. Copy `.env.example` to `.env` and prompt the user to fill in required values (see Section 4.11).
3. Run `docker compose -f docker-compose.dev.yml up --build` to start all services (WAHA, chatbot, n8n, web app, database).
4. Print a summary with URLs: web app (`http://localhost:3000`), n8n dashboard (`http://localhost:5678`), WAHA API (`http://localhost:3001`).
5. Open the WAHA QR-code page so the user can pair their WhatsApp number.

#### 4.10.3 Production Deployment

A deployment script (`tools/deploy-production.sh`) must handle:

1. **Server provisioning check** — verify SSH access, Docker installation, and available disk space on the target server.
2. **TLS / HTTPS** — use Caddy or Traefik as a reverse proxy with automatic Let's Encrypt certificates. The user provides their domain name during setup.
3. **Environment configuration** — interactively prompt for all required environment variables (database password, WhatsApp number, admin credentials) and write them to `.env` on the server. Secrets are never committed to the repository.
4. **Container orchestration** — run `docker compose -f docker-compose.prod.yml up -d` on the server. Production compose file includes restart policies (`unless-stopped`), health checks, volume mounts for persistent data, and log rotation.
5. **Database migrations** — automatically run pending migrations on startup.
6. **Backup schedule** — configure a daily database backup via cron (`tools/backup-db.sh`) that stores compressed dumps in `/backups/` with 14-day retention.
7. **Update procedure** — a separate script (`tools/update.sh`) pulls the latest images, runs migrations, and restarts containers with zero downtime using rolling restarts.

#### 4.10.4 Docker Compose Services

| Service | Image / Build | Ports | Purpose |
|---|---|---|---|
| `web` | Custom (Node.js or Python) | 3000 | Web application (frontend + API) |
| `waha` | `devlikeapro/waha` | 3001 | WhatsApp HTTP API |
| `chatbot` | Custom (Node.js) | 3002 | Message parsing and chatbot logic |
| `n8n` | `n8nio/n8n` | 5678 | Workflow automation |
| `db` | `postgres:16-alpine` | 5432 | PostgreSQL database |
| `proxy` | `caddy:2-alpine` | 80, 443 | Reverse proxy with auto-TLS (production only) |

#### 4.10.5 Deployment Scripts Summary

| Script | Purpose |
|---|---|
| `tools/setup-local.sh` | One-command local development setup |
| `tools/deploy-production.sh` | Interactive production deployment to a remote server |
| `tools/update.sh` | Pull latest version and restart with zero downtime |
| `tools/backup-db.sh` | Database backup with retention policy |
| `tools/restore-db.sh` | Restore database from a backup file |
| `tools/health-check.sh` | Verify all services are running and responsive |
| `tools/data-protection-audit.sh` | Daily automated data protection analysis (cron job) |
| `tools/security-audit.sh` | Development/CI-time extended security audit (`--quick` for CI) |

### 4.11 Account Setup & Credential Onboarding

Setting up the system requires a few external accounts and API keys. The setup wizard (launched by `tools/setup-local.sh` or `tools/deploy-production.sh`) guides the user through each step interactively.

#### 4.11.1 Setup Wizard Flow

The setup wizard runs in the terminal and walks the user through each credential step-by-step. It:

1. Displays a checklist of what is needed before starting.
2. For each service, explains **what** the account/key is, **why** it is needed, and provides a direct link to the sign-up or settings page.
3. Validates each credential immediately after entry (e.g., pings the WAHA API, tests the database connection).
4. Writes validated values to `.env` (never to version control).
5. Prints a final summary showing which services are configured and ready.

#### 4.11.2 Required Credentials

| Credential | Where to Get It | Why It Is Needed |
|---|---|---|
| **WhatsApp phone number** | Any mobile provider; a separate SIM or virtual number is recommended | WAHA connects to WhatsApp Web using this number. It becomes the club's "bot" number that parents message. |
| **WAHA API key** | Generated during WAHA setup (`WHATSAPP_API_KEY` in `.env`) | Secures the WAHA REST API so only your system can send/receive messages. |
| **Database password** | Generated by the setup wizard (random 32-char string) | Protects the PostgreSQL database. The wizard generates a strong password automatically. |
| **Admin account** | Created during first-run setup in the web app | The first user to log in becomes the club administrator. They set their own email and password. |
| **n8n credentials** | Set during setup (`N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD`) | Protects the n8n workflow dashboard from unauthorised access. |
| **SMTP server (optional)** | Club's email provider or a free service like Mailgun/Brevo | Sends email notifications and password-reset emails. Not required if the club only uses WhatsApp. |
| **Stripe API keys (optional)** | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | Required if Stripe is used as payment provider. Publishable key for frontend, secret key for backend webhooks. |
| **Datatrans Merchant ID & API credentials (optional)** | [datatrans.ch](https://www.datatrans.ch/) — contact for account | Required if Datatrans is used as payment provider. Merchant ID, server-to-server password, and sign key. |
| **Brave Search API key (optional)** | [brave.com/search/api](https://brave.com/search/api/) — free tier available | Powers the live-ticker feature by crawling tournament result pages on match day. Not required if coaches enter results manually. |
| **LLM API key (optional)** | Anthropic, OpenAI, or local model (e.g., Ollama) | Used together with Brave Search to extract structured match results from unstructured tournament web pages. Not required if live ticker is not used. |
| **Domain name (production)** | Any domain registrar (e.g., Cloudflare, Namecheap) | Required for HTTPS in production. The reverse proxy obtains a certificate automatically via Let's Encrypt. |

#### 4.11.3 Credential Security

- All secrets are stored only in `.env`, which is listed in `.gitignore`.
- The setup wizard generates strong random values for database passwords and API keys.
- Credentials can be rotated by re-running the relevant section of the setup wizard.
- No credentials are ever logged, printed in full, or sent to external services.

## Conclusion

Existing sports management platforms like Teamy, Spond and TeamSnap offer robust attendance and event management functions but expect users to sign up and do not parse free-form WhatsApp messages[4][8]. Self-hosted open-source components such as WAHA, BuilderBot and n8n make it feasible to build a lightweight system that maintains the simplicity of WhatsApp communication while adding structure. Combining these tools with a responsive web interface and minimal data storage can meet the youth football club's needs for easy attendance tracking and tournament management.

---

## References

- [1][2][3][4] Attendance Registration | Teamy - https://teamy.online/en/attendance-registration/
- [5][6][7][8][9][10][11] Features in events | Spond App - https://help.spond.com/app/en/articles/129730-features-in-events
- [12] Invite and add members | Spond App - https://help.spond.com/app/en/articles/131166-invite-and-add-members-to-main-groups-and-subgroups
- [13][14][15] RSVP by WhatsApp | Save This Date - https://www.save-date.com/rsvp-by-whatsapp.html
- [16][17] Calendar scheduling for WhatsApp | Cal.com - https://cal.com/blog/calendar-scheduling-for-whatsapp
- [18] Free attendance tracker | SportMember - https://www.sportmember.com/en/attendance-tracker
- [19][20][21][22][27][28] WhatsApp HTTP API | WAHA - https://waha.devlike.pro/
- [23][24] BuilderBot - https://www.builderbot.app/en
- [25][26] Student absence alerts | n8n - https://n8n.io/workflows/7042-student-absence-alerts-via-email-and-whatsapp-with-attendance-tracking/
