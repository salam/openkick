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
