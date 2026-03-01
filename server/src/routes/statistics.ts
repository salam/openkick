import { Router, type Request, type Response } from "express";
import { authMiddleware, requireRole } from "../auth.js";
import { parsePeriodParam } from "../utils/semester.js";
import {
  getTrainingHours,
  getPersonHours,
  getCoachHours,
  getNoShows,
  getAttendanceRate,
  getTournamentParticipation,
} from "../services/statistics.service.js";
import { generateCSV, generatePDF } from "../services/export.service.js";

export const statisticsRouter = Router();

// All admin stats require auth + coach/admin role
statisticsRouter.use("/admin/stats", authMiddleware, requireRole("coach", "admin"));

statisticsRouter.get("/admin/stats/training-hours", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getTrainingHours(period, team));
});

statisticsRouter.get("/admin/stats/person-hours", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getPersonHours(period, team));
});

statisticsRouter.get("/admin/stats/coach-hours", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const coachId = req.query.coach ? parseInt(req.query.coach as string, 10) : undefined;
  res.json(getCoachHours(period, coachId));
});

statisticsRouter.get("/admin/stats/no-shows", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getNoShows(period, team));
});

statisticsRouter.get("/admin/stats/attendance-rate", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  const team = req.query.team as string | undefined;
  res.json(getAttendanceRate(period, team));
});

statisticsRouter.get("/admin/stats/tournament-participation", (req: Request, res: Response) => {
  const period = parsePeriodParam(req.query.period as string | undefined);
  res.json(getTournamentParticipation(period));
});

// Export endpoint
statisticsRouter.get("/admin/stats/export", async (req: Request, res: Response) => {
  const format = req.query.format as string;
  const type = req.query.type as string;
  const period = parsePeriodParam(req.query.period as string | undefined);

  if (!format || !["csv", "pdf"].includes(format)) {
    res.status(400).json({ error: "format must be 'csv' or 'pdf'" });
    return;
  }

  const validTypes = [
    "training-hours", "person-hours", "coach-hours",
    "no-shows", "attendance-rate", "tournament-participation",
  ];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  // Build headers + rows based on type
  let headers: string[];
  let rows: Record<string, string | number>[];

  switch (type) {
    case "training-hours": {
      const data = getTrainingHours(period);
      headers = ["Team", "Sessions", "Hours"];
      rows = data.map(d => ({ Team: d.teamName ?? "All", Sessions: d.sessionCount, Hours: d.trainingHours }));
      break;
    }
    case "person-hours": {
      const data = getPersonHours(period);
      headers = ["Team", "Person-Hours"];
      rows = data.map(d => ({ Team: d.teamName ?? "All", "Person-Hours": d.personHours }));
      break;
    }
    case "coach-hours": {
      const data = getCoachHours(period);
      headers = ["Coach", "Sessions", "Hours"];
      rows = data.map(d => ({ Coach: d.coachName, Sessions: d.sessionCount, Hours: d.coachHours }));
      break;
    }
    case "no-shows": {
      const data = getNoShows(period);
      headers = ["Player", "No-Shows", "Registered", "Rate"];
      rows = data.map(d => ({
        Player: d.entityLabel,
        "No-Shows": d.noShowCount,
        Registered: d.registeredCount,
        Rate: Math.round(d.noShowRate * 100) + "%",
      }));
      break;
    }
    case "attendance-rate": {
      const data = getAttendanceRate(period);
      headers = ["Player", "Attended", "Total", "Rate"];
      rows = data.map(d => ({
        Player: d.entityLabel,
        Attended: d.attendedCount,
        Total: d.totalSessions,
        Rate: Math.round(d.attendanceRate * 100) + "%",
      }));
      break;
    }
    case "tournament-participation": {
      const data = getTournamentParticipation(period);
      headers = ["Player", "Tournaments"];
      rows = data.map(d => ({ Player: d.entityLabel, Tournaments: d.tournamentCount }));
      break;
    }
    default:
      res.status(400).json({ error: "Invalid type" });
      return;
  }

  const filename = `openkick-${type}-${period.label.toLowerCase().replace(/[\s/]+/g, "-")}.${format}`;

  if (format === "csv") {
    const buf = generateCSV(headers, rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } else {
    const title = type.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " - " + period.label;
    const buf = await generatePDF(title, headers, rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  }
});
