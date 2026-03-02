# Blueprint: Administrative Checklists

> **PRD reference:** Section 4.5.10 — Administrative Checklists
>
> **Dependencies:** None external. Pure CRUD on sql.js. No third-party packages required.
>
> **Integration points:** Events module (auto-create checklists on event creation), Reminders/n8n (incomplete-item alerts).

---

## 1. Module Overview

The checklists module gives club owners and coaches interactive to-do lists for three contexts:

| Type | Lifecycle | Reset Behaviour |
|------|-----------|-----------------|
| `admin` | Per semester / school year | Resets at semester boundaries (Feb 1, Aug 1). Custom items are preserved. |
| `training` | Per training session | New instance auto-created when a training event is created. |
| `tournament` | Per tournament event | New instance auto-created when a tournament event is created. |

Checklist items are **context-aware**: admin checklists are filtered by the club's active classifications (Sportamt Zurich, SFV, FVRZ, custom). Only items whose `classification_filter` matches at least one of the club's active classifications are shown.

---

## 2. File Structure

```
server/src/
  models/
    checklist.model.ts          # TypeScript interfaces
  services/
    checklist.service.ts        # CRUD, template instantiation, reset logic
    __tests__/
      checklist.test.ts         # Unit tests
  routes/
    checklists.routes.ts        # Express router
    __tests__/
      checklists.test.ts        # Route-level tests
  data/
    checklist-templates.ts      # Default checklist items per type and classification
```

---

## 3. TypeScript Interfaces

Define these in `server/src/models/checklist.model.ts`:

```ts
/** Classification a club can hold. */
export type ClubClassification =
  | "sportamt_zurich"
  | "sfv"
  | "fvrz"
  | "custom";

/** Checklist category. */
export type ChecklistType = "admin" | "training" | "tournament";

/** Lifecycle status of a checklist instance. */
export type ChecklistStatus = "active" | "archived";

/**
 * A reusable template that describes which items belong in a checklist.
 * Templates are stored both as seed data (checklist-templates.ts) and
 * in the database so admins can customise them.
 */
export interface ChecklistTemplate {
  id: number;
  type: ChecklistType;
  /** Comma-separated classification tags, e.g. "sfv,fvrz".
   *  null means the item applies to ALL classifications. */
  classificationFilter: string | null;
  /** JSON-serialised array of default items (label + sort_order). */
  itemsJson: string;
  createdAt: string;
}

/**
 * A concrete checklist tied to a semester (admin) or an event
 * (training / tournament).
 */
export interface ChecklistInstance {
  id: number;
  templateId: number | null;
  /** FK to events.id. null for admin checklists (semester-scoped). */
  eventId: number | null;
  /** Semester label, e.g. "2025-autumn" or "2026-spring". */
  semester: string;
  status: ChecklistStatus;
  createdAt: string;
}

/**
 * A single line item inside a checklist instance.
 */
export interface ChecklistItem {
  id: number;
  instanceId: number;
  label: string;
  sortOrder: number;
  completed: boolean;
  completedAt: string | null;
  /** FK to guardians.id — who ticked this item. */
  completedBy: number | null;
  /** If true, this item was added manually by a user (not from template). */
  isCustom: boolean;
}

/**
 * Row in the club_classifications table.
 */
export interface ClubClassificationRow {
  id: number;
  clubId: number;
  classification: ClubClassification;
  active: boolean;
}
```

---

## 4. Database Schema

Add these tables in the same pattern as the existing `SCHEMA` constant in `database.ts`. Use `CREATE TABLE IF NOT EXISTS` so they are safe to re-run.

```sql
-- Which official bodies / associations the club belongs to.
-- A club can have multiple active classifications.
CREATE TABLE IF NOT EXISTS club_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL DEFAULT 1,
  classification TEXT NOT NULL CHECK (classification IN ('sportamt_zurich','sfv','fvrz','custom')),
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (club_id, classification)
);

-- Reusable templates that seed new checklist instances.
CREATE TABLE IF NOT EXISTS checklist_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('admin','training','tournament')),
  classification_filter TEXT,          -- comma-separated, null = universal
  items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A concrete checklist (one per semester for admin, one per event for training/tournament).
CREATE TABLE IF NOT EXISTS checklist_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES checklist_templates(id),
  event_id INTEGER REFERENCES events(id),
  semester TEXT NOT NULL,               -- e.g. '2026-spring'
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual items within an instance.
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
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_checklist_instances_event ON checklist_instances(event_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_semester ON checklist_instances(semester);
CREATE INDEX IF NOT EXISTS idx_checklist_items_instance ON checklist_items(instance_id);
```

---

## 5. Seed Data — `checklist-templates.ts`

File: `server/src/data/checklist-templates.ts`

