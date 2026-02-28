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
