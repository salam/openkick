# Tournament Management (PRD 4.5.2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 6 remaining tournament management features: open call mode, threshold alerts, public tournament view with initials, initial disambiguation, team name management, and upcoming tournaments widget.

**Architecture:** Extends the existing events system with new columns (`lastNameInitial` on players), a new `notifications` table, a new `tournament_alerts` table, a dedicated public API route, and frontend components. Uses TDD with vitest + in-memory sql.js.

**Tech Stack:** Express, sql.js, vitest, Next.js (static export), WAHA WhatsApp API

---

### Task 1: Add `lastNameInitial` Column to Players Table

**Files:**
- Modify: `server/src/database.ts:10-18` (players CREATE TABLE)
- Modify: `server/src/database.ts:194-213` (migration block)
- Test: `server/src/routes/__tests__/players.test.ts` (existing)

**Step 1: Add column to schema**

In `server/src/database.ts`, add `lastNameInitial` to the `players` CREATE TABLE (around line 17):

```sql
lastNameInitial TEXT
```

**Step 2: Add migration for existing databases**

In the migration block (after line 213), add:

```ts
try { db.run('ALTER TABLE players ADD COLUMN lastNameInitial TEXT'); } catch {}
```

**Step 3: Run existing tests to verify no regressions**

Run: `cd server && npx vitest run src/routes/__tests__/players.test.ts`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git commit -m "feat(db): add lastNameInitial column to players table" -- server/src/database.ts
```

---

### Task 2: Add `notifications` and `tournament_alerts` Tables

**Files:**
- Modify: `server/src/database.ts:127-154` (after existing tables)

**Step 1: Add notifications table to SCHEMA**

After the `tournament_results` table definition, add:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  eventId INTEGER,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId INTEGER NOT NULL UNIQUE,
  lastAlertType TEXT,
  lastAlertAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE
);
```

**Step 2: Run database tests**

Run: `cd server && npx vitest run src/__tests__/database.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git commit -m "feat(db): add notifications and tournament_alerts tables" -- server/src/database.ts
```

---

### Task 3: Team Name in Events CRUD

**Files:**
- Modify: `server/src/routes/events.ts:26-74` (POST handler)
- Modify: `server/src/routes/events.ts:191-230` (PUT handler)
- Test: `server/src/routes/__tests__/events.test.ts`

**Step 1: Write failing test for teamName in POST**

Add to `server/src/routes/__tests__/events.test.ts`:

```ts
it('should accept teamName when creating a tournament', async () => {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'tournament',
      title: 'Summer Cup',
      date: '2026-06-15',
      teamName: 'FC Example E1'
    })
  });
  expect(res.status).toBe(201);
  const body = await res.json();

  const detail = await fetch(`${baseUrl}/api/events/${body.id}`);
  const event = await detail.json();
  expect(event.teamName).toBe('FC Example E1');
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts -t "teamName"`
Expected: FAIL — `teamName` not in INSERT or SELECT

**Step 3: Add teamName to POST handler**

In `server/src/routes/events.ts`, update the POST handler to extract `teamName` from `req.body` and include it in the INSERT SQL. Also update the GET `:id` handler to return `teamName`.

**Step 4: Write failing test for teamName in PUT**

```ts
it('should update teamName on a tournament', async () => {
  // Create event first
  const create = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'tournament', title: 'Cup', date: '2026-06-15' })
  });
  const { id } = await create.json();

  const res = await fetch(`${baseUrl}/api/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName: 'FC Example Gelb' })
  });
  expect(res.status).toBe(200);

  const detail = await fetch(`${baseUrl}/api/events/${id}`);
  const event = await detail.json();
  expect(event.teamName).toBe('FC Example Gelb');
});
```

**Step 5: Add teamName to PUT handler**

Update the PUT handler's SQL to include `teamName`.

**Step 6: Run all events tests**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts`
Expected: All PASS

**Step 7: Commit**

```bash
git commit -m "feat(events): add teamName to tournament create and update" -- server/src/routes/events.ts server/src/routes/__tests__/events.test.ts
```

---

### Task 4: Open Call Mode — Skip Waitlist When No Max Participants

**Files:**
- Modify: `server/src/services/attendance.ts` (the `setAttendance` function)
- Test: `server/src/services/__tests__/attendance.test.ts`