This file exports an array of template definitions that are seeded into `checklist_templates` on first run (use `INSERT OR IGNORE`).

```ts
export interface TemplateSeed {
  type: "admin" | "training" | "tournament";
  classificationFilter: string | null; // null = all clubs
  items: { label: string; sortOrder: number }[];
}

export const CHECKLIST_TEMPLATE_SEEDS: TemplateSeed[] = [
  // ── Admin checklist (universal) ────────────────────────────────
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
  // ── Admin checklist (Sportamt Zurich) ──────────────────────────
  {
    type: "admin",
    classificationFilter: "sportamt_zurich",
    items: [
      { label: "Registration with Sportamt Zurich submitted", sortOrder: 10 },
      { label: "Sportamt Zurich subsidy application filed", sortOrder: 11 },
    ],
  },
  // ── Admin checklist (SFV) ──────────────────────────────────────
  {
    type: "admin",
    classificationFilter: "sfv",
    items: [
      { label: "SFV team registration and licence fees paid", sortOrder: 20 },
      { label: "SFV coach licence renewals submitted", sortOrder: 21 },
    ],
  },
  // ── Admin checklist (FVRZ) ─────────────────────────────────────
  {
    type: "admin",
    classificationFilter: "fvrz",
    items: [
      { label: "FVRZ league registration submitted", sortOrder: 30 },
      { label: "FVRZ referee assignments acknowledged", sortOrder: 31 },
    ],
  },
  // ── Per-training checklist ─────────────────────────────────────
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
  // ── Per-tournament checklist ───────────────────────────────────
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

---

## 6. API Endpoints

Mount under the existing Express app at `/api/admin/checklists`. All endpoints require authentication (coach or admin role).

Router file: `server/src/routes/checklists.routes.ts`

### 6.1 `GET /api/admin/checklists`

List active checklist instances for the current semester. Optionally filter by type or event.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `admin` \| `training` \| `tournament` | all | Filter by checklist type |
| `eventId` | number | — | Filter by event |
| `status` | `active` \| `archived` | `active` | Filter by status |

**Response:**

```json
[
  {
    "id": 1,
    "templateId": 2,
    "eventId": null,
    "semester": "2026-spring",
    "status": "active",
    "createdAt": "2026-02-01T00:00:00Z",
    "type": "admin",
    "itemCount": 9,
    "completedCount": 3
  }
]
```

### 6.2 `GET /api/admin/checklists/:id`

Get a single checklist instance with all its items.

**Response:**

```json
{
  "id": 1,
  "templateId": 2,
  "eventId": null,
  "semester": "2026-spring",
  "status": "active",
  "items": [
    { "id": 1, "label": "Liability insurance renewed", "sortOrder": 1, "completed": true, "completedAt": "2026-02-10T14:30:00Z", "completedBy": 5, "isCustom": false },
    { "id": 2, "label": "...", "sortOrder": 2, "completed": false, "completedAt": null, "completedBy": null, "isCustom": false }
  ]
}
```

### 6.3 `POST /api/admin/checklists`

Create a custom checklist (not from template).

**Request body:**

```json
{
  "type": "admin",
  "eventId": null,
  "items": [
    { "label": "Order new goals", "sortOrder": 1 },
    { "label": "Paint field lines", "sortOrder": 2 }
  ]
}
```

**Response:** `201 Created` with the new instance (same shape as GET /:id).

### 6.4 `PUT /api/admin/checklists/:id/items/:itemId`

Toggle item completion or update label.

**Request body (partial update):**

```json
{
  "completed": true,
  "label": "Updated label (optional)"
}
```

The service sets `completed_at` to now and `completed_by` to the authenticated user when `completed` is `true`. When `completed` is `false`, both fields are cleared.

**Response:** `200 OK` with the updated item.

### 6.5 `POST /api/admin/checklists/:id/items`

Add a custom item to an existing checklist.

**Request body:**

```json
{ "label": "Buy new bibs", "sortOrder": 6 }
```

The item is created with `is_custom = 1`. **Response:** `201 Created` with the new item.

### 6.6 `DELETE /api/admin/checklists/:id/items/:itemId`

Remove an item. Only custom items (`is_custom = 1`) can be deleted. Attempting to delete a template-sourced item returns `403 Forbidden` with an error message. (Template items can be hidden in a future version, but not deleted.)

### 6.7 `PUT /api/admin/checklists/:id/reorder`

Reorder items within a checklist.

**Request body:**

```json
{
  "order": [3, 1, 2, 5, 4]
}
```

The array contains item IDs in the desired order. The service assigns `sort_order` values 1..N accordingly.

**Response:** `200 OK` with the full updated items list.

---

## 7. Service Layer — `checklist.service.ts`

### 7.1 Core Functions

```ts
// Query helpers (reuse the rowsToObjects pattern from attendance.ts)
function rowsToObjects(result): Record<string, unknown>[]

