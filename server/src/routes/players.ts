import { Router, type Request, type Response } from "express";
import { getDB } from "../database.js";
import { getCategoryForBirthYear } from "../services/categories.js";
import {
  hashPassword,
  verifyPassword,
  generateJWT,
  generateAccessToken,
} from "../auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";

export const playersRouter = Router();

// ── Helper: row object from sql.js result ────────────────────────────

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

/**
 * Compute the displayed category for a player row.
 * If a manual category override is stored, use it; otherwise compute from yearOfBirth.
 */
function withCategory(player: Record<string, unknown>): Record<string, unknown> {
  if (player.category) return player;
  if (player.yearOfBirth != null) {
    return { ...player, category: getCategoryForBirthYear(player.yearOfBirth as number) };
  }
  return player;
}

// ── Players CRUD ─────────────────────────────────────────────────────

// POST /api/players
playersRouter.post("/players", (req: Request, res: Response) => {
  const { name, yearOfBirth, position, notes, category } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const db = getDB();
  db.run(
    "INSERT INTO players (name, yearOfBirth, position, notes, category) VALUES (?, ?, ?, ?, ?)",
    [name, yearOfBirth ?? null, position ?? null, notes ?? null, category ?? null],
  );

  const result = db.exec("SELECT last_insert_rowid() AS id");
  const id = result[0].values[0][0] as number;

  const rows = rowsToObjects(db.exec("SELECT * FROM players WHERE id = ?", [id]));
  const player = withCategory(rows[0]);

  res.status(201).json(player);
});

// GET /api/players
playersRouter.get("/players", (_req: Request, res: Response) => {
  const db = getDB();
  const rows = rowsToObjects(db.exec("SELECT * FROM players ORDER BY name"));
  const players = rows.map(withCategory);
  res.json(players);
});

// GET /api/players/:id
playersRouter.get("/players/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const rows = rowsToObjects(db.exec("SELECT * FROM players WHERE id = ?", [id]));
  if (rows.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = withCategory(rows[0]);

  // Fetch linked guardians
  const guardianRows = rowsToObjects(
    db.exec(
      `SELECT g.id, g.phone, g.name, g.email, g.role, g.language
       FROM guardians g
       JOIN guardian_players gp ON g.id = gp.guardianId
       WHERE gp.playerId = ?`,
      [id],
    ),
  );

  res.json({ ...player, guardians: guardianRows });
});

// PUT /api/players/:id
playersRouter.put("/players/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(db.exec("SELECT * FROM players WHERE id = ?", [id]));
  if (existing.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const current = existing[0];
  const name = req.body.name ?? current.name;
  const yearOfBirth = req.body.yearOfBirth ?? current.yearOfBirth;
  const position = req.body.position ?? current.position;
  const notes = req.body.notes ?? current.notes;
  // category: if explicitly provided in body (even null), use it; otherwise keep current
  const category = "category" in req.body ? req.body.category : current.category;

  db.run(
    "UPDATE players SET name = ?, yearOfBirth = ?, position = ?, notes = ?, category = ? WHERE id = ?",
    [name, yearOfBirth, position, notes, category, id],
  );

  const rows = rowsToObjects(db.exec("SELECT * FROM players WHERE id = ?", [id]));
  const player = withCategory(rows[0]);
  res.json(player);
});

// DELETE /api/players/:id
playersRouter.delete("/players/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = rowsToObjects(db.exec("SELECT * FROM players WHERE id = ?", [id]));
  if (existing.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  db.run("DELETE FROM guardian_players WHERE playerId = ?", [id]);
  db.run("DELETE FROM players WHERE id = ?", [id]);
  res.status(204).end();
});

// ── Guardians CRUD ───────────────────────────────────────────────────

// POST /api/guardians
playersRouter.post("/guardians", async (req: Request, res: Response) => {
  const { phone, name, email, password, role, language, consentGiven } = req.body;
  if (!phone) {
    res.status(400).json({ error: "phone is required" });
    return;
  }

  const guardianRole = role || "parent";
  let passwordHash: string | null = null;
  let accessToken: string | null = null;

  // Hash password for coach/admin roles
  if (password && (guardianRole === "coach" || guardianRole === "admin")) {
    passwordHash = await hashPassword(password);
  }

  // Generate access token for parent guardians
  if (guardianRole === "parent") {
    accessToken = generateAccessToken();
  }

  const db = getDB();
  db.run(
    `INSERT INTO guardians (phone, name, email, passwordHash, role, language, consentGiven, accessToken)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      phone,
      name ?? null,
      email ?? null,
      passwordHash,
      guardianRole,
      language ?? "de",
      consentGiven ?? 0,
      accessToken,
    ],
  );

  const result = db.exec("SELECT last_insert_rowid() AS id");
  const id = result[0].values[0][0] as number;

  const rows = rowsToObjects(
    db.exec(
      "SELECT id, phone, name, email, role, language, consentGiven, accessToken, createdAt FROM guardians WHERE id = ?",
      [id],
    ),
  );

  res.status(201).json(rows[0]);
});

// GET /api/guardians
playersRouter.get("/guardians", (_req: Request, res: Response) => {
  const db = getDB();
  const rows = rowsToObjects(
    db.exec(
      "SELECT id, phone, name, email, role, language, consentGiven, accessToken, createdAt FROM guardians ORDER BY name",
    ),
  );
  res.json(rows);
});

// GET /api/guardians/:id
playersRouter.get("/guardians/:id", (req: Request, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);

  const rows = rowsToObjects(
    db.exec(
      "SELECT id, phone, name, email, role, language, consentGiven, accessToken, createdAt FROM guardians WHERE id = ?",
      [id],
    ),
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Guardian not found" });
    return;
  }

  // Fetch linked players
  const playerRows = rowsToObjects(
    db.exec(
      `SELECT p.id, p.name, p.yearOfBirth, p.category, p.position, p.notes
       FROM players p
       JOIN guardian_players gp ON p.id = gp.playerId
       WHERE gp.guardianId = ?`,
      [id],
    ),
  );

  const players = playerRows.map(withCategory);

  res.json({ ...rows[0], players });
});

// POST /api/guardians/:id/players — link guardian to player
playersRouter.post("/guardians/:id/players", (req: Request, res: Response) => {
  const db = getDB();
  const guardianId = Number(req.params.id);
  const { playerId } = req.body;

  if (!playerId) {
    res.status(400).json({ error: "playerId is required" });
    return;
  }

  // Verify guardian exists
  const guardian = rowsToObjects(db.exec("SELECT id FROM guardians WHERE id = ?", [guardianId]));
  if (guardian.length === 0) {
    res.status(404).json({ error: "Guardian not found" });
    return;
  }

  // Verify player exists
  const player = rowsToObjects(db.exec("SELECT id FROM players WHERE id = ?", [playerId]));
  if (player.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  db.run(
    "INSERT OR IGNORE INTO guardian_players (guardianId, playerId) VALUES (?, ?)",
    [guardianId, playerId],
  );

  res.status(201).json({ guardianId, playerId });
});

// POST /api/guardians/login — email + password login
playersRouter.post("/guardians/login", authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const db = getDB();
  const rows = rowsToObjects(
    db.exec("SELECT id, role, passwordHash FROM guardians WHERE email = ?", [email]),
  );

  if (rows.length === 0) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const guardian = rows[0];
  if (!guardian.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await verifyPassword(password, guardian.passwordHash as string);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = generateJWT({ id: guardian.id as number, role: guardian.role as string });
  res.json({ token });
});