**Step 1: Write failing test**

Add test: when `maxParticipants` is NULL, RSVP should always set status to `attending` (never `waitlist`).

```ts
it('should set attending (not waitlist) when maxParticipants is null (open call)', async () => {
  // Create event with no maxParticipants
  db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Open Cup', '2026-06-15')");
  const eventId = getLastInsertId(db);

  // Create 20 players and RSVP all as attending
  for (let i = 0; i < 20; i++) {
    db.run(`INSERT INTO players (name, yearOfBirth) VALUES ('Player${i}', 2015)`);
    const playerId = getLastInsertId(db);
    const result = await setAttendance(eventId, playerId, 'attending');
    expect(result.status).toBe('attending');
  }

  // Verify no one is on waitlist
  const rows = db.exec(`SELECT COUNT(*) FROM attendance WHERE eventId = ${eventId} AND status = 'waitlist'`);
  expect(rows[0].values[0][0]).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/attendance.test.ts -t "open call"`
Expected: FAIL if current code puts players on waitlist when count exceeds some default

**Step 3: Update setAttendance to skip waitlist when maxParticipants is NULL**

In `server/src/services/attendance.ts`, check: if the event's `maxParticipants` is NULL, always use the requested status (no waitlist logic).

**Step 4: Run test**

Run: `cd server && npx vitest run src/services/__tests__/attendance.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git commit -m "feat(attendance): skip waitlist for open-call events (maxParticipants=null)" -- server/src/services/attendance.ts server/src/services/__tests__/attendance.test.ts
```

---

### Task 5: Player Initials Service

**Files:**
- Create: `server/src/services/player-initials.ts`
- Create: `server/src/services/__tests__/player-initials.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeInitials } from '../player-initials.js';

describe('computeInitials', () => {
  it('should return first initial with dot', () => {
    const result = computeInitials([
      { id: 1, name: 'Jonas', lastNameInitial: null },
      { id: 2, name: 'Felix', lastNameInitial: null },
      { id: 3, name: 'Karl', lastNameInitial: null }
    ]);
    expect(result).toEqual([
      { id: 1, initial: 'J.' },
      { id: 2, initial: 'F.' },
      { id: 3, initial: 'K.' }
    ]);
  });

  it('should disambiguate with last-name initial when first initials collide', () => {
    const result = computeInitials([
      { id: 1, name: 'Jonas', lastNameInitial: 'M' },
      { id: 2, name: 'Jan', lastNameInitial: 'S' },
      { id: 3, name: 'Felix', lastNameInitial: null }
    ]);
    expect(result).toEqual([
      { id: 1, initial: 'J. M.' },
      { id: 2, initial: 'J. S.' },
      { id: 3, initial: 'F.' }
    ]);
  });

  it('should fall back to first initial only when collision exists but no lastNameInitial', () => {
    const result = computeInitials([
      { id: 1, name: 'Jonas', lastNameInitial: null },
      { id: 2, name: 'Jan', lastNameInitial: 'S' }
    ]);
    expect(result).toEqual([
      { id: 1, initial: 'J.' },
      { id: 2, initial: 'J. S.' }
    ]);
  });

  it('should handle empty array', () => {
    expect(computeInitials([])).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/player-initials.test.ts`
Expected: FAIL — module not found

**Step 3: Implement computeInitials**

Create `server/src/services/player-initials.ts`:

```ts
interface PlayerInput {
  id: number;
  name: string;
  lastNameInitial: string | null;
}

interface PlayerInitial {
  id: number;
  initial: string;
}

export function computeInitials(players: PlayerInput[]): PlayerInitial[] {
  const firstLetterCount = new Map<string, number>();
  for (const p of players) {
    const letter = p.name.charAt(0).toUpperCase();
    firstLetterCount.set(letter, (firstLetterCount.get(letter) || 0) + 1);
  }

  return players.map(p => {
    const letter = p.name.charAt(0).toUpperCase();
    const hasCollision = (firstLetterCount.get(letter) || 0) > 1;

    if (hasCollision && p.lastNameInitial) {
      return { id: p.id, initial: `${letter}. ${p.lastNameInitial.toUpperCase()}.` };
    }
    return { id: p.id, initial: `${letter}.` };
  });
}
```

