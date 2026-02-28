# User Management Widget — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Users widget to the settings page where admins manage coaches/admins (roles, password resets, invites) and coaches can view the list and invite other coaches.

**Architecture:** New `routes/users.ts` with 4 endpoints protected by `authMiddleware` + `requireRole`. Frontend adds a Users card to the existing settings page. JWT role is decoded client-side to drive permission-based UI.

**Tech Stack:** Express routes, sql.js queries, bcryptjs, existing `sendEmail` service, Next.js React component, Tailwind CSS

---

### Task 1: Backend — Users route with GET /api/users

**Files:**
- Create: `server/src/routes/users.ts`
- Modify: `server/src/index.ts:1-52` (add import + mount)
- Test: `server/src/__tests__/users.test.ts`

**Step 1: Write the failing test**

Create `server/src/__tests__/users.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "sql.js";
import request from "supertest";
import { initDB } from "../database.js";
import { generateJWT } from "../auth.js";

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
  getSmtpConfig: vi.fn(),
}));

const { default: app } = await import("../index.js");

let db: Database;

beforeEach(async () => {
  db = await initDB();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

function insertUser(name: string, email: string, role: string): number {
  db.run(
    "INSERT INTO guardians (phone, name, email, passwordHash, role) VALUES (?, ?, ?, ?, ?)",
    [email, name, email, "hash123", role],
  );
  return db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
}

describe("GET /api/users", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("returns coaches and admins for an admin", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    insertUser("Coach A", "coach@test.com", "coach");
    // Also insert a parent — should NOT appear
    db.run(
      "INSERT INTO guardians (phone, name, role) VALUES ('123', 'Parent', 'parent')",
    );

    const token = generateJWT({ id: adminId, role: "admin" });
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("email");
    expect(res.body[0]).toHaveProperty("role");
    expect(res.body[0]).not.toHaveProperty("passwordHash");
  });

  it("returns users for a coach too", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("returns 403 for a parent", async () => {
    const token = generateJWT({ id: 99, role: "parent" });
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: FAIL (route does not exist, 404)

**Step 3: Write minimal implementation**

Create `server/src/routes/users.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { authMiddleware, requireRole } from "../auth.js";

export const usersRouter = Router();

