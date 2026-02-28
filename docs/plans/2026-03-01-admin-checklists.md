# Administrative Checklists Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add interactive admin/training/tournament checklists with classification filtering, auto-creation on events, and semester-based resets.

**Architecture:** Four new DB tables (club_classifications, checklist_templates, checklist_instances, checklist_items) added to the existing `SCHEMA` constant in `database.ts`. A new service (`checklist.service.ts`) handles all business logic. A new router (`checklists.routes.ts`) exposes REST endpoints under `/api/admin/checklists`. Training/tournament checklists are auto-created by hooking into `POST /api/events`.

**Tech Stack:** Express, sql.js, vitest, TypeScript

---

### Task 1: Database Schema & Seed Data Files

**Files:**
- Modify: `server/src/database.ts` (add tables + indexes + template seeding to SCHEMA and initDB)
- Create: `server/src/models/checklist.model.ts`
- Create: `server/src/data/checklist-templates.ts`

**Step 1: Create the models file**

Create `server/src/models/checklist.model.ts`:

```ts
export type ClubClassification = "sportamt_zurich" | "sfv" | "fvrz" | "custom";

export type ChecklistType = "admin" | "training" | "tournament";

export type ChecklistStatus = "active" | "archived";

export interface ChecklistTemplate {
  id: number;
  type: ChecklistType;
  classificationFilter: string | null;
  itemsJson: string;
  createdAt: string;
}

export interface ChecklistInstance {
  id: number;
  templateId: number | null;
  eventId: number | null;
  semester: string;
  status: ChecklistStatus;
  createdAt: string;
}

export interface ChecklistItem {
  id: number;
  instanceId: number;
  label: string;
  sortOrder: number;
  completed: boolean;
  completedAt: string | null;
  completedBy: number | null;
  isCustom: boolean;
}

export interface ClubClassificationRow {
  id: number;
  clubId: number;
  classification: ClubClassification;
  active: boolean;
}
```

**Step 2: Create the seed data file**

Create `server/src/data/checklist-templates.ts`:

```ts
export interface TemplateSeed {
  type: "admin" | "training" | "tournament";
  classificationFilter: string | null;
  items: { label: string; sortOrder: number }[];
}

export const CHECKLIST_TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    type: "admin",
    classificationFilter: null,
    items: [
      { label: "Liability insurance (Haftpflichtversicherung) valid and renewed", sortOrder: 1 },
      { label: "Accident insurance for players confirmed", sortOrder: 2 },
      { label: "Coach certifications (J+S, SFV C-Diploma) up to date", sortOrder: 3 },
      { label: "Facility usage permits / field reservations secured", sortOrder: 4 },
      { label: "Parent consent forms / disclaimers collected for all players", sortOrder: 5 },
      { label: "First-aid kit inspected and restocked", sortOrder: 6 },
      { label: "Bills and invoices paid (membership fees, tournament fees)", sortOrder: 7 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "sportamt_zurich",
    items: [
      { label: "Registration with Sportamt Zurich submitted", sortOrder: 10 },
      { label: "Sportamt Zurich subsidy application filed", sortOrder: 11 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "sfv",
    items: [
      { label: "SFV team registration and licence fees paid", sortOrder: 20 },
      { label: "SFV coach licence renewals submitted", sortOrder: 21 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "fvrz",
    items: [
      { label: "FVRZ league registration submitted", sortOrder: 30 },
      { label: "FVRZ referee assignments acknowledged", sortOrder: 31 },
    ],
  },
  {
    type: "training",
    classificationFilter: null,
    items: [
      { label: "Balls, cones, bibs packed", sortOrder: 1 },
      { label: "First-aid kit available", sortOrder: 2 },
      { label: "Attendance taken", sortOrder: 3 },
      { label: "Field condition checked", sortOrder: 4 },
      { label: "Water / drinks reminder sent to parents", sortOrder: 5 },
    ],
  },
  {
    type: "tournament",
    classificationFilter: null,
    items: [
      { label: "Registration submitted before deadline", sortOrder: 1 },
      { label: "Teams formed and published", sortOrder: 2 },
      { label: "Custom Trikots ordered (sizing via survey)", sortOrder: 3 },
      { label: "Trikots packed and accounted for", sortOrder: 4 },
      { label: "Tournament rules / PDF downloaded and reviewed", sortOrder: 5 },
      { label: "Transport organised (drivers, carpooling)", sortOrder: 6 },
      { label: "Player passes / ID cards prepared", sortOrder: 7 },
      { label: "Post-tournament feedback survey sent", sortOrder: 8 },
    ],
  },
];
```