**Step 4: Run tests**

Run: `cd server && npx vitest run src/services/__tests__/player-initials.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/player-initials.ts server/src/services/__tests__/player-initials.test.ts && git commit -m "feat: add player initials service with disambiguation"
```

---

### Task 6: lastNameInitial in Players API

**Files:**
- Modify: `server/src/routes/players.ts` (accept and return `lastNameInitial`)
- Test: `server/src/routes/__tests__/players.test.ts`

**Step 1: Write failing test**

```ts
it('should accept and return lastNameInitial', async () => {
  const res = await fetch(`${baseUrl}/api/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Jonas', yearOfBirth: 2015, lastNameInitial: 'M' })
  });
  expect(res.status).toBe(201);
  const player = await res.json();
  expect(player.lastNameInitial).toBe('M');
});
```

**Step 2: Run test, verify fail**

**Step 3: Update players route**

Add `lastNameInitial` to INSERT, UPDATE, and SELECT queries in `server/src/routes/players.ts`.

**Step 4: Run all players tests**

Run: `cd server && npx vitest run src/routes/__tests__/players.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git commit -m "feat(players): add lastNameInitial to CRUD" -- server/src/routes/players.ts server/src/routes/__tests__/players.test.ts
```

---

### Task 7: Notifications Service

**Files:**
- Create: `server/src/services/notifications.ts`
- Create: `server/src/services/__tests__/notifications.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDB } from '../../database.js';
import { createNotification, getUnreadNotifications, markAsRead } from '../notifications.js';

