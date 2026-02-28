# WhatsApp Bot Setup Guide

> For club administrators setting up OpenKick's WhatsApp integration.

## Recommended: Use the Setup Wizard

When you first set up OpenKick, the onboarding wizard guides you through WhatsApp setup automatically — no terminal or technical knowledge required. The wizard:

1. Checks if Docker is installed (and installs it for you if not)
2. Lets you configure the WAHA port and engine
3. Downloads and starts the WAHA container with one click
4. Shows a QR code to connect your WhatsApp number

If you skipped the wizard during onboarding, you can run it again from **Settings > WhatsApp**.

The steps below are for manual setup if you prefer the command line.

---

## What You Need

- A **dedicated phone number** for the bot (separate SIM or spare phone)
- A phone with WhatsApp installed on that number
- OpenKick running (locally or on a server)

## Step 1: Get a Phone Number

Use a real SIM card — not a virtual number. WhatsApp is more likely to block virtual numbers. A cheap prepaid SIM works fine.

Install WhatsApp on the phone and verify the number normally. You can use WhatsApp Web later, so the phone doesn't need to stay nearby forever.

**Tip:** Label the number in your contacts as "FC Example Bot" so parents recognise it.

## Step 2: Start OpenKick

If you haven't already, run the setup:

```bash
./tools/setup-local.sh
```

The setup wizard will ask for your WhatsApp number. Enter it in international format without the `+` sign (e.g., `41791234567` for a Swiss number).

## Step 3: Scan the QR Code

After starting OpenKick, open:

```
http://localhost:3001/api/docs
```

You'll see a QR code. Open WhatsApp on the phone with the bot number, go to **Settings > Linked Devices > Link a Device**, and scan the QR code.

Once paired, the bot is online. Parents can now message this number.

## Step 4: Share the Bot Number

There are two ways to share the bot with parents:

### Option A: QR Code (recommended)

OpenKick generates a WhatsApp QR code that parents can scan to start a chat. Share it:
- Printed on a flyer at training
- In the existing WhatsApp group
- On the club's website

### Option B: Direct Link

Share this link (replace with your number):

```
https://wa.me/41791234567?text=Hallo
```

When a parent messages the bot for the first time, it asks for the child's name — and they're set up.

## Step 5: Customise the Bot

In the admin dashboard under **Club Settings**, you can:
- Set the bot's **display name** (e.g., "FC Example Bot")
- Write a custom **greeting message** in German, French, or English
- Upload the club **logo** as the bot's profile picture

## What Parents Experience

1. They message the bot number on WhatsApp (or scan a QR code)
2. The bot asks: "Welcome! What is your child's name?"
3. Parent replies: "Luca"
4. Bot confirms: "Got it! Luca is registered. I'll let you know about upcoming trainings."

From then on, parents can write naturally:
- "Luca is sick" → bot marks Luca as absent
- "Luca can come" → bot marks Luca as attending
- "late today" → bot notes late arrival

## Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code not showing | Make sure the WAHA service is running: `docker compose ps` |
| Bot not responding | Check that the session is active at `http://localhost:3001/api/sessions` |
| WhatsApp disconnected | Re-scan the QR code. Make sure the phone still has WhatsApp installed. |
| Messages delayed | WhatsApp has rate limits. If you sent many messages quickly, wait a few minutes. |

## Important: Avoid Getting Blocked

WhatsApp can block numbers that send too many automated messages. To stay safe:

- **Don't send bulk messages** to people who haven't messaged the bot first
- **Keep volumes low** — a youth club with 50 families is fine
- **Vary message content** — don't send identical text to everyone
- **Warm up the number** — use it normally for a few days before turning on automation