**Step 3: Add tables to SCHEMA in `database.ts`**

Append these four table definitions at the end of the `SCHEMA` template literal (before the closing backtick at line 271):

```sql
CREATE TABLE IF NOT EXISTS club_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL DEFAULT 1,
  classification TEXT NOT NULL CHECK (classification IN ('sportamt_zurich','sfv','fvrz','custom')),
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (club_id, classification)
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('admin','training','tournament')),
  classification_filter TEXT,
  items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES checklist_templates(id),
  event_id INTEGER REFERENCES events(id),
  semester TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  completed_by INTEGER REFERENCES guardians(id),
  is_custom INTEGER NOT NULL DEFAULT 0,
  UNIQUE (instance_id, label)
);

CREATE INDEX IF NOT EXISTS idx_checklist_instances_event ON checklist_instances(event_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_semester ON checklist_instances(semester);
CREATE INDEX IF NOT EXISTS idx_checklist_items_instance ON checklist_items(instance_id);
```

**Step 4: Add template seeding to `initDB()` in `database.ts`**

Add import at the top of `database.ts`:

```ts
import { CHECKLIST_TEMPLATE_SEEDS } from "./data/checklist-templates.js";
```

Inside `initDB()`, after the `DEFAULT_SETTINGS` seeding loop (after line 387), add:

```ts
  // Seed checklist templates if empty
  const templateCount = db.exec("SELECT COUNT(*) FROM checklist_templates");
  if ((templateCount[0]?.values[0]?.[0] as number) === 0) {
    for (const seed of CHECKLIST_TEMPLATE_SEEDS) {
      db.run(
        "INSERT INTO checklist_templates (type, classification_filter, items_json) VALUES (?, ?, ?)",
        [seed.type, seed.classificationFilter, JSON.stringify(seed.items)]
      );
    }
  }
```

