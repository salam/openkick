import { describe, it, expect, beforeEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";
import {
  getCurrentSemester,
  listInstances,
  getInstance,
  createInstance,
  toggleItem,
  addCustomItem,
  removeItem,
  reorderItems,
  instantiateFromTemplate,
  getActiveClassifications,
  setClassifications,
  resetAdminChecklists,
  ensureTrainingChecklist,
  ensureTournamentChecklist,
  refilterAdminChecklist,
} from "../checklist.service.js";

let db: Database;

function createEvent(type: string = "training"): number {
  db.run(
    "INSERT INTO events (type, title, date) VALUES (?, ?, ?)",
    [type, "Test Event", "2026-03-15"]
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function createGuardian(): number {
  db.run(
    "INSERT INTO guardians (phone, role) VALUES (?, ?)",
    ["+41791234567", "coach"]
  );
  const result = db.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

describe("checklist service", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  describe("getCurrentSemester", () => {
    it("returns spring for Feb 1", () => {
      expect(getCurrentSemester(new Date("2026-02-01"))).toBe("2026-spring");
    });

    it("returns spring for Jul 31", () => {
      expect(getCurrentSemester(new Date("2026-07-31"))).toBe("2026-spring");
    });

    it("returns autumn for Aug 1", () => {
      expect(getCurrentSemester(new Date("2026-08-01"))).toBe("2026-autumn");
    });

    it("returns autumn for Dec 15", () => {
      expect(getCurrentSemester(new Date("2026-12-15"))).toBe("2026-autumn");
    });

    it("returns previous year autumn for Jan 31", () => {
      expect(getCurrentSemester(new Date("2026-01-31"))).toBe("2025-autumn");
    });
  });

  describe("instantiateFromTemplate", () => {
    it("creates admin instance with universal template items", () => {
      const instance = instantiateFromTemplate("admin", null);
      expect(instance).toBeTruthy();
      const full = getInstance(instance.id);
      expect(full.items.length).toBe(7);
      expect(full.items[0].label).toContain("Liability insurance");
    });

    it("creates training instance with training template items", () => {
      const eventId = createEvent("training");
      const instance = instantiateFromTemplate("training", eventId);
      const full = getInstance(instance.id);
      expect(full.items.length).toBe(5);
      expect(full.items[0].label).toContain("Balls, cones");
    });

    it("creates tournament instance with tournament template items", () => {
      const eventId = createEvent("tournament");
      const instance = instantiateFromTemplate("tournament", eventId);
      const full = getInstance(instance.id);
      expect(full.items.length).toBe(8);
      expect(full.items[0].label).toContain("Registration submitted");
    });
  });

  describe("classification filtering", () => {
    it("includes classification-specific templates when classification is active", () => {
      setClassifications(1, ["sportamt_zurich"]);
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id);
      expect(full.items.length).toBe(9);
      const labels = full.items.map((i: { label: string }) => i.label);
      expect(labels).toContain("Registration with Sportamt Zurich submitted");
    });

    it("excludes non-matching classification templates", () => {
      setClassifications(1, ["sfv"]);
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id);
      expect(full.items.length).toBe(9);
      const labels = full.items.map((i: { label: string }) => i.label);
      expect(labels).not.toContain("Registration with Sportamt Zurich submitted");
      expect(labels).toContain("SFV team registration and licence fees paid");
    });

    it("getActiveClassifications returns set classifications", () => {
      setClassifications(1, ["sfv", "fvrz"]);
      const result = getActiveClassifications(1);
      expect(result).toContain("sfv");
      expect(result).toContain("fvrz");
      expect(result).not.toContain("sportamt_zurich");
    });
  });

  describe("CRUD operations", () => {
    it("createInstance creates a custom checklist with items", () => {
      const instance = createInstance("admin", null, [
        { label: "Custom task 1", sortOrder: 1 },
        { label: "Custom task 2", sortOrder: 2 },
      ]);
      expect(instance.id).toBeGreaterThan(0);
      const full = getInstance(instance.id);
      expect(full.items.length).toBe(2);
      expect(full.items[0].is_custom).toBe(1);
    });

    it("listInstances returns filtered results", () => {
      instantiateFromTemplate("admin", null);
      const eventId = createEvent("training");
      instantiateFromTemplate("training", eventId);

      const all = listInstances({});
      expect(all.length).toBe(2);

      const adminOnly = listInstances({ type: "admin" });
      expect(adminOnly.length).toBe(1);
    });

    it("toggleItem sets completed, completed_at, completed_by", () => {
      const userId = createGuardian();
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id);
      const itemId = full.items[0].id;

      const updated = toggleItem(itemId, true, userId);
      expect(updated.completed).toBe(1);
      expect(updated.completed_at).toBeTruthy();
      expect(updated.completed_by).toBe(userId);

      const cleared = toggleItem(itemId, false, userId);
      expect(cleared.completed).toBe(0);
      expect(cleared.completed_at).toBeNull();
      expect(cleared.completed_by).toBeNull();
    });

    it("addCustomItem creates item with is_custom = 1", () => {
      const instance = instantiateFromTemplate("admin", null);
      const item = addCustomItem(instance.id, "My custom task", 99);
      expect(item.is_custom).toBe(1);
      expect(item.label).toBe("My custom task");
    });

    it("removeItem only deletes custom items", () => {
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id);
      const templateItem = full.items[0];

      expect(() => removeItem(templateItem.id)).toThrow();

      const custom = addCustomItem(instance.id, "Deletable", 99);
      removeItem(custom.id);
      const after = getInstance(instance.id);
      const labels = after.items.map((i: { label: string }) => i.label);
      expect(labels).not.toContain("Deletable");
    });

    it("reorderItems updates sort_order for all items", () => {
      const instance = instantiateFromTemplate("training", createEvent());
      const full = getInstance(instance.id);
      const ids = full.items.map((i: { id: number }) => i.id);
      const reversed = [...ids].reverse();

      const reordered = reorderItems(instance.id, reversed);
      expect(reordered[0].id).toBe(reversed[0]);
      expect(reordered[0].sort_order).toBe(1);
    });
  });

  describe("resetAdminChecklists", () => {
    it("archives old instance and creates new one", () => {
      const old = instantiateFromTemplate("admin", null);
      db.run("UPDATE checklist_instances SET semester = ? WHERE id = ?", ["2025-autumn", old.id]);

      const newInstance = resetAdminChecklists();
      expect(newInstance).toBeTruthy();

      const oldFull = getInstance(old.id);
      expect(oldFull.status).toBe("archived");
    });

    it("preserves custom items across resets (unchecked)", () => {
      const userId = createGuardian();
      const old = instantiateFromTemplate("admin", null);
      addCustomItem(old.id, "Preserved custom", 99);
      const full = getInstance(old.id);
      const customItem = full.items.find((i: { label: string }) => i.label === "Preserved custom");
      toggleItem(customItem!.id, true, userId);

      db.run("UPDATE checklist_instances SET semester = ? WHERE id = ?", ["2025-autumn", old.id]);

      const newInstance = resetAdminChecklists();
      const newFull = getInstance(newInstance!.id);
      const preserved = newFull.items.find((i: { label: string }) => i.label === "Preserved custom");
      expect(preserved).toBeTruthy();
      expect(preserved!.is_custom).toBe(1);
      expect(preserved!.completed).toBe(0);
    });
  });

  describe("ensureTrainingChecklist / ensureTournamentChecklist", () => {
    it("creates a checklist for a training event", () => {
      const eventId = createEvent("training");
      ensureTrainingChecklist(eventId);
      const instances = listInstances({ eventId });
      expect(instances.length).toBe(1);
    });

    it("is idempotent", () => {
      const eventId = createEvent("training");
      ensureTrainingChecklist(eventId);
      ensureTrainingChecklist(eventId);
      const instances = listInstances({ eventId });
      expect(instances.length).toBe(1);
    });

    it("creates a checklist for a tournament event", () => {
      const eventId = createEvent("tournament");
      ensureTournamentChecklist(eventId);
      const instances = listInstances({ eventId });
      expect(instances.length).toBe(1);
    });
  });

  describe("refilterAdminChecklist", () => {
    it("adds new items when classification is added mid-semester", () => {
      const instance = instantiateFromTemplate("admin", null);
      const before = getInstance(instance.id);
      expect(before.items.length).toBe(7);

      setClassifications(1, ["sfv"]);
      refilterAdminChecklist(instance.id);

      const after = getInstance(instance.id);
      expect(after.items.length).toBe(9);
    });

    it("does NOT remove items when classification is removed", () => {
      setClassifications(1, ["sfv"]);
      const instance = instantiateFromTemplate("admin", null);
      expect(getInstance(instance.id).items.length).toBe(9);

      setClassifications(1, []);
      refilterAdminChecklist(instance.id);

      expect(getInstance(instance.id).items.length).toBe(9);
    });
  });
});
