# GDPR Data Privacy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement GDPR data subject rights — data export, data deletion, and explicit consent tracking with a guardian-request / admin-approval workflow.

**Architecture:** New `gdpr_requests` table stores export/deletion requests. Guardians submit requests via token auth, admins approve via JWT auth. Export generates a ZIP with JSON+CSV. Deletion anonymizes player data and removes guardian PII. Consent tracking adds timestamps to the existing `consentGiven` field.

**Tech Stack:** Express.js routes, sql.js database, Node.js `archiver` for ZIP generation, vitest for tests.

---

### Task 1: Database Migration — Add GDPR columns and table

**Files:**
- Modify: `server/src/database.ts`

**Step 1: Add `gdpr_requests` table to SCHEMA**

In `server/src/database.ts`, add this table to the `SCHEMA` string, after the `game_history_matches` CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS gdpr_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardianId INTEGER NOT NULL REFERENCES guardians(id),
  type TEXT NOT NULL CHECK(type IN ('export', 'deletion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
  reason TEXT,
  adminNote TEXT,
  processedBy INTEGER REFERENCES guardians(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  processedAt TEXT,
  completedAt TEXT,
  resultPath TEXT
);
```

**Step 2: Add migration for `consentGivenAt` and `consentWithdrawnAt` columns**

In `server/src/database.ts`, after the existing guardian column migrations (the `resetToken` / `resetTokenExpiry` block around line 251-256), add:

```typescript
if (!cols.includes('consentGivenAt')) {
  db.run("ALTER TABLE guardians ADD COLUMN consentGivenAt TEXT");
}
if (!cols.includes('consentWithdrawnAt')) {
  db.run("ALTER TABLE guardians ADD COLUMN consentWithdrawnAt TEXT");
}
```

**Step 3: Verify migration works**

Run: `cd server && npx vitest run src/__tests__/database.test.ts`
Expected: PASS — schema creates cleanly

**Step 4: Commit**

```
git commit -m "feat(gdpr): add gdpr_requests table and consent timestamp columns" -- server/src/database.ts
```

---

### Task 2: GDPR Service — Core logic

**Files:**
- Create: `server/src/services/gdpr.ts`
- Create: `server/src/services/__tests__/gdpr.test.ts`

**Step 1: Write the failing test**

Create `server/src/services/__tests__/gdpr.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB, getDB, getLastInsertId } from "../../database.js";
import type { Database } from "sql.js";
import {
  createGdprRequest,
  listGdprRequests,
  getGdprRequest,
  approveRequest,
  rejectRequest,
  updateConsent,
  executeDeletion,
  generateExport,
} from "../gdpr.js";

let db: Database;

beforeEach(async () => {
  db = await initDB();
});

afterEach(() => {
  db.close();
});

function createGuardian(phone: string, name: string): number {
  const db = getDB();
  db.run(
    "INSERT INTO guardians (phone, name, email, role, consentGiven) VALUES (?, ?, ?, 'parent', 1)",
    [phone, name, `${name.toLowerCase().replace(" ", "")}@test.com`]
  );
  return getLastInsertId();
}

function createAdmin(): number {
  const db = getDB();
  db.run(
    "INSERT INTO guardians (phone, name, email, role, passwordHash, consentGiven) VALUES (?, ?, ?, 'admin', 'hash', 1)",
    ["+41790000000", "Admin", "admin@test.com"]
  );
  return getLastInsertId();
}

function createPlayer(name: string, yearOfBirth: number): number {
  const db = getDB();
  db.run("INSERT INTO players (name, yearOfBirth) VALUES (?, ?)", [name, yearOfBirth]);
  return getLastInsertId();
}

function linkGuardianPlayer(guardianId: number, playerId: number): void {
  const db = getDB();
  db.run("INSERT INTO guardian_players (guardianId, playerId) VALUES (?, ?)", [guardianId, playerId]);
}

function createEvent(title: string, date: string): number {
  const db = getDB();
  db.run("INSERT INTO events (type, title, date) VALUES ('training', ?, ?)", [title, date]);
  return getLastInsertId();
}

function createAttendance(eventId: number, playerId: number, status: string): void {
  const db = getDB();
  db.run("INSERT INTO attendance (eventId, playerId, status) VALUES (?, ?, ?)", [eventId, playerId, status]);
}

describe("GDPR Service", () => {
  describe("createGdprRequest", () => {
    it("creates a pending export request", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      const req = createGdprRequest(gId, "export");
      expect(req.id).toBeGreaterThan(0);
      expect(req.type).toBe("export");
      expect(req.status).toBe("pending");
      expect(req.guardianId).toBe(gId);
    });

    it("creates a pending deletion request with reason", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      const req = createGdprRequest(gId, "deletion", "Leaving club");
      expect(req.type).toBe("deletion");
      expect(req.reason).toBe("Leaving club");
    });

    it("rejects invalid type", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      expect(() => createGdprRequest(gId, "invalid" as any)).toThrow();
    });
  });

  describe("listGdprRequests", () => {
    it("returns all requests", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      createGdprRequest(gId, "export");
      createGdprRequest(gId, "deletion");
      const list = listGdprRequests();
      expect(list).toHaveLength(2);
    });

    it("filters by status", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      createGdprRequest(gId, "export");
      createGdprRequest(gId, "deletion");
      const pending = listGdprRequests("pending");
      expect(pending).toHaveLength(2);
      const approved = listGdprRequests("approved");
      expect(approved).toHaveLength(0);
    });
  });

  describe("getGdprRequest", () => {
    it("returns a single request with guardian info", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      const created = createGdprRequest(gId, "export");
      const req = getGdprRequest(created.id);
      expect(req).not.toBeNull();
      expect(req!.guardianName).toBe("Test Parent");
    });

    it("returns null for non-existent request", () => {
      expect(getGdprRequest(999)).toBeNull();
    });
  });

  describe("approveRequest / rejectRequest", () => {
    it("approves a pending request", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      const adminId = createAdmin();
      const created = createGdprRequest(gId, "export");
      const approved = approveRequest(created.id, adminId);
      expect(approved.status).toBe("approved");
      expect(approved.processedBy).toBe(adminId);
      expect(approved.processedAt).toBeTruthy();
    });

    it("rejects a pending request with note", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      const adminId = createAdmin();
      const created = createGdprRequest(gId, "export");
      const rejected = rejectRequest(created.id, adminId, "Not valid");
      expect(rejected.status).toBe("rejected");
      expect(rejected.adminNote).toBe("Not valid");
    });

    it("throws when approving non-pending request", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      const adminId = createAdmin();
      const created = createGdprRequest(gId, "export");
      approveRequest(created.id, adminId);
      expect(() => approveRequest(created.id, adminId)).toThrow("not pending");
    });
  });

  describe("updateConsent", () => {
    it("gives consent with timestamp", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      updateConsent(gId, true);
      const rows = db.exec("SELECT consentGiven, consentGivenAt, consentWithdrawnAt FROM guardians WHERE id = ?", [gId]);
      expect(rows[0].values[0][0]).toBe(1);
      expect(rows[0].values[0][1]).toBeTruthy();
      expect(rows[0].values[0][2]).toBeNull();
    });

    it("withdraws consent with timestamp", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      updateConsent(gId, true);
      updateConsent(gId, false);
      const rows = db.exec("SELECT consentGiven, consentWithdrawnAt FROM guardians WHERE id = ?", [gId]);
      expect(rows[0].values[0][0]).toBe(0);
      expect(rows[0].values[0][1]).toBeTruthy();
    });
  });

  describe("executeDeletion", () => {
    it("anonymizes players and deletes guardian", () => {
      const gId = createGuardian("+41791111111", "Test Parent");
      const pId = createPlayer("Child Name", 2016);
      linkGuardianPlayer(gId, pId);
      const eventId = createEvent("Training", "2026-03-01");
      createAttendance(eventId, pId, "in");

      const adminId = createAdmin();
      const req = createGdprRequest(gId, "deletion");
      approveRequest(req.id, adminId);
      executeDeletion(gId, req.id);

      // Guardian should be deleted
      const guardians = db.exec("SELECT * FROM guardians WHERE id = ?", [gId]);
      expect(guardians.length === 0 || guardians[0].values.length === 0).toBe(true);

      // Player should be anonymized
      const players = db.exec("SELECT name, yearOfBirth, position, notes FROM players WHERE id = ?", [pId]);
      expect(players[0].values[0][0]).toBe("Deleted Player");
      expect(players[0].values[0][1]).toBeNull();
      expect(players[0].values[0][2]).toBeNull();
      expect(players[0].values[0][3]).toBeNull();

      // guardian_players link should be removed
      const links = db.exec("SELECT * FROM guardian_players WHERE guardianId = ?", [gId]);
      expect(links.length === 0 || links[0].values.length === 0).toBe(true);

      // Attendance record should still exist (anonymized via player)
      const att = db.exec("SELECT * FROM attendance WHERE playerId = ?", [pId]);
      expect(att[0].values).toHaveLength(1);

      // Request should be marked completed
      const updatedReq = getGdprRequest(req.id);
      expect(updatedReq!.status).toBe("completed");
    });

    it("handles guardian with no linked players", () => {
      const gId = createGuardian("+41791111111", "Lone Parent");
      const adminId = createAdmin();
      const req = createGdprRequest(gId, "deletion");
      approveRequest(req.id, adminId);

      expect(() => executeDeletion(gId, req.id)).not.toThrow();

      const guardians = db.exec("SELECT * FROM guardians WHERE id = ?", [gId]);
      expect(guardians.length === 0 || guardians[0].values.length === 0).toBe(true);
    });
  });

  describe("generateExport", () => {
    it("returns export data for a guardian with players and attendance", () => {
      const gId = createGuardian("+41791111111", "Export Parent");
      const pId = createPlayer("Export Child", 2016);
      linkGuardianPlayer(gId, pId);
      const eventId = createEvent("Training", "2026-03-01");
      createAttendance(eventId, pId, "in");

      const data = generateExport(gId);
      expect(data.guardian.name).toBe("Export Parent");
      expect(data.guardian.phone).toBe("+41791111111");
      expect(data.players).toHaveLength(1);
      expect(data.players[0].name).toBe("Export Child");
      expect(data.attendance).toHaveLength(1);
      expect(data.attendance[0].status).toBe("in");
    });

    it("returns empty arrays when guardian has no linked data", () => {
      const gId = createGuardian("+41791111111", "Lonely Parent");
      const data = generateExport(gId);
      expect(data.guardian.name).toBe("Lonely Parent");
      expect(data.players).toHaveLength(0);
      expect(data.attendance).toHaveLength(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/gdpr.test.ts`
Expected: FAIL — cannot resolve `../gdpr.js`

**Step 3: Implement the GDPR service**

Create `server/src/services/gdpr.ts`:

```typescript
import { getDB, getLastInsertId } from "../database.js";

export interface GdprRequest {
  id: number;
  guardianId: number;
  type: "export" | "deletion";
  status: "pending" | "approved" | "rejected" | "completed";
  reason: string | null;
  adminNote: string | null;
  processedBy: number | null;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  resultPath: string | null;
  guardianName?: string;
  guardianPhone?: string;
}

export interface ExportData {
  guardian: {
    id: number;
    phone: string;
    name: string | null;
    email: string | null;
    role: string;
    language: string;
    consentGiven: number;
    consentGivenAt: string | null;
    consentWithdrawnAt: string | null;
    createdAt: string;
  };
  players: Array<{
    id: number;
    name: string;
    yearOfBirth: number | null;
    category: string | null;
    position: string | null;
    notes: string | null;
  }>;
  attendance: Array<{
    eventId: number;
    eventTitle: string;
    eventDate: string;
    playerId: number;
    playerName: string;
    status: string;
    reason: string | null;
    respondedAt: string | null;
    source: string;
  }>;
}

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[]
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

export function createGdprRequest(
  guardianId: number,
  type: "export" | "deletion",
  reason?: string
): GdprRequest {
  if (type !== "export" && type !== "deletion") {
    throw new Error(`Invalid GDPR request type: ${type}`);
  }

  const db = getDB();
  db.run(
    "INSERT INTO gdpr_requests (guardianId, type, reason) VALUES (?, ?, ?)",
    [guardianId, type, reason ?? null]
  );
  const id = getLastInsertId();
  const rows = rowsToObjects(db.exec("SELECT * FROM gdpr_requests WHERE id = ?", [id]));
  return rows[0] as unknown as GdprRequest;
}

export function listGdprRequests(status?: string): GdprRequest[] {
  const db = getDB();
  let sql = `SELECT r.*, g.name AS guardianName, g.phone AS guardianPhone
             FROM gdpr_requests r
             LEFT JOIN guardians g ON r.guardianId = g.id
             ORDER BY r.createdAt DESC`;
  const params: unknown[] = [];

  if (status) {
    sql = `SELECT r.*, g.name AS guardianName, g.phone AS guardianPhone
           FROM gdpr_requests r
           LEFT JOIN guardians g ON r.guardianId = g.id
           WHERE r.status = ?
           ORDER BY r.createdAt DESC`;
    params.push(status);
  }

  return rowsToObjects(db.exec(sql, params)) as unknown as GdprRequest[];
}

export function getGdprRequest(id: number): GdprRequest | null {
  const db = getDB();
  const rows = rowsToObjects(
    db.exec(
      `SELECT r.*, g.name AS guardianName, g.phone AS guardianPhone
       FROM gdpr_requests r
       LEFT JOIN guardians g ON r.guardianId = g.id
       WHERE r.id = ?`,
      [id]
    )
  );
  return rows.length > 0 ? (rows[0] as unknown as GdprRequest) : null;
}

export function approveRequest(requestId: number, adminId: number): GdprRequest {
  const req = getGdprRequest(requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is not pending");

  const db = getDB();
  db.run(
    "UPDATE gdpr_requests SET status = 'approved', processedBy = ?, processedAt = datetime('now') WHERE id = ?",
    [adminId, requestId]
  );
  return getGdprRequest(requestId)!;
}

export function rejectRequest(
  requestId: number,
  adminId: number,
  note?: string
): GdprRequest {
  const req = getGdprRequest(requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is not pending");

  const db = getDB();
  db.run(
    "UPDATE gdpr_requests SET status = 'rejected', processedBy = ?, processedAt = datetime('now'), adminNote = ? WHERE id = ?",
    [adminId, note ?? null, requestId]
  );
  return getGdprRequest(requestId)!;
}

export function updateConsent(guardianId: number, consent: boolean): void {
  const db = getDB();
  if (consent) {
    db.run(
      "UPDATE guardians SET consentGiven = 1, consentGivenAt = datetime('now'), consentWithdrawnAt = NULL WHERE id = ?",
      [guardianId]
    );
  } else {
    db.run(
      "UPDATE guardians SET consentGiven = 0, consentWithdrawnAt = datetime('now') WHERE id = ?",
      [guardianId]
    );
  }
}

export function executeDeletion(guardianId: number, requestId: number): void {
  const db = getDB();

  // Find all players linked to this guardian
  const playerRows = rowsToObjects(
    db.exec(
      "SELECT playerId FROM guardian_players WHERE guardianId = ?",
      [guardianId]
    )
  );

  // Anonymize each linked player (only if no other guardian is linked)
  for (const row of playerRows) {
    const playerId = row.playerId as number;
    const otherGuardians = rowsToObjects(
      db.exec(
        "SELECT guardianId FROM guardian_players WHERE playerId = ? AND guardianId != ?",
        [playerId, guardianId]
      )
    );

    if (otherGuardians.length === 0) {
      db.run(
        "UPDATE players SET name = 'Deleted Player', yearOfBirth = NULL, position = NULL, notes = NULL, category = NULL WHERE id = ?",
        [playerId]
      );
    }
  }

  // Remove guardian-player links
  db.run("DELETE FROM guardian_players WHERE guardianId = ?", [guardianId]);

  // Delete the guardian record
  db.run("DELETE FROM guardians WHERE id = ?", [guardianId]);

  // Mark request as completed
  db.run(
    "UPDATE gdpr_requests SET status = 'completed', completedAt = datetime('now') WHERE id = ?",
    [requestId]
  );
}

export function generateExport(guardianId: number): ExportData {
  const db = getDB();

  const guardianRows = rowsToObjects(
    db.exec(
      "SELECT id, phone, name, email, role, language, consentGiven, consentGivenAt, consentWithdrawnAt, createdAt FROM guardians WHERE id = ?",
      [guardianId]
    )
  );

  if (guardianRows.length === 0) {
    throw new Error("Guardian not found");
  }

  const guardian = guardianRows[0] as unknown as ExportData["guardian"];

  const players = rowsToObjects(
    db.exec(
      `SELECT p.id, p.name, p.yearOfBirth, p.category, p.position, p.notes
       FROM players p
       JOIN guardian_players gp ON p.id = gp.playerId
       WHERE gp.guardianId = ?`,
      [guardianId]
    )
  ) as unknown as ExportData["players"];

  const playerIds = players.map((p) => p.id);
  let attendance: ExportData["attendance"] = [];

  if (playerIds.length > 0) {
    const placeholders = playerIds.map(() => "?").join(",");
    attendance = rowsToObjects(
      db.exec(
        `SELECT a.eventId, e.title AS eventTitle, e.date AS eventDate,
                a.playerId, p.name AS playerName, a.status, a.reason, a.respondedAt, a.source
         FROM attendance a
         JOIN events e ON a.eventId = e.id
         JOIN players p ON a.playerId = p.id
         WHERE a.playerId IN (${placeholders})
         ORDER BY e.date DESC`,
        playerIds
      )
    ) as unknown as ExportData["attendance"];
  }

  return { guardian, players, attendance };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/gdpr.test.ts`
Expected: All PASS

**Step 5: Commit**

```
git restore --staged :/ && git add "server/src/services/gdpr.ts" "server/src/services/__tests__/gdpr.test.ts" && git commit -m "feat(gdpr): add GDPR service with export, deletion, and consent logic" -- server/src/services/gdpr.ts server/src/services/__tests__/gdpr.test.ts
```

---

### Task 3: GDPR Routes — API endpoints

**Files:**
- Create: `server/src/routes/gdpr.ts`
- Create: `server/src/routes/__tests__/gdpr.test.ts`
- Modify: `server/src/index.ts` (register the router)

**Step 1: Write the failing route test**

Create `server/src/routes/__tests__/gdpr.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB, getDB, getLastInsertId } from "../../database.js";
import { gdprRouter } from "../gdpr.js";
import { playersRouter } from "../players.js";
import { generateJWT, generateAccessToken } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;

async function createTestApp() {
  db = await initDB();
  const app = express();
  app.use(express.json());
  app.use("/api", gdprRouter);
  app.use("/api", playersRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

async function teardown() {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  db.close();
}

function createParentWithToken(): { id: number; token: string } {
  const db = getDB();
  const token = generateAccessToken();
  db.run(
    "INSERT INTO guardians (phone, name, email, role, accessToken, consentGiven) VALUES (?, ?, ?, 'parent', ?, 1)",
    ["+41791111111", "Test Parent", "parent@test.com", token]
  );
  return { id: getLastInsertId(), token };
}

function createAdminWithJWT(): { id: number; jwt: string } {
  const db = getDB();
  db.run(
    "INSERT INTO guardians (phone, name, email, role, passwordHash, consentGiven) VALUES (?, ?, ?, 'admin', 'hash', 1)",
    ["+41790000000", "Admin", "admin@test.com"]
  );
  const id = getLastInsertId();
  return { id, jwt: generateJWT({ id, role: "admin" }) };
}

describe("GDPR Routes", () => {
  beforeEach(async () => {
    await createTestApp();
  });
  afterEach(async () => {
    await teardown();
  });

  describe("PUT /api/guardians/:id/consent", () => {
    it("updates consent via token auth", async () => {
      const { id, token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/guardians/${id}/consent?token=${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.consentGiven).toBe(1);
      expect(body.consentGivenAt).toBeTruthy();
    });

    it("rejects consent update for different guardian", async () => {
      const { id: firstId } = createParentWithToken();
      const db = getDB();
      const otherToken = generateAccessToken();
      db.run(
        "INSERT INTO guardians (phone, name, role, accessToken) VALUES (?, ?, 'parent', ?)",
        ["+41792222222", "Other", otherToken]
      );

      const res = await fetch(`${baseUrl}/api/guardians/${firstId}/consent?token=${otherToken}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      expect(res.status).toBe(403);
    });

    it("allows admin to update any guardian consent", async () => {
      const { id: parentId } = createParentWithToken();
      const { jwt } = createAdminWithJWT();
      const res = await fetch(`${baseUrl}/api/guardians/${parentId}/consent`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ consent: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.consentGiven).toBe(0);
    });
  });

  describe("POST /api/gdpr/requests", () => {
    it("creates an export request via token auth", async () => {
      const { id, token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.type).toBe("export");
      expect(body.status).toBe("pending");
      expect(body.guardianId).toBe(id);
    });

    it("creates a deletion request with reason", async () => {
      const { token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "deletion", reason: "Leaving club" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.type).toBe("deletion");
      expect(body.reason).toBe("Leaving club");
    });

    it("rejects invalid type", async () => {
      const { token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invalid" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/gdpr/requests (admin)", () => {
    it("lists all requests for admin", async () => {
      const { token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });

      const res = await fetch(`${baseUrl}/api/gdpr/requests`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it("rejects non-admin access", async () => {
      const { token } = createParentWithToken();
      const res = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe("PUT /api/gdpr/requests/:id (admin approve/reject)", () => {
    it("approves a request", async () => {
      const { token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/gdpr/requests/${reqId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ status: "approved" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("approved");
    });

    it("rejects a request with note", async () => {
      const { token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/gdpr/requests/${reqId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ status: "rejected", adminNote: "Not valid" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("rejected");
      expect(body.adminNote).toBe("Not valid");
    });
  });

  describe("GET /api/gdpr/exports/:id (download)", () => {
    it("generates and returns export ZIP for approved request", async () => {
      const { id: parentId, token } = createParentWithToken();
      const { jwt } = createAdminWithJWT();

      // Create a player and link to guardian
      const playerRes = await fetch(`${baseUrl}/api/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Export Kid", yearOfBirth: 2016 }),
      });
      const { id: playerId } = await playerRes.json();
      await fetch(`${baseUrl}/api/guardians/${parentId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });

      // Create export request
      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      // Approve it
      await fetch(`${baseUrl}/api/gdpr/requests/${reqId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ status: "approved" }),
      });

      // Download
      const res = await fetch(`${baseUrl}/api/gdpr/exports/${reqId}?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/zip");
    });

    it("rejects download for non-approved request", async () => {
      const { token } = createParentWithToken();

      const createRes = await fetch(`${baseUrl}/api/gdpr/requests?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "export" }),
      });
      const { id: reqId } = await createRes.json();

      const res = await fetch(`${baseUrl}/api/gdpr/exports/${reqId}?token=${token}`);
      expect(res.status).toBe(403);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/gdpr.test.ts`
Expected: FAIL — cannot resolve `../gdpr.js`

**Step 3: Install archiver dependency**

Run: `cd server && npm install archiver && npm install -D @types/archiver`

**Step 4: Implement the GDPR route**

Create `server/src/routes/gdpr.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import archiver from "archiver";
import { getDB } from "../database.js";
import { authMiddleware, tokenAuthMiddleware, requireRole } from "../auth.js";
import {
  createGdprRequest,
  listGdprRequests,
  getGdprRequest,
  approveRequest,
  rejectRequest,
  updateConsent,
  executeDeletion,
  generateExport,
} from "../services/gdpr.js";

export const gdprRouter = Router();

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[]
): Record<string, unknown>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

// Middleware that accepts either token or JWT auth
function flexAuth(req: Request, res: Response, next: () => void): void {
  if (req.query.token) {
    tokenAuthMiddleware(req, res, next);
  } else if (req.headers.authorization) {
    authMiddleware(req, res, next);
  } else {
    res.status(401).json({ error: "Authentication required" });
  }
}

// PUT /api/guardians/:id/consent
gdprRouter.put("/guardians/:id/consent", flexAuth, (req: Request, res: Response) => {
  const guardianId = Number(req.params.id);
  const { consent } = req.body;

  if (typeof consent !== "boolean") {
    res.status(400).json({ error: "consent (boolean) is required" });
    return;
  }

  // Guardian can only update their own consent, unless admin
  if (req.user!.role !== "admin" && req.user!.id !== guardianId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  updateConsent(guardianId, consent);

  const db = getDB();
  const rows = rowsToObjects(
    db.exec(
      "SELECT id, consentGiven, consentGivenAt, consentWithdrawnAt FROM guardians WHERE id = ?",
      [guardianId]
    )
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Guardian not found" });
    return;
  }

  res.json(rows[0]);
});

// POST /api/gdpr/requests — guardian creates export or deletion request
gdprRouter.post("/gdpr/requests", flexAuth, (req: Request, res: Response) => {
  const { type, reason } = req.body;

  if (type !== "export" && type !== "deletion") {
    res.status(400).json({ error: "type must be 'export' or 'deletion'" });
    return;
  }

  try {
    const request = createGdprRequest(req.user!.id, type, reason);
    res.status(201).json(request);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/gdpr/requests — admin lists all requests
gdprRouter.get(
  "/gdpr/requests",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const requests = listGdprRequests(status);
    res.json(requests);
  }
);

// GET /api/gdpr/requests/:id — admin gets single request
gdprRouter.get(
  "/gdpr/requests/:id",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const request = getGdprRequest(Number(req.params.id));
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json(request);
  }
);

// PUT /api/gdpr/requests/:id — admin approves or rejects
gdprRouter.put(
  "/gdpr/requests/:id",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const requestId = Number(req.params.id);
    const { status, adminNote } = req.body;

    try {
      let updated;
      if (status === "approved") {
        updated = approveRequest(requestId, req.user!.id);

        // For deletion requests, execute immediately on approval
        const request = getGdprRequest(requestId)!;
        if (request.type === "deletion") {
          executeDeletion(request.guardianId, requestId);
          updated = getGdprRequest(requestId)!;
        }
      } else if (status === "rejected") {
        updated = rejectRequest(requestId, req.user!.id, adminNote);
      } else {
        res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
        return;
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// GET /api/gdpr/exports/:id — guardian downloads their export
gdprRouter.get("/gdpr/exports/:id", flexAuth, (req: Request, res: Response) => {
  const requestId = Number(req.params.id);
  const request = getGdprRequest(requestId);

  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  // Only the owning guardian or an admin can download
  if (req.user!.role !== "admin" && req.user!.id !== request.guardianId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (request.type !== "export") {
    res.status(400).json({ error: "Not an export request" });
    return;
  }

  if (request.status !== "approved" && request.status !== "completed") {
    res.status(403).json({ error: "Export not yet approved" });
    return;
  }

  try {
    const data = generateExport(request.guardianId);

    // Generate CSV strings
    const guardianCsv = objectToCsv([data.guardian]);
    const playersCsv = objectToCsv(data.players);
    const attendanceCsv = objectToCsv(data.attendance);

    // Stream ZIP response
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="gdpr-export-${requestId}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    archive.append(JSON.stringify(data.guardian, null, 2), { name: "guardian.json" });
    archive.append(JSON.stringify(data.players, null, 2), { name: "players.json" });
    archive.append(JSON.stringify(data.attendance, null, 2), { name: "attendance.json" });
    archive.append(guardianCsv, { name: "guardian.csv" });
    archive.append(playersCsv, { name: "players.csv" });
    archive.append(attendanceCsv, { name: "attendance.csv" });
    archive.finalize();

    // Mark as completed
    const db = getDB();
    db.run(
      "UPDATE gdpr_requests SET status = 'completed', completedAt = datetime('now') WHERE id = ?",
      [requestId]
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function objectToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val == null) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}
```

**Step 5: Register the router in index.ts**

In `server/src/index.ts`, add after the onboarding import (line 28):

```typescript
import { gdprRouter } from "./routes/gdpr.js";
```

And register after `app.use("/api", onboardingRouter);` (line 61):

```typescript
app.use("/api", gdprRouter);
```

**Step 6: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/gdpr.test.ts`
Expected: All PASS

**Step 7: Commit**

```
git restore --staged :/ && git add "server/src/routes/gdpr.ts" "server/src/routes/__tests__/gdpr.test.ts" "server/src/index.ts" "server/package.json" "server/package-lock.json" && git commit -m "feat(gdpr): add GDPR API routes for consent, export, and deletion requests" -- server/src/routes/gdpr.ts server/src/routes/__tests__/gdpr.test.ts server/src/index.ts server/package.json server/package-lock.json
```

---

### Task 4: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md`
- Modify or create: `RELEASE_NOTES.md`

**Step 1: Update FEATURES.md**

Change the three GDPR items from `- [ ]` to `- [x]`:

```markdown
## Remaining — Data Privacy & GDPR (PRD 4.5.5)

- [x] Data export for guardians (GDPR right of access)
- [x] Data deletion for guardians (GDPR right to erasure)
- [x] Explicit consent tracking per guardian
```

**Step 2: Update RELEASE_NOTES.md**

Add a new section:

```markdown
## Version 1.x.x (Fri, Feb 28 2026)

* GDPR: Guardians can request a full data export (JSON + CSV) of their personal data and their children's attendance records
* GDPR: Guardians can request account and data deletion — player data is anonymized, attendance statistics preserved
* GDPR: Explicit consent tracking with timestamps — guardians can give or withdraw consent at any time
* GDPR: All data requests go through an admin approval workflow for transparency and control
```

**Step 3: Commit**

```
git commit -m "docs: update FEATURES.md and RELEASE_NOTES.md for GDPR implementation" -- FEATURES.md RELEASE_NOTES.md
```

---

### Task 5: Run full test suite and verify build

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 2: Run TypeScript compilation check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Fix any issues found**

If there are any test or type errors, fix them before proceeding.

**Step 4: Commit any fixes**

Only if fixes were needed.