**Step 5: Run type-check to verify compilation**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/database.ts server/src/models/checklist.model.ts server/src/data/checklist-templates.ts && git commit -m "feat(checklists): add DB schema, models, and seed data"
```

---

### Task 2: Service Layer — Core Functions + Unit Tests

**Files:**
- Create: `server/src/services/checklist.service.ts`
- Create: `server/src/services/__tests__/checklist.test.ts`

**Step 1: Write the failing tests**

Create `server/src/services/__tests__/checklist.test.ts`:

```ts
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
      expect(full.items[0].isCustom).toBe(1);
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

    it("toggleItem sets completed, completedAt, completedBy", () => {
      const userId = createGuardian();
      const instance = instantiateFromTemplate("admin", null);
      const full = getInstance(instance.id);
      const itemId = full.items[0].id;

      const updated = toggleItem(itemId, true, userId);
      expect(updated.completed).toBe(1);
      expect(updated.completedAt).toBeTruthy();
      expect(updated.completedBy).toBe(userId);

      const cleared = toggleItem(itemId, false, userId);
      expect(cleared.completed).toBe(0);
      expect(cleared.completedAt).toBeNull();
      expect(cleared.completedBy).toBeNull();
    });

    it("addCustomItem creates item with is_custom = 1", () => {
      const instance = instantiateFromTemplate("admin", null);
      const item = addCustomItem(instance.id, "My custom task", 99);
      expect(item.isCustom).toBe(1);
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
      expect(reordered[0].sortOrder).toBe(1);
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
      const old = instantiateFromTemplate("admin", null);
      addCustomItem(old.id, "Preserved custom", 99);
      const full = getInstance(old.id);
      const customItem = full.items.find((i: { label: string }) => i.label === "Preserved custom");
      toggleItem(customItem!.id, true, 1);

      db.run("UPDATE checklist_instances SET semester = ? WHERE id = ?", ["2025-autumn", old.id]);

      const newInstance = resetAdminChecklists();
      const newFull = getInstance(newInstance!.id);
      const preserved = newFull.items.find((i: { label: string }) => i.label === "Preserved custom");
      expect(preserved).toBeTruthy();
      expect(preserved!.isCustom).toBe(1);
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
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/checklist.test.ts`
Expected: FAIL — module `../checklist.service.js` not found

**Step 3: Implement the service**

Create `server/src/services/checklist.service.ts`:

```ts
import { getDB, getLastInsertId } from "../database.js";
import type {
  ChecklistType,
  ClubClassification,
} from "../models/checklist.model.js";

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
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

export function getCurrentSemester(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 2 && month <= 7) return `${year}-spring`;
  if (month === 1) return `${year - 1}-autumn`;
  return `${year}-autumn`;
}

export function getActiveClassifications(clubId: number = 1): ClubClassification[] {
  const db = getDB();
  const result = db.exec(
    "SELECT classification FROM club_classifications WHERE club_id = ? AND active = 1",
    [clubId]
  );
  if (result.length === 0) return [];
  return result[0].values.map((r) => r[0] as ClubClassification);
}

export function setClassifications(clubId: number, classifications: ClubClassification[]): void {
  const db = getDB();
  db.run("UPDATE club_classifications SET active = 0 WHERE club_id = ?", [clubId]);
  for (const c of classifications) {
    db.run(
      "INSERT INTO club_classifications (club_id, classification, active) VALUES (?, ?, 1) ON CONFLICT(club_id, classification) DO UPDATE SET active = 1",
      [clubId, c]
    );
  }
}

function getMatchingTemplateItems(
  type: ChecklistType,
  classifications: ClubClassification[]
): { label: string; sortOrder: number }[] {
  const db = getDB();
  const templates = rowsToObjects(
    db.exec("SELECT * FROM checklist_templates WHERE type = ?", [type])
  );

  const items: { label: string; sortOrder: number }[] = [];

  for (const tpl of templates) {
    const filter = tpl.classification_filter as string | null;
    if (filter === null) {
      const parsed = JSON.parse(tpl.items_json as string) as { label: string; sortOrder: number }[];
      items.push(...parsed);
    } else {
      const filterTags = filter.split(",").map((s) => s.trim());
      const matches = filterTags.some((tag) => classifications.includes(tag as ClubClassification));
      if (matches) {
        const parsed = JSON.parse(tpl.items_json as string) as { label: string; sortOrder: number }[];
        items.push(...parsed);
      }
    }
  }

  const seen = new Set<string>();
  const unique: { label: string; sortOrder: number }[] = [];
  for (const item of items.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!seen.has(item.label)) {
      seen.add(item.label);
      unique.push(item);
    }
  }
  return unique;
}

