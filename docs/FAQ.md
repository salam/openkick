# Frequently Asked Questions (FAQ)

## For Parents

### How do I subscribe to the club's events?

Visit the homepage and open the "Subscribe to updates" card. You can:

- **Calendar**: Copy the ICS link and add it as a subscription in Google Calendar, Apple Calendar, or Outlook. You'll see all upcoming events automatically.
- **RSS**: Use the RSS or Atom feed URL with any feed reader (Feedly, Thunderbird, NetNewsWire, etc.).
- **Social**: Follow the club on Mastodon or Bluesky to get event updates in your feed.

### Do I need to install an app?

No. Everything works through WhatsApp, which you probably already have. There's also an optional website you can open in your phone's browser — no download needed.

### Do I need to create an account?

No. When you first message the club's WhatsApp number, it asks for your child's name. That's it. No email, no password, no registration form.

### What information is stored about me and my child?

Only the bare minimum: your child's name (or nickname) and your phone number (which WhatsApp provides automatically). No email addresses, no birthdays, no photos. Attendance records are kept so coaches can plan, but they don't contain personal details beyond the name.

### Can I delete my data?

Yes. Send "delete my data" to the club's WhatsApp number, or ask your coach. All records linked to your phone number will be removed.

### What if I have more than one child in the club?

No problem. During the first chat, you can register multiple children. When reporting attendance, just mention which child you're referring to (e.g., "Luca is coming, Mia is sick").

### What if the bot doesn't understand my message?

It will ask you to rephrase. You can also just write "help" for a list of things you can say. If it still doesn't work, talk to your coach — they can update attendance manually.

### Can I sign up for a tournament via the website instead of WhatsApp?

Yes. The website has a list of upcoming tournaments. Tap the one you want and choose "Register". You don't need a login for this — just select your child's name from the list.

### Will I get too many messages?

No. The system sends only essential messages: training reminders (once before each session), tournament announcements, and confirmations when you sign up or cancel. You won't receive marketing or general club news through the bot.

### What happens if the tournament is full?

Your child is placed on a waiting list. If someone cancels, the next person on the list gets the spot automatically and you'll be notified.

### Can I sign up my child for the whole season in advance?

Depending on how your coach sets it up, trainings may be set to "attending by default" — meaning your child is always counted in unless you say otherwise. Ask your coach if this is enabled for your team.

---

## For Coaches

### How do I get access to the dashboard?

Your club administrator creates your account. You'll receive login credentials by email or in person. If you haven't received them, contact your club admin.

### Can I have multiple teams?

Yes. The dashboard supports multiple teams. Each team has its own training schedule, tournament list, and parent group. You switch between teams using the menu.

### What if a parent tells me in person that their child is absent?

You can update attendance manually from the dashboard. Tap the player's name on the training page and change their status.

### How does the tournament PDF upload work?

Send or forward the tournament invitation PDF to the club's WhatsApp number (the same one parents use). The system reads the document and extracts key details — date, location, deadlines, rules. It creates a draft tournament that you can review, adjust, and publish from the dashboard.

### Can I export attendance data?

Yes. On the dashboard, go to **Reports > Export**. You can download attendance records as a spreadsheet (CSV). Data is anonymised by default — only first names or nicknames appear, no phone numbers.

### What happens when a parent sends a confusing message?

The system tries its best to understand. If it's not sure, it asks the parent to clarify. Messages that can't be processed are flagged in the dashboard under **Messages > Needs Attention** so you can handle them manually.

### Can I send custom messages to all parents?

Yes. Use **Messages > Broadcast** on the dashboard. This sends a WhatsApp message to everyone in the selected team. Good for last-minute changes like cancelled training or a location switch.

### How do automatic reminders work?

The system sends a WhatsApp reminder to parents who haven't responded before the deadline. The timing is configurable (default: 24 hours before training). You can also trigger a manual reminder anytime from the dashboard.

### Why do I see a verification step when logging in or responding to attendance?

OpenKick uses an invisible proof-of-work verification to protect against automated bots. It runs automatically in the background — you don't need to do anything. If it takes more than a few seconds, try refreshing the page.

### Does the verification track me?

No. OpenKick uses Altcha, a self-hosted, privacy-friendly captcha that doesn't use cookies or send data to third parties.

---

## Technical / Setup

### What do I need to run this on my own server?

A Linux server (or any machine) with Docker installed. The system runs as a set of containers (web app, WhatsApp connector, database, workflow engine) managed by Docker Compose. See the [PRD Section 4.10](../requirements/FOOTBALL_TOOL_Attendance_and_Tournament_Management.md) for full details.

Minimum: 2 CPU cores, 2 GB RAM, 10 GB disk.

### Is this free?

Yes. OpenKick is open-source and self-hosted. You pay only for your own server (a basic VPS costs roughly 5-10 EUR/month) and the WhatsApp number.

### Does this use the official WhatsApp Business API?

By default, it uses WAHA (WhatsApp HTTP API), which connects through WhatsApp Web. This is free but carries a small risk that WhatsApp may restrict the number if it detects automated messaging. For clubs that want official support, the system can be configured to use the WhatsApp Business API (Meta) instead, which has usage-based pricing.

### What about data privacy (GDPR)?

The system stores minimal data (child's name, parent's phone number, attendance records) on your own server. No data is sent to third-party services (except WhatsApp messages going through WhatsApp's servers, which is the same as normal WhatsApp use). Parents can request data deletion at any time.

### Can I run this locally on my laptop for testing?

Yes. Run `./tools/setup-local.sh` and the entire system starts in Docker on your machine. You can test with your own WhatsApp number.

### How do I update to a newer version?

Run `./tools/update.sh`. It pulls the latest version, runs any database changes (migrations), and restarts the services. Your data is preserved.

### How are backups handled?

A daily backup script (`tools/backup-db.sh`) creates a compressed copy of the database. Backups are kept for 14 days by default. To restore from a backup, use `tools/restore-db.sh`.

### Can I customise the system (add features, change the look)?

Yes. The code is open-source. The architecture is modular — the web app, chatbot, and workflow engine are separate services that communicate through APIs. You can modify any part without affecting the others.

### What languages does it support?

The interface and chatbot support German, French, and English. The system uses the timezone Europe/Zurich by default.

### I'm stuck. Where can I get help?

- Check the user guides: [Quick Start for Parents](QUICK_START_PARENTS.md) | [Quick Start for Coaches](QUICK_START_COACHES.md)
- Open an issue on the project's repository
- Contact your club administrator
