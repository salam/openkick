import { Router } from "express";
import {
  getTickerEntries,
  upsertTickerEntry,
  getActiveTournamentTickers,
  setCrawlConfig,
  getCrawlConfigs,
  removeCrawlConfig,
  crawlAndExtract,
  updateLastCrawled,
} from "../services/live-ticker.service.js";

export const liveTickerRouter = Router();

// GET /live-ticker/active — active tournament tickers (public)
liveTickerRouter.get("/live-ticker/active", (_req, res) => {
  const tickers = getActiveTournamentTickers();
  res.json(tickers);
});

// GET /live-ticker/:tournamentId — entries for one tournament (public)
liveTickerRouter.get("/live-ticker/:tournamentId", (req, res) => {
  const tournamentId = Number(req.params.tournamentId);
  if (isNaN(tournamentId)) {
    res.status(400).json({ error: "Invalid tournamentId" });
    return;
  }
  const entries = getTickerEntries(tournamentId);
  res.json(entries);
});

// POST /live-ticker/:tournamentId/manual — add manual score
liveTickerRouter.post("/live-ticker/:tournamentId/manual", (req, res) => {
  const tournamentId = Number(req.params.tournamentId);
  if (isNaN(tournamentId)) {
    res.status(400).json({ error: "Invalid tournamentId" });
    return;
  }

  const { home, away, score, matchLabel, matchTime } = req.body;
  if (!home || !away) {
    res.status(400).json({ error: "home and away are required" });
    return;
  }

  upsertTickerEntry(
    tournamentId,
    {
      home,
      away,
      score: score || null,
      match: matchLabel || null,
      time: matchTime || null,
    },
    "manual",
  );

  res.status(201).json({ success: true });
});

// PUT /live-ticker/:tournamentId/crawl-config — set crawl URL
liveTickerRouter.put("/live-ticker/:tournamentId/crawl-config", (req, res) => {
  const tournamentId = Number(req.params.tournamentId);
  if (isNaN(tournamentId)) {
    res.status(400).json({ error: "Invalid tournamentId" });
    return;
  }

  const { url, intervalMin } = req.body;
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  setCrawlConfig(tournamentId, url, intervalMin);
  res.json({ success: true });
});

// GET /live-ticker/:tournamentId/crawl-configs — list crawl configs
liveTickerRouter.get(
  "/live-ticker/:tournamentId/crawl-configs",
  (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    if (isNaN(tournamentId)) {
      res.status(400).json({ error: "Invalid tournamentId" });
      return;
    }

    const configs = getCrawlConfigs(tournamentId);
    res.json(configs);
  },
);

// DELETE /live-ticker/crawl-config/:id — deactivate crawl config
liveTickerRouter.delete("/live-ticker/crawl-config/:id", (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid config id" });
    return;
  }

  removeCrawlConfig(id);
  res.json({ success: true });
});

// POST /live-ticker/:tournamentId/crawl-now — trigger immediate crawl
liveTickerRouter.post(
  "/live-ticker/:tournamentId/crawl-now",
  async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    if (isNaN(tournamentId)) {
      res.status(400).json({ error: "Invalid tournamentId" });
      return;
    }

    const configs = getCrawlConfigs(tournamentId);
    if (configs.length === 0) {
      res
        .status(404)
        .json({ error: "No active crawl configs for this tournament" });
      return;
    }

    const results = [];
    for (const config of configs) {
      const result = await crawlAndExtract(tournamentId, config.url);
      updateLastCrawled(config.id);
      results.push(result);
    }

    res.json({ results });
  },
);