export function listInstances(filters: {
  type?: string;
  eventId?: number;
  status?: string;
  semester?: string;
}): Record<string, unknown>[] {
  const db = getDB();
  let sql = `
    SELECT ci.*,
      ct.type,
      (SELECT COUNT(*) FROM checklist_items WHERE instance_id = ci.id) AS itemCount,
      (SELECT COUNT(*) FROM checklist_items WHERE instance_id = ci.id AND completed = 1) AS completedCount
    FROM checklist_instances ci
    LEFT JOIN checklist_templates ct ON ci.template_id = ct.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (filters.type) {
    sql += " AND ct.type = ?";
    params.push(filters.type);
  }
  if (filters.eventId !== undefined) {
    sql += " AND ci.event_id = ?";
    params.push(filters.eventId);
  }
  if (filters.status) {
    sql += " AND ci.status = ?";
    params.push(filters.status);
  } else {
    sql += " AND ci.status = 'active'";
  }
  if (filters.semester) {
    sql += " AND ci.semester = ?";
    params.push(filters.semester);
  }

  return rowsToObjects(db.exec(sql, params));
}

export function getInstance(id: number): Record<string, unknown> & { items: Record<string, unknown>[] } {
  const db = getDB();
  const rows = rowsToObjects(db.exec("SELECT * FROM checklist_instances WHERE id = ?", [id]));
  if (rows.length === 0) throw new Error(`Checklist instance ${id} not found`);

  const items = rowsToObjects(
    db.exec("SELECT * FROM checklist_items WHERE instance_id = ? ORDER BY sort_order ASC", [id])
  );

  return { ...rows[0], items } as Record<string, unknown> & { items: Record<string, unknown>[] };
}

export function createInstance(
  type: ChecklistType,
  eventId: number | null,
  items: { label: string; sortOrder: number }[]
): Record<string, unknown> {
  const db = getDB();
  const semester = getCurrentSemester();

  db.run(
    "INSERT INTO checklist_instances (template_id, event_id, semester) VALUES (NULL, ?, ?)",
    [eventId, semester]
  );
  const instanceId = getLastInsertId();

  for (const item of items) {
    db.run(
      "INSERT INTO checklist_items (instance_id, label, sort_order, is_custom) VALUES (?, ?, ?, 1)",
      [instanceId, item.label, item.sortOrder]
    );
  }

  return getInstance(instanceId);
}

export function toggleItem(itemId: number, completed: boolean, userId: number): Record<string, unknown> {
  const db = getDB();
  if (completed) {
    db.run(
      "UPDATE checklist_items SET completed = 1, completed_at = datetime('now'), completed_by = ? WHERE id = ?",
      [userId, itemId]
    );
  } else {
    db.run(
      "UPDATE checklist_items SET completed = 0, completed_at = NULL, completed_by = NULL WHERE id = ?",
      [itemId]
    );
  }

  const rows = rowsToObjects(db.exec("SELECT * FROM checklist_items WHERE id = ?", [itemId]));
  if (rows.length === 0) throw new Error(`Item ${itemId} not found`);
  return rows[0];
}

export function addCustomItem(
  instanceId: number,
  label: string,
  sortOrder: number
): Record<string, unknown> {
  const db = getDB();
  db.run(
    "INSERT INTO checklist_items (instance_id, label, sort_order, is_custom) VALUES (?, ?, ?, 1)",
    [instanceId, label, sortOrder]
  );
  const id = getLastInsertId();
  const rows = rowsToObjects(db.exec("SELECT * FROM checklist_items WHERE id = ?", [id]));
  return rows[0];
}

export function removeItem(itemId: number): void {
  const db = getDB();
  const rows = rowsToObjects(db.exec("SELECT * FROM checklist_items WHERE id = ?", [itemId]));
  if (rows.length === 0) throw new Error(`Item ${itemId} not found`);
  if (rows[0].is_custom !== 1) {
    throw new Error("Cannot delete template-sourced items");
  }
  db.run("DELETE FROM checklist_items WHERE id = ?", [itemId]);
}

export function reorderItems(instanceId: number, orderedIds: number[]): Record<string, unknown>[] {
  const db = getDB();
  for (let i = 0; i < orderedIds.length; i++) {
    db.run(
      "UPDATE checklist_items SET sort_order = ? WHERE id = ? AND instance_id = ?",
      [i + 1, orderedIds[i], instanceId]
    );
  }
  return rowsToObjects(
    db.exec("SELECT * FROM checklist_items WHERE instance_id = ? ORDER BY sort_order ASC", [instanceId])
  );
}

export function instantiateFromTemplate(
  type: ChecklistType,
  eventId: number | null
): Record<string, unknown> {
  const db = getDB();
  const semester = getCurrentSemester();
  const classifications = getActiveClassifications();
  const items = getMatchingTemplateItems(type, classifications);

  const templateRows = rowsToObjects(
    db.exec("SELECT id FROM checklist_templates WHERE type = ? LIMIT 1", [type])
  );
  const templateId = templateRows.length > 0 ? (templateRows[0].id as number) : null;

  db.run(
    "INSERT INTO checklist_instances (template_id, event_id, semester) VALUES (?, ?, ?)",
    [templateId, eventId, semester]
  );
  const instanceId = getLastInsertId();

  for (const item of items) {
    db.run(
      "INSERT OR IGNORE INTO checklist_items (instance_id, label, sort_order, is_custom) VALUES (?, ?, ?, 0)",
      [instanceId, item.label, item.sortOrder]
    );
  }

  const rows = rowsToObjects(db.exec("SELECT * FROM checklist_instances WHERE id = ?", [instanceId]));
  return rows[0];
}

export function resetAdminChecklists(): Record<string, unknown> | null {
  const db = getDB();
  const semester = getCurrentSemester();

  const existing = rowsToObjects(
    db.exec(
      `SELECT ci.id FROM checklist_instances ci
       JOIN checklist_templates ct ON ci.template_id = ct.id
       WHERE ct.type = 'admin' AND ci.semester = ? AND ci.status = 'active'`,
      [semester]
    )
  );
  if (existing.length > 0) return null;

  const oldInstances = rowsToObjects(
    db.exec(
      `SELECT ci.id FROM checklist_instances ci
       JOIN checklist_templates ct ON ci.template_id = ct.id
       WHERE ct.type = 'admin' AND ci.status = 'active'
       ORDER BY ci.created_at DESC`
    )
  );

  let customItems: Record<string, unknown>[] = [];
  for (const old of oldInstances) {
    if (customItems.length === 0) {
      customItems = rowsToObjects(
        db.exec(
          "SELECT label, sort_order FROM checklist_items WHERE instance_id = ? AND is_custom = 1",
          [old.id as number]
        )
      );
    }
    db.run("UPDATE checklist_instances SET status = 'archived' WHERE id = ?", [old.id as number]);
  }

  const newInstance = instantiateFromTemplate("admin", null);
  const newId = newInstance.id as number;

  const maxSortResult = db.exec(
    "SELECT MAX(sort_order) FROM checklist_items WHERE instance_id = ?",
    [newId]
  );
  let nextSort = ((maxSortResult[0]?.values[0]?.[0] as number) ?? 0) + 1;

  for (const ci of customItems) {
    db.run(
      "INSERT OR IGNORE INTO checklist_items (instance_id, label, sort_order, is_custom) VALUES (?, ?, ?, 1)",
      [newId, ci.label, nextSort++]
    );
  }

  return getInstance(newId);
}

export function ensureTrainingChecklist(eventId: number): void {
  const db = getDB();
  const existing = db.exec(
    "SELECT id FROM checklist_instances WHERE event_id = ?",
    [eventId]
  );
  if (existing.length > 0 && existing[0].values.length > 0) return;
  instantiateFromTemplate("training", eventId);
}

export function ensureTournamentChecklist(eventId: number): void {
  const db = getDB();
  const existing = db.exec(
    "SELECT id FROM checklist_instances WHERE event_id = ?",
    [eventId]
  );
  if (existing.length > 0 && existing[0].values.length > 0) return;
  instantiateFromTemplate("tournament", eventId);
}

export function refilterAdminChecklist(instanceId: number): void {
  const db = getDB();
  const classifications = getActiveClassifications();
  const items = getMatchingTemplateItems("admin", classifications);

  const existingRows = rowsToObjects(
    db.exec("SELECT label FROM checklist_items WHERE instance_id = ?", [instanceId])
  );
  const existingLabels = new Set(existingRows.map((r) => r.label as string));

  const maxSortResult = db.exec(
    "SELECT MAX(sort_order) FROM checklist_items WHERE instance_id = ?",
    [instanceId]
  );
  let nextSort = ((maxSortResult[0]?.values[0]?.[0] as number) ?? 0) + 1;

  for (const item of items) {
    if (!existingLabels.has(item.label)) {
      db.run(
        "INSERT OR IGNORE INTO checklist_items (instance_id, label, sort_order, is_custom) VALUES (?, ?, ?, 0)",
        [instanceId, item.label, nextSort++]
      );
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/checklist.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/services/checklist.service.ts server/src/services/__tests__/checklist.test.ts && git commit -m "feat(checklists): add service layer with unit tests"
```

---

### Task 3: Route Layer + Route Tests

**Files:**
- Create: `server/src/routes/checklists.routes.ts`
- Create: `server/src/routes/__tests__/checklists.test.ts`

**Step 1: Write the failing route tests**

Create `server/src/routes/__tests__/checklists.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initDB } from "../../database.js";
import { checklistsRouter } from "../checklists.routes.js";
import { generateJWT } from "../../auth.js";
import type { Database } from "sql.js";

let db: Database;
let server: Server;
let baseUrl: string;
let adminToken: string;

async function createTestApp() {
  db = await initDB();
  db.run(
    "INSERT INTO guardians (phone, role, passwordHash) VALUES (?, ?, ?)",
    ["+41790000001", "admin", "hash"]
  );
  const guardianResult = db.exec("SELECT last_insert_rowid() AS id");
  const userId = guardianResult[0].values[0][0] as number;
  adminToken = generateJWT({ id: userId, role: "admin" });

  const app = express();
  app.use(express.json());
  app.use("/api", checklistsRouter);
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

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };
}

describe("Checklists routes", () => {
  beforeEach(async () => { await createTestApp(); });
  afterEach(async () => { await teardown(); });

  it("GET /api/admin/checklists returns empty list initially", async () => {
    const res = await fetch(`${baseUrl}/api/admin/checklists`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("POST /api/admin/checklists creates custom checklist", async () => {
    const res = await fetch(`${baseUrl}/api/admin/checklists`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "admin",
        items: [
          { label: "Task A", sortOrder: 1 },
          { label: "Task B", sortOrder: 2 },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.items.length).toBe(2);
  });

  it("PUT toggle item completion", async () => {
    const createRes = await fetch(`${baseUrl}/api/admin/checklists`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "admin",
        items: [{ label: "Toggle me", sortOrder: 1 }],
      }),
    });
    const checklist = await createRes.json();
    const itemId = checklist.items[0].id;

    const res = await fetch(
      `${baseUrl}/api/admin/checklists/${checklist.id}/items/${itemId}`,
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ completed: true }),
      }
    );
    expect(res.status).toBe(200);
    const item = await res.json();
    expect(item.completed).toBe(1);
  });

  it("DELETE rejects non-custom items with 403", async () => {
    const { instantiateFromTemplate, getInstance } = await import("../../services/checklist.service.js");
    const instance = instantiateFromTemplate("admin", null);
    const full = getInstance(instance.id as number);
    const templateItemId = full.items[0].id;

    const res = await fetch(
      `${baseUrl}/api/admin/checklists/${instance.id}/items/${templateItemId}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      }
    );
    expect(res.status).toBe(403);
  });

  it("PUT reorder applies correct ordering", async () => {
    const createRes = await fetch(`${baseUrl}/api/admin/checklists`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "admin",
        items: [
          { label: "First", sortOrder: 1 },
          { label: "Second", sortOrder: 2 },
          { label: "Third", sortOrder: 3 },
        ],
      }),
    });
    const checklist = await createRes.json();
    const ids = checklist.items.map((i: { id: number }) => i.id);

    const res = await fetch(
      `${baseUrl}/api/admin/checklists/${checklist.id}/reorder`,
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ order: [ids[2], ids[0], ids[1]] }),
      }
    );
    expect(res.status).toBe(200);
    const items = await res.json();
    expect(items[0].id).toBe(ids[2]);
  });

  it("unauthenticated requests return 401", async () => {
    const res = await fetch(`${baseUrl}/api/admin/checklists`);
    expect(res.status).toBe(401);
  });

  it("GET/PUT /api/admin/classifications manages club classifications", async () => {
    const putRes = await fetch(`${baseUrl}/api/admin/classifications`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ classifications: ["sfv", "fvrz"] }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/api/admin/classifications`, {
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body).toContain("sfv");
    expect(body).toContain("fvrz");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/__tests__/checklists.test.ts`
Expected: FAIL — module `../checklists.routes.js` not found

**Step 3: Implement the router**

Create `server/src/routes/checklists.routes.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";
import {
  listInstances,
  getInstance,
  createInstance,
  toggleItem,
  addCustomItem,
  removeItem,
  reorderItems,
  getActiveClassifications,
  setClassifications,
  refilterAdminChecklist,
} from "../services/checklist.service.js";
import type { ChecklistType, ClubClassification } from "../models/checklist.model.js";

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[],
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

export const checklistsRouter = Router();

checklistsRouter.use("/admin/checklists", authMiddleware, requireRole("admin", "coach"));
checklistsRouter.use("/admin/classifications", authMiddleware, requireRole("admin"));

checklistsRouter.get("/admin/checklists", (req: Request, res: Response) => {
  const { type, eventId, status } = req.query;
  const instances = listInstances({
    type: type as string | undefined,
    eventId: eventId ? Number(eventId) : undefined,
    status: status as string | undefined,
  });
  res.json(instances);
});

checklistsRouter.get("/admin/checklists/:id", (req: Request, res: Response) => {
  try {
    const instance = getInstance(Number(req.params.id));
    res.json(instance);
  } catch {
    res.status(404).json({ error: "Checklist not found" });
  }
});

checklistsRouter.post("/admin/checklists", (req: Request, res: Response) => {
  const { type, eventId, items } = req.body;
  if (!type || !items || !Array.isArray(items)) {
    res.status(400).json({ error: "type and items are required" });
    return;
  }
  const instance = createInstance(type as ChecklistType, eventId ?? null, items);
  res.status(201).json(instance);
});

checklistsRouter.put("/admin/checklists/:id/items/:itemId", (req: Request, res: Response) => {
  const { completed, label } = req.body;
  const itemId = Number(req.params.itemId);
  const userId = req.user!.id;

  try {
    if (completed !== undefined) {
      const item = toggleItem(itemId, completed, userId);
      res.json(item);
    } else if (label !== undefined) {
      const db = getDB();
      db.run("UPDATE checklist_items SET label = ? WHERE id = ?", [label, itemId]);
      const rows = rowsToObjects(db.exec("SELECT * FROM checklist_items WHERE id = ?", [itemId]));
      res.json(rows[0]);
    } else {
      res.status(400).json({ error: "completed or label required" });
    }
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

checklistsRouter.post("/admin/checklists/:id/items", (req: Request, res: Response) => {
  const { label, sortOrder } = req.body;
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  try {
    const item = addCustomItem(Number(req.params.id), label, sortOrder ?? 0);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

checklistsRouter.delete("/admin/checklists/:id/items/:itemId", (req: Request, res: Response) => {
  try {
    removeItem(Number(req.params.itemId));
    res.status(204).end();
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("template-sourced")) {
      res.status(403).json({ error: message });
    } else {
      res.status(404).json({ error: message });
    }
  }
});

checklistsRouter.put("/admin/checklists/:id/reorder", (req: Request, res: Response) => {
  const { order } = req.body;
  if (!order || !Array.isArray(order)) {
    res.status(400).json({ error: "order array is required" });
    return;
  }
  const items = reorderItems(Number(req.params.id), order);
  res.json(items);
});

checklistsRouter.get("/admin/classifications", (_req: Request, res: Response) => {
  const classifications = getActiveClassifications();
  res.json(classifications);
});

checklistsRouter.put("/admin/classifications", (req: Request, res: Response) => {
  const { classifications } = req.body;
  if (!classifications || !Array.isArray(classifications)) {
    res.status(400).json({ error: "classifications array is required" });
    return;
  }
  setClassifications(1, classifications as ClubClassification[]);

  const instances = listInstances({ type: "admin", status: "active" });
  for (const inst of instances) {
    refilterAdminChecklist(inst.id as number);
  }

  res.json(getActiveClassifications());
});
```

**Step 4: Run route tests**

Run: `cd server && npx vitest run src/routes/__tests__/checklists.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git restore --staged :/ && git add server/src/routes/checklists.routes.ts server/src/routes/__tests__/checklists.test.ts && git commit -m "feat(checklists): add REST API routes with tests"
```

---

### Task 4: Integration — Event Hook + Router Registration + Startup Reset

**Files:**
- Modify: `server/src/routes/events.ts:1-3,73-78` (add import + hook)
- Modify: `server/src/index.ts:1-39,75-87,105-115` (add import + register + startup reset)

**Step 1: Hook into POST /api/events**

In `server/src/routes/events.ts`, add import after line 4:

```ts
import { ensureTrainingChecklist, ensureTournamentChecklist } from "../services/checklist.service.js";
```

After line 75 (`const id = getLastInsertId();`), before line 77 (`const rows = ...`), insert:

```ts
  if (type === "training") {
    ensureTrainingChecklist(id);
  } else if (type === "tournament") {
    ensureTournamentChecklist(id);
  }
```

**Step 2: Register router in index.ts**

In `server/src/index.ts`, add import after line 37 (after the last router import):

```ts
import { checklistsRouter } from "./routes/checklists.routes.js";
```

After line 75 (`app.use("/api", gdprRouter);`), add:

```ts
app.use("/api", checklistsRouter);
```

**Step 3: Add startup reset in index.ts**

Add import at the top (with other service imports, around line 30):

```ts
import { resetAdminChecklists } from "./services/checklist.service.js";
```

Inside `main()`, after `initDB(DB_PATH)` (line 86) and the captcha setup, before `runHolidaySync()` (line 106), add:

```ts
  // Auto-reset admin checklists on semester boundaries
  resetAdminChecklists();
```

**Step 4: Run all tests**

Run: `cd server && npx vitest run`
Expected: All existing + new tests PASS

**Step 5: Run type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git restore --staged :/ && git add server/src/routes/events.ts server/src/index.ts && git commit -m "feat(checklists): hook auto-creation into events, register router, startup reset"
```

---

### Task 5: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`

**Step 1: Update FEATURES.md**

Add a new section for checklists:

```markdown
## Administrative Checklists (PRD 4.5.10)
- [x] Admin checklists (semester-based, auto-reset Feb 1 / Aug 1)
- [x] Per-training checklists (auto-created per training event)
- [x] Per-tournament checklists (auto-created per tournament)
- [x] Checklist templates with classification filtering (Sportamt, SFV, FVRZ)
- [x] Custom checklist items preserved across resets
- [x] Per-item completion tracking with user/timestamp
- [x] Classification management endpoints (GET/PUT)
- [ ] Reminder/n8n integration (future)
- [ ] Frontend UI (future)
```

**Step 2: Update RELEASE_NOTES.md**

Add a new release section:

```markdown
## Release 1.x (Sat, Mar 1 2026)

* Administrative checklists with semester-based auto-reset (Feb 1 / Aug 1)
* Per-training checklists auto-created when a training event is created
* Per-tournament checklists auto-created when a tournament event is created
* Classification-based filtering for relevant items (Sportamt Zurich, SFV, FVRZ)
* Custom checklist items preserved across semester resets
* Per-item completion tracking (who completed it and when)
* Classification management API for admins
```

**Step 3: Commit**

```bash
git restore --staged :/ && git add FEATURES.md RELEASE_NOTES.md && git commit -m "docs: update FEATURES.md and RELEASE_NOTES.md for checklists"
```
