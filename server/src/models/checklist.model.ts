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