// GET /api/users — list all coaches and admins
usersRouter.get(
  "/users",
  authMiddleware,
  requireRole("admin", "coach"),
  (_req: Request, res: Response) => {
    const db = getDB();
    const result = db.exec(
      "SELECT id, name, email, role, createdAt FROM guardians WHERE role IN ('admin', 'coach') ORDER BY createdAt ASC",
    );

    if (result.length === 0) {
      res.json([]);
      return;
    }

    const cols = result[0].columns;
    const rows = result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });

    res.json(rows);
  },
);
```

Add to `server/src/index.ts`:
- Import: `import { usersRouter } from "./routes/users.js";`
- Mount: `app.use("/api", usersRouter);` (after settingsRouter line)

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: PASS

**Step 5: Commit**

```
git restore --staged :/ && git add server/src/routes/users.ts server/src/__tests__/users.test.ts server/src/index.ts && git commit -m "feat: add GET /api/users endpoint for listing coaches/admins" -- server/src/routes/users.ts server/src/__tests__/users.test.ts server/src/index.ts
```

---

### Task 2: Backend — PUT /api/users/:id/role

**Files:**
- Modify: `server/src/routes/users.ts`
- Modify: `server/src/__tests__/users.test.ts`

**Step 1: Write the failing tests**

Append to `server/src/__tests__/users.test.ts`:

```ts
describe("PUT /api/users/:id/role", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).put("/api/users/1/role").send({ role: "coach" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a coach", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });
    const res = await request(app)
      .put(`/api/users/${coachId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("changes role from coach to admin", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${coachId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("prevents last admin from self-demotion", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${adminId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "coach" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last admin/i);
  });

  it("allows demotion when another admin exists", async () => {
    const admin1 = insertUser("Admin1", "admin1@test.com", "admin");
    insertUser("Admin2", "admin2@test.com", "admin");
    const token = generateJWT({ id: admin1, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${admin1}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "coach" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("coach");
  });

  it("rejects invalid role", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .put(`/api/users/${coachId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "parent" });

    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: FAIL (404 on PUT)

**Step 3: Write minimal implementation**

Add to `server/src/routes/users.ts`:

```ts
// PUT /api/users/:id/role — admin changes a user's role
usersRouter.put(
  "/users/:id/role",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const { role } = req.body;
    const targetId = Number(req.params.id);

    if (!role || !["admin", "coach"].includes(role)) {
      res.status(400).json({ error: "role must be 'admin' or 'coach'" });
      return;
    }

    const db = getDB();

    // Check target exists and is coach/admin
    const target = db.exec(
      "SELECT id, role FROM guardians WHERE id = ? AND role IN ('admin', 'coach')",
      [targetId],
    );
    if (target.length === 0 || target[0].values.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentRole = target[0].values[0][1] as string;

    // Prevent last-admin demotion
    if (currentRole === "admin" && role === "coach") {
      const adminCount = db.exec(
        "SELECT COUNT(*) FROM guardians WHERE role = 'admin'",
      );
      const count = adminCount[0].values[0][0] as number;
      if (count <= 1) {
        res.status(409).json({ error: "Cannot demote the last admin" });
        return;
      }
    }

    db.run("UPDATE guardians SET role = ? WHERE id = ?", [role, targetId]);
    res.json({ id: targetId, role });
  },
);
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: PASS

**Step 5: Commit**

```
git commit -m "feat: add PUT /api/users/:id/role endpoint for role changes" -- server/src/routes/users.ts server/src/__tests__/users.test.ts
```

---

### Task 3: Backend — POST /api/users/:id/reset-password

**Files:**
- Modify: `server/src/routes/users.ts`
- Modify: `server/src/__tests__/users.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```ts
describe("POST /api/users/:id/reset-password", () => {
  it("returns 403 for a coach", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });
    const res = await request(app)
      .post(`/api/users/${coachId}/reset-password`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("sends reset email and returns 204 for admin", async () => {
    const { sendEmail } = await import("../services/email.js");
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .post(`/api/users/${coachId}/reset-password`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(sendEmail).toHaveBeenCalledWith(
      "coach@test.com",
      "Password Reset",
      expect.stringContaining("reset-password"),
    );

    // Verify resetToken was stored
    const row = db.exec("SELECT resetToken FROM guardians WHERE id = ?", [coachId]);
    expect(row[0].values[0][0]).toBeTruthy();
  });

  it("returns 404 for non-existent user", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });
    const res = await request(app)
      .post("/api/users/999/reset-password")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: FAIL (404)

**Step 3: Write minimal implementation**

Add imports at top of `server/src/routes/users.ts`:
```ts
import crypto from "node:crypto";
import { sendEmail } from "../services/email.js";
```

Add route:

```ts
// POST /api/users/:id/reset-password — admin triggers password reset email
usersRouter.post(
  "/users/:id/reset-password",
  authMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const db = getDB();

    const result = db.exec(
      "SELECT id, email FROM guardians WHERE id = ? AND role IN ('admin', 'coach')",
      [targetId],
    );

    if (result.length === 0 || result[0].values.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const email = result[0].values[0][1] as string;
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.run(
      "UPDATE guardians SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?",
      [resetToken, resetTokenExpiry, targetId],
    );

    const baseUrl = process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${resetToken}/`;

    try {
      await sendEmail(
        email,
        "Password Reset",
        `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
      );
    } catch (err) {
      console.error("Failed to send password reset email:", err);
    }

    res.status(204).send();
  },
);
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: PASS

**Step 5: Commit**

```
git commit -m "feat: add POST /api/users/:id/reset-password endpoint" -- server/src/routes/users.ts server/src/__tests__/users.test.ts
```

---

### Task 4: Backend — POST /api/users/invite

**Files:**
- Modify: `server/src/routes/users.ts`
- Modify: `server/src/__tests__/users.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```ts
describe("POST /api/users/invite", () => {
  it("admin invites a new coach", async () => {
    const { sendEmail } = await import("../services/email.js");
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Coach", email: "new@test.com", role: "coach" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Coach");
    expect(res.body.role).toBe("coach");
    expect(sendEmail).toHaveBeenCalled();
  });

  it("admin invites a new admin", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Admin", email: "newadmin@test.com", role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("admin");
  });

  it("coach can invite a new coach", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });

    const res = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Coach", email: "new@test.com", role: "coach" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("coach");
  });

  it("coach cannot invite an admin", async () => {
    const coachId = insertUser("Coach", "coach@test.com", "coach");
    const token = generateJWT({ id: coachId, role: "coach" });

    const res = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bad Invite", email: "bad@test.com", role: "admin" });

    expect(res.status).toBe(403);
  });

  it("rejects duplicate email", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Dup", email: "admin@test.com", role: "coach" });

    expect(res.status).toBe(409);
  });

  it("validates required fields", async () => {
    const adminId = insertUser("Admin", "admin@test.com", "admin");
    const token = generateJWT({ id: adminId, role: "admin" });

    const res = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "No Email" });

    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: FAIL (404)

**Step 3: Write minimal implementation**

Add to `server/src/routes/users.ts`:

