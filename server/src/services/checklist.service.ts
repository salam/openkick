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
  const params: (string | number | null)[] = [];

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
      [newId, ci.label as string, nextSort++]
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

const EVENT_TYPE_TO_TEMPLATE: Record<string, "training" | "tournament"> = {
  training: "training",
  tournament: "tournament",
  match: "training",
  friendly: "training",
  social: "training",
  other: "training",
};

export function ensureEventChecklist(eventId: number, eventType: string): void {
  const templateType = EVENT_TYPE_TO_TEMPLATE[eventType];
  if (!templateType) return;
  const db = getDB();
  const existing = db.exec(
    "SELECT id FROM checklist_instances WHERE event_id = ?",
    [eventId]
  );
  if (existing.length > 0 && existing[0].values.length > 0) return;
  instantiateFromTemplate(templateType, eventId);
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