describe('notifications service', () => {
  let db: any;

  beforeEach(async () => { db = await initDB(); });

  it('should create a notification', () => {
    const n = createNotification({ userId: 1, eventId: 1, type: 'threshold_warning', message: 'Spots filling up' });
    expect(n.id).toBeDefined();
    expect(n.read).toBe(0);
  });

  it('should list unread notifications for a user', () => {
    createNotification({ userId: 1, eventId: 1, type: 'threshold_warning', message: 'A' });
    createNotification({ userId: 1, eventId: 2, type: 'threshold_full', message: 'B' });
    createNotification({ userId: 2, eventId: 1, type: 'threshold_warning', message: 'C' });
    const unread = getUnreadNotifications(1);
    expect(unread).toHaveLength(2);
  });

  it('should mark notification as read', () => {
    const n = createNotification({ userId: 1, eventId: 1, type: 'threshold_warning', message: 'A' });
    markAsRead(n.id);
    const unread = getUnreadNotifications(1);
    expect(unread).toHaveLength(0);
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Implement notifications service**

Create `server/src/services/notifications.ts` with `createNotification`, `getUnreadNotifications`, `markAsRead`.

Use `getDB()` from `../database.js` and `getLastInsertId()` for IDs.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/notifications.ts server/src/services/__tests__/notifications.test.ts && git commit -m "feat: add notifications service (create, list unread, mark read)"
```

---

### Task 8: Notifications API Route

**Files:**
- Create: `server/src/routes/notifications.ts`
- Modify: `server/src/index.ts` (mount router)
- Test: `server/src/routes/__tests__/notifications.test.ts`

**Step 1: Write failing tests**

```ts
describe('notifications routes', () => {
  it('GET /api/notifications should return unread notifications', async () => {
    db.run("INSERT INTO notifications (userId, eventId, type, message) VALUES (1, 1, 'threshold_warning', 'test')");
    const res = await fetch(`${baseUrl}/api/notifications`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('PUT /api/notifications/:id/read should mark as read', async () => {
    db.run("INSERT INTO notifications (userId, eventId, type, message) VALUES (1, 1, 'threshold_warning', 'test')");
    const rows = db.exec("SELECT id FROM notifications");
    const id = rows[0].values[0][0];
    const res = await fetch(`${baseUrl}/api/notifications/${id}/read`, { method: 'PUT' });
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Implement notifications route**

Create `server/src/routes/notifications.ts` with GET (list) and PUT /:id/read endpoints. Mount it in the main app.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/routes/notifications.ts server/src/routes/__tests__/notifications.test.ts && git commit -m "feat: add notifications API route (list, mark read)"
```

Mount the router:
```bash
git commit -m "feat: mount notifications router" -- server/src/index.ts
```

---

### Task 9: Tournament Threshold Alert Service

**Files:**
- Create: `server/src/services/tournament-alerts.ts`
- Create: `server/src/services/__tests__/tournament-alerts.test.ts`

**Step 1: Write failing tests**

```ts
describe('tournament-alerts', () => {
  it('should trigger "filling_up" alert at 80% capacity', async () => {
    db.run("INSERT INTO events (type, title, date, maxParticipants) VALUES ('tournament', 'Cup', '2026-06-15', 10)");
    const eventId = getLastInsertId(db);
    for (let i = 0; i < 8; i++) {
      db.run(`INSERT INTO players (name, yearOfBirth) VALUES ('P${i}', 2015)`);
      const pid = getLastInsertId(db);
      db.run(`INSERT INTO attendance (eventId, playerId, status) VALUES (${eventId}, ${pid}, 'attending')`);
    }
    const alert = checkThresholds(eventId);
    expect(alert).toEqual({ type: 'filling_up', message: expect.stringContaining('filling up') });
  });

  it('should trigger "full" alert at 100% capacity', async () => {
    db.run("INSERT INTO events (type, title, date, maxParticipants) VALUES ('tournament', 'Cup', '2026-06-15', 5)");
    const eventId = getLastInsertId(db);
    for (let i = 0; i < 5; i++) {
      db.run(`INSERT INTO players (name, yearOfBirth) VALUES ('P${i}', 2015)`);
      const pid = getLastInsertId(db);
      db.run(`INSERT INTO attendance (eventId, playerId, status) VALUES (${eventId}, ${pid}, 'attending')`);
    }
    const alert = checkThresholds(eventId);
    expect(alert).toEqual({ type: 'full', message: expect.stringContaining('full') });
  });

  it('should return null when no threshold crossed', async () => {
    db.run("INSERT INTO events (type, title, date, maxParticipants) VALUES ('tournament', 'Cup', '2026-06-15', 10)");
    const eventId = getLastInsertId(db);
    db.run(`INSERT INTO players (name, yearOfBirth) VALUES ('P1', 2015)`);
    const pid = getLastInsertId(db);
    db.run(`INSERT INTO attendance (eventId, playerId, status) VALUES (${eventId}, ${pid}, 'attending')`);
    const alert = checkThresholds(eventId);
    expect(alert).toBeNull();
  });

  it('should not re-alert for same threshold', async () => {
    db.run("INSERT INTO events (type, title, date, maxParticipants) VALUES ('tournament', 'Cup', '2026-06-15', 10)");
    const eventId = getLastInsertId(db);
    for (let i = 0; i < 8; i++) {
      db.run(`INSERT INTO players (name, yearOfBirth) VALUES ('P${i}', 2015)`);
      const pid = getLastInsertId(db);
      db.run(`INSERT INTO attendance (eventId, playerId, status) VALUES (${eventId}, ${pid}, 'attending')`);
    }
    const first = checkThresholds(eventId);
    expect(first).not.toBeNull();
    const second = checkThresholds(eventId);
    expect(second).toBeNull();
  });

  it('should return null for open-call events (no maxParticipants)', async () => {
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Open Cup', '2026-06-15')");
    const eventId = getLastInsertId(db);
    const alert = checkThresholds(eventId);
    expect(alert).toBeNull();
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Implement checkThresholds**

Create `server/src/services/tournament-alerts.ts`:

```ts
import { getDB } from '../database.js';

interface AlertResult {
  type: 'filling_up' | 'full' | 'low_registration';
  message: string;
}

export function checkThresholds(eventId: number): AlertResult | null {
  const db = getDB();

  const eventRows = db.exec(
    `SELECT type, title, maxParticipants, minParticipants, deadline FROM events WHERE id = ?`, [eventId]
  );
  if (!eventRows.length || !eventRows[0].values.length) return null;
  const [type, title, maxP, minP, deadline] = eventRows[0].values[0];
  if (type !== 'tournament') return null;
  if (maxP === null) return null;

  const countRows = db.exec(
    `SELECT COUNT(*) FROM attendance WHERE eventId = ? AND status = 'attending'`, [eventId]
  );
  const attending = countRows[0].values[0][0] as number;

  let alertType: AlertResult['type'] | null = null;
  let message = '';

  if (attending >= (maxP as number)) {
    alertType = 'full';
    message = `${title}: Tournament full (${attending}/${maxP} spots taken)`;
  } else if (attending >= (maxP as number) * 0.8) {
    alertType = 'filling_up';
    message = `${title}: Spots filling up (${attending}/${maxP}, ${(maxP as number) - attending} remaining)`;
  }

  if (!alertType) return null;

  const existing = db.exec(`SELECT lastAlertType FROM tournament_alerts WHERE eventId = ?`, [eventId]);
  if (existing.length && existing[0].values.length && existing[0].values[0][0] === alertType) {
    return null;
  }

  db.run(
    `INSERT INTO tournament_alerts (eventId, lastAlertType) VALUES (?, ?)
     ON CONFLICT(eventId) DO UPDATE SET lastAlertType = ?, lastAlertAt = datetime('now')`,
    [eventId, alertType, alertType]
  );

  return { type: alertType, message };
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/tournament-alerts.ts server/src/services/__tests__/tournament-alerts.test.ts && git commit -m "feat: add tournament threshold alert service with deduplication"
```

---

### Task 10: Wire Threshold Alerts into Attendance RSVP

**Files:**
- Modify: `server/src/routes/attendance.ts:79-103` (POST handler)
- Test: `server/src/routes/__tests__/attendance.test.ts`

**Step 1: Write failing test**

```ts
it('should create notification when tournament threshold reached on RSVP', async () => {
  db.run("INSERT INTO events (type, title, date, maxParticipants) VALUES ('tournament', 'Cup', '2026-06-15', 5)");
  const eventId = getLastInsertId(db);
  for (let i = 0; i < 4; i++) {
    db.run(`INSERT INTO players (name, yearOfBirth) VALUES ('P${i}', 2015)`);
    const pid = getLastInsertId(db);
    await fetch(`${baseUrl}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, playerId: pid, status: 'attending' })
    });
  }
  const notifs = db.exec("SELECT * FROM notifications WHERE type = 'filling_up'");
  expect(notifs.length).toBeGreaterThan(0);
});
```

**Step 2: Run test, verify fail**

**Step 3: Wire checkThresholds + notification + WhatsApp into POST /api/attendance**

After the `setAttendance()` call in the POST handler, add:

```ts
import { checkThresholds } from '../services/tournament-alerts.js';
import { createNotification } from '../services/notifications.js';
import { sendMessage } from '../services/whatsapp.js';

// After setAttendance() succeeds:
const alert = checkThresholds(resolvedEventId);
if (alert) {
  const eventRow = db.exec(`SELECT createdBy FROM events WHERE id = ?`, [resolvedEventId]);
  if (eventRow.length && eventRow[0].values.length) {
    const createdBy = eventRow[0].values[0][0] as number;
    createNotification({ userId: createdBy, eventId: resolvedEventId, type: alert.type, message: alert.message });
  }
  // WhatsApp (best-effort)
  try {
    const coachPhone = db.exec(`SELECT phone FROM guardians WHERE id = (SELECT createdBy FROM events WHERE id = ?)`, [resolvedEventId]);
    if (coachPhone.length && coachPhone[0].values.length) {
      await sendMessage(coachPhone[0].values[0][0] as string, alert.message);
    }
  } catch {}
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: wire threshold alerts into attendance RSVP handler" -- server/src/routes/attendance.ts server/src/routes/__tests__/attendance.test.ts
```

---

### Task 11: Public Tournament View API

**Files:**
- Create: `server/src/routes/public-tournaments.ts`
- Create: `server/src/routes/__tests__/public-tournaments.test.ts`
- Modify: `server/src/index.ts` (mount router, no auth)

**Step 1: Write failing tests**

```ts
describe('GET /api/public/tournaments/:id', () => {
  it('should return tournament with team initials (no auth)', async () => {
    db.run("INSERT INTO events (type, title, date, startTime, location, teamName) VALUES ('tournament', 'Summer Cup', '2026-06-15', '09:00', 'Sportplatz', 'FC Example E1')");
    const eventId = getLastInsertId(db);
    db.run(`INSERT INTO teams (eventId, name) VALUES (${eventId}, 'Team A')`);
    const teamId = getLastInsertId(db);
    db.run("INSERT INTO players (name, yearOfBirth) VALUES ('Jonas', 2015)");
    const p1 = getLastInsertId(db);
    db.run("INSERT INTO players (name, yearOfBirth) VALUES ('Felix', 2015)");
    const p2 = getLastInsertId(db);
    db.run(`INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p1})`);
    db.run(`INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p2})`);

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Summer Cup');
    expect(body.teamName).toBe('FC Example E1');
    expect(body.teams[0].players).toEqual([
      { initial: 'J.' },
      { initial: 'F.' }
    ]);
    expect(JSON.stringify(body)).not.toContain('Jonas');
    expect(JSON.stringify(body)).not.toContain('Felix');
  });

  it('should 404 for non-tournament events', async () => {
    db.run("INSERT INTO events (type, title, date) VALUES ('training', 'Training', '2026-06-15')");
    const id = getLastInsertId(db);
    const res = await fetch(`${baseUrl}/api/public/tournaments/${id}`);
    expect(res.status).toBe(404);
  });

  it('should disambiguate colliding initials', async () => {
    db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Cup', '2026-06-15')");
    const eventId = getLastInsertId(db);
    db.run(`INSERT INTO teams (eventId, name) VALUES (${eventId}, 'Team A')`);
    const teamId = getLastInsertId(db);
    db.run("INSERT INTO players (name, yearOfBirth, lastNameInitial) VALUES ('Jonas', 2015, 'M')");
    const p1 = getLastInsertId(db);
    db.run("INSERT INTO players (name, yearOfBirth, lastNameInitial) VALUES ('Jan', 2015, 'S')");
    const p2 = getLastInsertId(db);
    db.run(`INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p1})`);
    db.run(`INSERT INTO team_players (teamId, playerId) VALUES (${teamId}, ${p2})`);

    const res = await fetch(`${baseUrl}/api/public/tournaments/${eventId}`);
    const body = await res.json();
    expect(body.teams[0].players).toEqual([
      { initial: 'J. M.' },
      { initial: 'J. S.' }
    ]);
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Implement public-tournaments route**

Create `server/src/routes/public-tournaments.ts` with GET `/public/tournaments/:id`. Uses `computeInitials` from player-initials service. Returns only initials, never full names. Mount in main app without auth middleware.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/routes/public-tournaments.ts server/src/routes/__tests__/public-tournaments.test.ts && git commit -m "feat: add public tournament view API with privacy-preserving initials"
git commit -m "feat: mount public tournaments router (no auth)" -- server/src/index.ts
```

---

### Task 12: Upcoming Tournaments Filter on Events API

**Files:**
- Modify: `server/src/routes/events.ts:77-149` (GET list handler)
- Test: `server/src/routes/__tests__/events.test.ts`

**Step 1: Write failing test**

```ts
it('should filter upcoming tournaments with ?upcoming=true&type=tournament', async () => {
  db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Past Cup', '2025-01-01')");
  db.run("INSERT INTO events (type, title, date) VALUES ('tournament', 'Future Cup', '2027-06-15')");
  db.run("INSERT INTO events (type, title, date) VALUES ('training', 'Training', '2027-06-15')");

  const res = await fetch(`${baseUrl}/api/events?type=tournament&upcoming=true`);
  const body = await res.json();
  expect(body).toHaveLength(1);
  expect(body[0].title).toBe('Future Cup');
});
```

**Step 2: Run test, verify fail**

**Step 3: Add upcoming filter**

In the GET handler, when `req.query.upcoming === 'true'`, add `AND date >= date('now')` to the WHERE clause.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat(events): add upcoming=true filter for tournament widget" -- server/src/routes/events.ts server/src/routes/__tests__/events.test.ts
```

---

### Task 13: Frontend — Team Name Field on Event Form

**Files:**
- Modify: `web/src/app/events/new/page.tsx`

**Step 1: Add `teamName` to EventFormData interface and form state**

**Step 2: Add text input visible when type is `tournament`**

Placeholder: "e.g., FC Example E1". Include `teamName` in the POST body on submit.

**Step 3: Build to verify**

Run: `cd web && npx next build`

**Step 4: Commit**

```bash
git commit -m "feat(web): add team name field to tournament event form" -- web/src/app/events/new/page.tsx
```

---

### Task 14: Frontend — Open Call Toggle on Event Form

**Files:**
- Modify: `web/src/app/events/new/page.tsx`

**Step 1: Add openCall toggle and minParticipants field**

When `openCall` is checked, hide maxParticipants and send `null`. Show optional `minParticipants` input.

**Step 2: Build to verify**

Run: `cd web && npx next build`

**Step 3: Commit**

```bash
git commit -m "feat(web): add open call toggle for tournament events" -- web/src/app/events/new/page.tsx
```

---

### Task 15: Frontend — lastNameInitial on Player Management

**Files:**
- Modify: `web/src/components/PlayerList.tsx` (Player interface)
- Modify: `web/src/app/players/page.tsx` (add/edit modal)

**Step 1: Add `lastNameInitial?: string` to Player interface**

**Step 2: Add single-char input to player add/edit modal**

Label: "Last Name Initial (for disambiguation)", maxLength=1, auto-uppercase.

**Step 3: Include in POST/PUT body**

**Step 4: Build to verify**

Run: `cd web && npx next build`

**Step 5: Commit**

```bash
git commit -m "feat(web): add lastNameInitial to player add/edit form" -- web/src/app/players/page.tsx web/src/components/PlayerList.tsx
```

---

### Task 16: Frontend — Public Tournament View Page

**Files:**
- Create: `web/src/app/tournaments/[id]/page.tsx`

**Step 1: Create page component**

Fetches `GET /api/public/tournaments/:id` (no auth). Displays title, date, time, location, team name, status badge, team cards with player initials. No register button (read-only).

**Step 2: Build to verify**

Run: `cd web && npx next build`

**Step 3: Commit**

```bash
git restore --staged :/ && git add "web/src/app/tournaments/[id]/page.tsx" && git commit -m "feat(web): add public tournament view page with privacy-preserving initials"
```

---

### Task 17: Frontend — Upcoming Tournaments Widget

**Files:**
- Create: `web/src/components/UpcomingTournaments.tsx`
- Modify: `web/src/app/dashboard/page.tsx` (render after OnboardingChecklist)

**Step 1: Create UpcomingTournaments component**

Fetches `/events?type=tournament&upcoming=true`, shows next 3 tournaments with title, date, location, status badge. Read-only.

**Step 2: Add to dashboard after OnboardingChecklist**

**Step 3: Build to verify**

Run: `cd web && npx next build`

**Step 4: Commit**

```bash
git restore --staged :/ && git add web/src/components/UpcomingTournaments.tsx && git commit -m "feat(web): add upcoming tournaments widget component"
git commit -m "feat(web): add upcoming tournaments widget to dashboard" -- web/src/app/dashboard/page.tsx
```

---

### Task 18: Frontend — Notification Bell on Dashboard

**Files:**
- Create: `web/src/components/NotificationBell.tsx`
- Modify: `web/src/app/dashboard/page.tsx`

**Step 1: Create NotificationBell component**

Fetches `GET /api/notifications`, shows bell icon with unread count badge. Dropdown lists notifications with dismiss button (calls `PUT /api/notifications/:id/read`).

**Step 2: Add to dashboard header area**

**Step 3: Build to verify**

Run: `cd web && npx next build`

**Step 4: Commit**

```bash
git restore --staged :/ && git add web/src/components/NotificationBell.tsx && git commit -m "feat(web): add notification bell component"
git commit -m "feat(web): add notification bell to dashboard" -- web/src/app/dashboard/page.tsx
```

---

### Task 19: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md`
- Modify or create: `RELEASE_NOTES.md`

**Step 1: Mark all 6 tournament management items as done in FEATURES.md**

**Step 2: Add new server/frontend entries to FEATURES.md**

**Step 3: Add release notes entry**

**Step 4: Commit**

```bash
git commit -m "docs: update FEATURES.md and RELEASE_NOTES.md for tournament management" -- FEATURES.md RELEASE_NOTES.md
```

---

### Task 20: Run Full Test Suite and Final Verification

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 2: Build frontend**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 3: Fix any failures and commit fixes**