```ts
// POST /api/users/invite — invite a new coach or admin
usersRouter.post(
  "/users/invite",
  authMiddleware,
  requireRole("admin", "coach"),
  async (req: Request, res: Response) => {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      res.status(400).json({ error: "name, email, and role are required" });
      return;
    }

    if (!["admin", "coach"].includes(role)) {
      res.status(400).json({ error: "role must be 'admin' or 'coach'" });
      return;
    }

    // Coaches can only invite coaches
    if (req.user!.role === "coach" && role === "admin") {
      res.status(403).json({ error: "Coaches can only invite other coaches" });
      return;
    }

    const db = getDB();

    // Check for duplicate email (phone column stores email for coaches/admins)
    const existing = db.exec(
      "SELECT id FROM guardians WHERE email = ? OR phone = ?",
      [email, email],
    );
    if (existing.length > 0 && existing[0].values.length > 0) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.run(
      "INSERT INTO guardians (phone, name, email, role, resetToken, resetTokenExpiry) VALUES (?, ?, ?, ?, ?, ?)",
      [email, name, email, role, resetToken, resetTokenExpiry],
    );

    const idResult = db.exec("SELECT last_insert_rowid()");
    const id = idResult[0].values[0][0] as number;

    const baseUrl = process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${resetToken}/`;

    try {
      await sendEmail(
        email,
        "You've been invited to OpenKick",
        `<p>Hi ${name},</p><p>You've been invited as a ${role}. Click <a href="${resetUrl}">here</a> to set your password and get started.</p>`,
      );
    } catch (err) {
      console.error("Failed to send invite email:", err);
    }

    res.status(201).json({ id, name, email, role });
  },
);
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/users.test.ts`
Expected: PASS

**Step 5: Commit**

```
git commit -m "feat: add POST /api/users/invite endpoint" -- server/src/routes/users.ts server/src/__tests__/users.test.ts
```

---

### Task 5: Frontend — Add JWT role decoding to auth lib

**Files:**
- Modify: `web/src/lib/auth.ts`

**Step 1: Add `getUserRole()` helper**

The JWT payload is base64-encoded JSON in the second segment. Add to `web/src/lib/auth.ts`:

```ts
/** Decode the role from the stored JWT (no verification — server is the authority) */
export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}
```

**Step 2: Commit**

```
git commit -m "feat: add getUserRole() helper to decode JWT role" -- web/src/lib/auth.ts
```

---

### Task 6: Frontend — Users card in settings page

**Files:**
- Modify: `web/src/app/settings/page.tsx`

**Step 1: Add state, handlers, and JSX for the Users card**

Import `getUserRole` from `@/lib/auth`.

Add state variables near the top of `SettingsPage`:

```ts
const [users, setUsers] = useState<{ id: number; name: string; email: string; role: string; createdAt: string }[]>([]);
const [loadingUsers, setLoadingUsers] = useState(true);
const [userMsg, setUserMsg] = useState('');
const [showInviteForm, setShowInviteForm] = useState(false);
const [inviteName, setInviteName] = useState('');
const [inviteEmail, setInviteEmail] = useState('');
const [inviteRole, setInviteRole] = useState('coach');
const [inviting, setInviting] = useState(false);
```

Add:
```ts
const currentRole = getUserRole();
const isAdmin = currentRole === 'admin';
```

Add `loadUsers` callback, `handleRoleChange`, `handleResetPassword`, and `handleInvite` functions as specified in the design doc (see Task 6 details in the plan above for exact code).

Add Users card JSX before the Save button (`{/* Save */}` comment). The card includes:
- Header with "Invite User" toggle button
- Collapsible invite form (name, email, role dropdown)
- Status message area
- Table: Name | Email | Role | Actions
  - Admin: role dropdown + reset password link
  - Coach: static role badge, no actions

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`

**Step 3: Commit**

```
git commit -m "feat: add Users card to settings page with role management and invites" -- web/src/app/settings/page.tsx web/src/lib/auth.ts
```

---

### Task 7: Run all tests and verify build

**Step 1: Run backend tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 2: Run frontend build**

Run: `cd web && npx next build`
Expected: Build succeeds

**Step 3: Manual smoke test**

1. Log in as admin -> go to settings -> see Users card with table
2. Change a coach to admin -> role dropdown updates
3. Click "Reset Password" -> confirmation -> success toast
4. Click "Invite User" -> fill form -> sends invite
5. Log in as coach -> see Users card -> table is read-only, Invite button works (coach only)

---

### Task 8: Update docs and feature tracking

**Files:**
- Modify: `FEATURES.md` (add user management)
- Modify: `RELEASE_NOTES.md` (add to current section)
- Modify: `docs/QUICK_START_COACHES.md` (mention Users widget)

**Step 1: Update files**

FEATURES.md:
```
- [x] User management widget in settings (list, role changes, password reset, invites)
```

RELEASE_NOTES.md:
```
* User management: admins can view, invite, and manage coaches and other admins directly from Settings. Coaches can view the user list and invite new coaches.
```

docs/QUICK_START_COACHES.md: Add brief section about the Users section in Settings.

**Step 2: Commit**

```
git commit -m "docs: add user management to features, release notes, and coach guide" -- FEATURES.md RELEASE_NOTES.md docs/QUICK_START_COACHES.md
```
