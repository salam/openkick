import { Router, type Request, type Response } from "express";
import archiver from "archiver";
import { getDB } from "../database.js";
import { authMiddleware, tokenAuthMiddleware, requireRole } from "../auth.js";
import {
  createGdprRequest,
  listGdprRequests,
  getGdprRequest,
  approveRequest,
  rejectRequest,
  updateConsent,
  executeDeletion,
  generateExport,
} from "../services/gdpr.js";

export const gdprRouter = Router();

function rowsToObjects(
  result: { columns: string[]; values: unknown[][] }[]
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

function flexAuth(req: Request, res: Response, next: () => void): void {
  if (req.query.token) {
    tokenAuthMiddleware(req, res, next);
  } else if (req.headers.authorization) {
    authMiddleware(req, res, next);
  } else {
    res.status(401).json({ error: "Authentication required" });
  }
}

gdprRouter.put("/guardians/:id/consent", flexAuth, (req: Request, res: Response) => {
  const guardianId = Number(req.params.id);
  const { consent } = req.body;

  if (typeof consent !== "boolean") {
    res.status(400).json({ error: "consent (boolean) is required" });
    return;
  }

  if (req.user!.role !== "admin" && req.user!.id !== guardianId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  updateConsent(guardianId, consent);

  const db = getDB();
  const rows = rowsToObjects(
    db.exec(
      "SELECT id, consentGiven, consentGivenAt, consentWithdrawnAt FROM guardians WHERE id = ?",
      [guardianId]
    )
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Guardian not found" });
    return;
  }

  res.json(rows[0]);
});

gdprRouter.post("/gdpr/requests", flexAuth, (req: Request, res: Response) => {
  const { type, reason } = req.body;

  if (type !== "export" && type !== "deletion") {
    res.status(400).json({ error: "type must be 'export' or 'deletion'" });
    return;
  }

  try {
    const request = createGdprRequest(req.user!.id, type, reason);
    res.status(201).json(request);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gdprRouter.get(
  "/gdpr/requests",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const requests = listGdprRequests(status);
    res.json(requests);
  }
);

gdprRouter.get(
  "/gdpr/requests/:id",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const request = getGdprRequest(Number(req.params.id));
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json(request);
  }
);

gdprRouter.put(
  "/gdpr/requests/:id",
  authMiddleware,
  requireRole("admin"),
  (req: Request, res: Response) => {
    const requestId = Number(req.params.id);
    const { status, adminNote } = req.body;

    try {
      let updated;
      if (status === "approved") {
        updated = approveRequest(requestId, req.user!.id);

        const request = getGdprRequest(requestId)!;
        if (request.type === "deletion") {
          executeDeletion(request.guardianId, requestId);
          updated = getGdprRequest(requestId)!;
        }
      } else if (status === "rejected") {
        updated = rejectRequest(requestId, req.user!.id, adminNote);
      } else {
        res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
        return;
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

gdprRouter.get("/gdpr/exports/:id", flexAuth, (req: Request, res: Response) => {
  const requestId = Number(req.params.id);
  const request = getGdprRequest(requestId);

  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (req.user!.role !== "admin" && req.user!.id !== request.guardianId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (request.type !== "export") {
    res.status(400).json({ error: "Not an export request" });
    return;
  }

  if (request.status !== "approved" && request.status !== "completed") {
    res.status(403).json({ error: "Export not yet approved" });
    return;
  }

  try {
    const data = generateExport(request.guardianId);

    const guardianCsv = objectToCsv([data.guardian]);
    const playersCsv = objectToCsv(data.players);
    const attendanceCsv = objectToCsv(data.attendance);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="gdpr-export-${requestId}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    archive.append(JSON.stringify(data.guardian, null, 2), { name: "guardian.json" });
    archive.append(JSON.stringify(data.players, null, 2), { name: "players.json" });
    archive.append(JSON.stringify(data.attendance, null, 2), { name: "attendance.json" });
    archive.append(guardianCsv, { name: "guardian.csv" });
    archive.append(playersCsv, { name: "players.csv" });
    archive.append(attendanceCsv, { name: "attendance.csv" });
    archive.finalize();

    const db = getDB();
    db.run(
      "UPDATE gdpr_requests SET status = 'completed', completedAt = datetime('now') WHERE id = ?",
      [requestId]
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function objectToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val == null) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}