// ── CRUD ────────────────────────────────────────────────────────
function listInstances(filters: { type?, eventId?, status?, semester? }): ChecklistInstance[]
function getInstance(id: number): ChecklistInstance & { items: ChecklistItem[] }
function createInstance(type: ChecklistType, eventId: number | null, items: { label: string; sortOrder: number }[]): ChecklistInstance
function toggleItem(itemId: number, completed: boolean, userId: number): ChecklistItem
function addCustomItem(instanceId: number, label: string, sortOrder: number): ChecklistItem
function removeItem(itemId: number): void   // only is_custom=1
function reorderItems(instanceId: number, orderedIds: number[]): ChecklistItem[]

// ── Template instantiation ──────────────────────────────────────
function instantiateFromTemplate(type: ChecklistType, eventId: number | null): ChecklistInstance
function getMatchingTemplates(type: ChecklistType, classifications: ClubClassification[]): ChecklistTemplate[]

// ── Reset logic ─────────────────────────────────────────────────
function getCurrentSemester(date?: Date): string          // e.g. "2026-spring"
function resetAdminChecklists(): ChecklistInstance         // archive old, create new
function ensureTrainingChecklist(eventId: number): void    // idempotent
function ensureTournamentChecklist(eventId: number): void  // idempotent

// ── Classification ──────────────────────────────────────────────
function getActiveClassifications(clubId?: number): ClubClassification[]
function setClassifications(clubId: number, classifications: ClubClassification[]): void
function refilterAdminChecklist(instanceId: number): void  // re-apply classification filter
```

### 7.2 Template Instantiation Logic

When a **training** or **tournament** event is created (hook into the existing `POST /api/events` route or use a post-insert callback):

1. Determine the event type (`training` or `tournament`).
2. Call `getActiveClassifications()` to get the club's current classifications.
3. Call `getMatchingTemplates(type, classifications)` — this returns all templates whose `classification_filter` is either null or overlaps with the club's classifications.
4. Merge all matching template items into a single deduplicated list, sorted by `sort_order`.
5. Insert a new `checklist_instances` row with `event_id` and current semester.
6. Insert all items into `checklist_items`.

**Important:** This must be idempotent. If an instance already exists for that `event_id`, do not create a duplicate. The `ensureTrainingChecklist` and `ensureTournamentChecklist` functions handle this.

### 7.3 Semester Calculation

```ts
function getCurrentSemester(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based
  // Spring semester: Feb 1 – Jul 31
  // Autumn semester: Aug 1 – Jan 31 (of next year)
  if (month >= 2 && month <= 7) {
    return `${year}-spring`;
  }
  // Aug–Dec: autumn of current year
  // Jan: autumn of previous year
  if (month === 1) {
    return `${year - 1}-autumn`;
  }
  return `${year}-autumn`;
}
```

### 7.4 Reset Logic (Admin Checklists)

Run on application startup and can also be triggered manually:

1. Compute `getCurrentSemester()`.
2. Query for an active admin checklist instance matching this semester.
3. If none exists:
   a. Archive all previous active admin instances (`status = 'archived'`).
   b. Collect custom items (`is_custom = 1`) from the most recent archived instance — these survive resets.
   c. Call `instantiateFromTemplate('admin', null)` to create a new instance.
   d. Re-insert the preserved custom items (unchecked, with original labels and sort orders appended after template items).

### 7.5 Integration with Event Creation

In `server/src/routes/events.ts`, after a successful `INSERT INTO events`, add:

```ts
import { ensureTrainingChecklist, ensureTournamentChecklist } from "../services/checklist.service.js";

// ... inside POST /api/events handler, after db.run(INSERT ...):
const eventId = /* last insert rowid */;
if (type === "training") {
  ensureTrainingChecklist(eventId);
} else if (type === "tournament") {
  ensureTournamentChecklist(eventId);
}
```

---

## 8. Classification Filtering

### How it works

1. The `club_classifications` table holds the club's active memberships.
2. Each `checklist_templates` row has a nullable `classification_filter` column.
   - `null` means the template applies to **all** clubs regardless of classification.
   - A comma-separated string like `"sfv,fvrz"` means the template applies only if the club has at least one of those classifications active.
3. When building an admin checklist, the service:
   - Fetches all templates with `type = 'admin'`.
   - Filters out templates whose `classification_filter` does not overlap with the club's active classifications.
   - Merges the remaining templates' items.

### SQL for filtered template lookup

```sql
SELECT * FROM checklist_templates
WHERE type = 'admin'
  AND (
    classification_filter IS NULL
    OR EXISTS (
      SELECT 1 FROM club_classifications
      WHERE club_id = ? AND active = 1
        AND (',' || checklist_templates.classification_filter || ',')
            LIKE ('%,' || club_classifications.classification || ',%')
    )
  );
