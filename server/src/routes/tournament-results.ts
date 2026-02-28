import { Router, type Request, type Response } from "express";
import {
  getResults,
  createResults,
  updateResults,
  deleteResults,
  getTrophyCabinet,
} from "../services/tournament-results.js";
import { importResultsFromUrl } from "../services/results-import.js";

export const tournamentResultsRouter = Router();

// GET /api/events/:eventId/results
tournamentResultsRouter.get("/events/:eventId/results", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  const result = getResults(eventId);
  if (!result) { res.status(404).json({ error: "No results for this event" }); return; }
  res.json(result);
});

// POST /api/events/:eventId/results
tournamentResultsRouter.post("/events/:eventId/results", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  try {
    const result = createResults(eventId, req.body);
    res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create results";
    res.status(400).json({ error: message });
  }
});

// PUT /api/events/:eventId/results
tournamentResultsRouter.put("/events/:eventId/results", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  try {
    const result = updateResults(eventId, req.body);
    if (!result) { res.status(404).json({ error: "No results for this event" }); return; }
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update results";
    res.status(400).json({ error: message });
  }
});

// DELETE /api/events/:eventId/results
tournamentResultsRouter.delete("/events/:eventId/results", (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  deleteResults(eventId);
  res.status(204).end();
});

// POST /api/events/:eventId/results/import — LLM extraction (returns data, does NOT save)
tournamentResultsRouter.post("/events/:eventId/results/import", async (req: Request, res: Response) => {
  const eventId = Number(req.params.eventId);
  const { url } = req.body;
  if (!url || typeof url !== "string") { res.status(400).json({ error: "url is required" }); return; }
  try {
    const imported = await importResultsFromUrl(eventId, url);
    res.json(imported);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";
    res.status(500).json({ error: message });
  }
});

// GET /api/trophy-cabinet (public)
tournamentResultsRouter.get("/trophy-cabinet", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const entries = getTrophyCabinet(limit, offset);
  res.json(entries);
});
