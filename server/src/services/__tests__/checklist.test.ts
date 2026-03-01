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
  ensureEventChecklist,
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
      const full = getInstance(instance.id as number);
      expect((full.items as Record<string, unknown>[]).length).toBe(7);
      expect((full.items as Record<string, unknown>[])[0].label).toBe("cl_admin_insurance");
    });

    it("creates training instance with training template items", () => {
      const eventId = createEvent("training");
      const instance = instantiateFromTemplate("training", eventId);
      const full = getInstance(instance.id as number);
      expect((full.items as Record<string, unknown>[]).length).toBe(5);
      expect((full.items as Record<string, unknown>[])[0].label).toBe("cl_training_equipment");
    });

    it("creates tournament instance with tournament template items", () => {
      const eventId = createEvent("tournament");
      const instance = instantiateFromTemplate("tournament", eventId);
      const full = getInstance(instance.id as number);
      expect((full.items as Record<string, unknown>[]).length).toBe(8);
      expect((full.items as Record<string, unknown>[])[0].label).toBe("cl_tournament_reg");
    });
  });

  describe("classification filtering", () => {
    it("includes classification-specific templates when classification is active", () => {
      setClassifications(1, ["sportamt_zurich"]);
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id as number);
      expect((full.items as Record<string, unknown>[]).length).toBe(9);
      const labels = (full.items as Record<string, unknown>[]).map((i) => i.label as string);
      expect(labels).toContain("cl_admin_sportamt_reg");
    });

    it("excludes non-matching classification templates", () => {
      setClassifications(1, ["sfv"]);
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id as number);
      expect((full.items as Record<string, unknown>[]).length).toBe(9);
      const labels = (full.items as Record<string, unknown>[]).map((i) => i.label as string);
      expect(labels).not.toContain("cl_admin_sportamt_reg");
      expect(labels).toContain("cl_admin_sfv_reg");
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
      const full = getInstance(instance.id as number);
      expect((full.items as Record<string, unknown>[]).length).toBe(2);
      expect((full.items as Record<string, unknown>[])[0].is_custom).toBe(1);
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
      const full = getInstance(instance.id as number);
      const itemId = (full.items as Record<string, unknown>[])[0].id as number;

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
      const item = addCustomItem(instance.id as number, "My custom task", 99);
      expect(item.is_custom).toBe(1);
      expect(item.label).toBe("My custom task");
    });

    it("removeItem only deletes custom items", () => {
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id as number);
      const templateItem = (full.items as Record<string, unknown>[])[0];

      expect(() => removeItem(templateItem.id as number)).toThrow();

      const custom = addCustomItem(instance.id as number, "Deletable", 99);
      removeItem(custom.id as number);
      const after = getInstance(instance.id as number);
      const labels = (after.items as Record<string, unknown>[]).map((i) => i.label as string);
      expect(labels).not.toContain("Deletable");
    });

    it("reorderItems updates sort_order for all items", () => {
      const instance = instantiateFromTemplate("training", createEvent());
      const full = getInstance(instance.id as number);
      const ids = (full.items as Record<string, unknown>[]).map((i) => i.id as number);
      const reversed = [...ids].reverse();

      const reordered = reorderItems(instance.id as number, reversed);
      expect(reordered[0].id).toBe(reversed[0]);
      expect(reordered[0].sort_order).toBe(1);
    });
  });

  describe("resetAdminChecklists", () => {
    it("archives old instance and creates new one", () => {
      const old = instantiateFromTemplate("admin", null);
      db.run("UPDATE checklist_instances SET semester = ? WHERE id = ?", ["2025-autumn", old.id as number]);

      const newInstance = resetAdminChecklists();
      expect(newInstance).toBeTruthy();

      const oldFull = getInstance(old.id as number);
      expect(oldFull.status).toBe("archived");
    });

    it("preserves custom items across resets (unchecked)", () => {
      const userId = createGuardian();
      const old = instantiateFromTemplate("admin", null);
      addCustomItem(old.id as number, "Preserved custom", 99);
      const full = getInstance(old.id as number);
      const customItem = (full.items as Record<string, unknown>[]).find((i) => i.label === "Preserved custom");
      toggleItem(customItem!.id as number, true, userId);

      db.run("UPDATE checklist_instances SET semester = ? WHERE id = ?", ["2025-autumn", old.id as number]);

      const newInstance = resetAdminChecklists();
      const newFull = getInstance(newInstance!.id as number);
      const preserved = (newFull.items as Record<string, unknown>[]).find((i) => i.label === "Preserved custom");
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

  describe("ensureEventChecklist", () => {
    it("creates a training checklist for a match event", () => {
      const eventId = createEvent("match");
      ensureEventChecklist(eventId, "match");
      const instances = listInstances({ eventId });
      expect(instances.length).toBe(1);
      const full = getInstance(instances[0].id as number);
      expect((full.items as Record<string, unknown>[])[0].label).toBe("cl_training_equipment");
    });

    it("creates a training checklist for a friendly event", () => {
      const eventId = createEvent("friendly");
      ensureEventChecklist(eventId, "friendly");
      const instances = listInstances({ eventId });
      expect(instances.length).toBe(1);
    });

    it("is idempotent", () => {
      const eventId = createEvent("match");
      ensureEventChecklist(eventId, "match");
      ensureEventChecklist(eventId, "match");
      const instances = listInstances({ eventId });
      expect(instances.length).toBe(1);
    });
  });

  describe("refilterAdminChecklist", () => {
    it("adds new items when classification is added mid-semester", () => {
      const instance = instantiateFromTemplate("admin", null);
      const before = getInstance(instance.id as number);
      expect((before.items as Record<string, unknown>[]).length).toBe(7);

      setClassifications(1, ["sfv"]);
      refilterAdminChecklist(instance.id as number);

      const after = getInstance(instance.id as number);
      expect((after.items as Record<string, unknown>[]).length).toBe(9);
    });

    it("does NOT remove items when classification is removed", () => {
      setClassifications(1, ["sfv"]);
      const instance = instantiateFromTemplate("admin", null);
      expect((getInstance(instance.id as number).items as Record<string, unknown>[]).length).toBe(9);

      setClassifications(1, []);
      refilterAdminChecklist(instance.id as number);

      expect((getInstance(instance.id as number).items as Record<string, unknown>[]).length).toBe(9);
    });
  });
});