```

---

## 9. Reminder Integration

Incomplete checklist items can trigger reminders via the existing n8n workflow infrastructure.

### Approach

1. Add a `deadline` column (nullable TEXT, ISO date) to `checklist_items` for items that have a due date.
2. The reminders service (already exists at `server/src/services/reminders.ts`) queries for items where:
   - `completed = 0`
   - `deadline` is within X days (configurable, default 3 days)
3. The reminder sends a WhatsApp message to the club admin listing incomplete items approaching their deadline.

### n8n webhook payload

```json
{
  "type": "checklist_reminder",
  "checklistId": 1,
  "checklistType": "admin",
  "incompleteItems": [
    { "label": "Liability insurance renewed", "deadline": "2026-03-01" }
  ],
  "recipientPhone": "+41791234567"
}
```

This is a low-priority integration. Implement the core CRUD first; reminders can be wired up after the reminders module is stable.

---

## 10. Edge Cases

### 10.1 Club changes classification mid-semester

When the admin updates `club_classifications`:

1. Call `refilterAdminChecklist(instanceId)` on the current active admin checklist.
2. The function:
   - Fetches the new set of matching templates.
   - Compares existing template-sourced items against the new set.
   - **Adds** items from newly applicable templates (unchecked).
   - **Does NOT remove** items from templates that no longer apply — they are kept but can be manually deleted. This prevents data loss if a coach already checked off an item and the classification was toggled by accident.
3. Custom items (`is_custom = 1`) are never affected by classification changes.

### 10.2 Custom items preserved across resets

When an admin checklist resets at a semester boundary:

- All items with `is_custom = 1` from the previous instance are copied into the new instance.
- Their `completed` flag is reset to `0` (unchecked).
- Their `sort_order` is set to continue after the last template item.

### 10.3 Concurrent editing

Two coaches toggle the same item simultaneously:

- Since sql.js is single-threaded (in-process), there is no true concurrency issue at the DB level.
- The API uses last-write-wins for `completed` status. The response always returns the current state so the client can reconcile.
- For reorder operations, the entire `order` array is applied atomically in a single transaction. If two reorder requests arrive, the second overwrites the first.

### 10.4 Duplicate event checklists

The `ensureTrainingChecklist` / `ensureTournamentChecklist` functions check for an existing instance with the same `event_id` before creating one. This makes them safe to call multiple times (idempotent).

### 10.5 Empty templates

If no templates match the club's classifications for a given type, the instance is still created but with zero items. The coach can add custom items manually.

### 10.6 Template seeding on first run

On application startup (in `database.ts` or a dedicated migration function), check if `checklist_templates` has zero rows. If so, seed from `CHECKLIST_TEMPLATE_SEEDS`. Use `INSERT OR IGNORE` to avoid duplicates on subsequent runs.

---

## 11. Testing Strategy

### Unit tests (`server/src/services/__tests__/checklist.test.ts`)

1. `getCurrentSemester()` returns correct semester for boundary dates (Jan 31, Feb 1, Jul 31, Aug 1).
2. `instantiateFromTemplate()` creates instance with correct items.
3. Classification filtering: only matching templates are included.
4. Toggle item: sets/clears `completed_at` and `completed_by`.
5. Add custom item: `is_custom = 1`, correct sort order.
6. Remove item: only deletes custom items; rejects template items.
7. Reorder: updates sort_order for all items in order.
8. Reset logic: archives old instance, creates new one, preserves custom items unchecked.
9. Mid-semester classification change: adds new items, keeps old ones.
10. Idempotent instance creation: calling `ensureTrainingChecklist` twice does not duplicate.

### Route tests (`server/src/routes/__tests__/checklists.test.ts`)

1. GET returns filtered list with item counts.
2. POST creates custom checklist with items.
3. PUT toggle returns updated item.
4. DELETE rejects non-custom items with 403.
5. PUT reorder applies correct ordering.
6. Auth: unauthenticated requests return 401.

---

## 12. Implementation Order

1. Add DB schema (tables + indexes) to `database.ts`.
2. Create `server/src/models/checklist.model.ts` with interfaces.
3. Create `server/src/data/checklist-templates.ts` with seed data.
4. Write unit tests for the service layer.
5. Implement `server/src/services/checklist.service.ts` — make tests pass.
6. Write route tests.
7. Implement `server/src/routes/checklists.routes.ts` — make tests pass.
8. Hook into `POST /api/events` for auto-creation of training/tournament checklists.
9. Add semester-reset logic to application startup.
10. Wire up reminder integration (low priority, after reminders module is stable).
