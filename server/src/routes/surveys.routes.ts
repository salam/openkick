import { Router } from "express";
import { authMiddleware } from "../auth.js";
import {
  createSurvey,
  getSurveyById,
  getQuestions,
  closeSurvey,
  archiveSurvey,
  listSurveys,
  getAggregatedResults,
  createTrikotOrderTemplate,
  createFeedbackTemplate,
} from "../services/survey.service.js";

export const surveysRouter = Router();

// POST /surveys — Create a survey with questions
surveysRouter.post("/surveys", authMiddleware, async (req, res) => {
  try {
    const { title, team_id, anonymous, deadline, price_per_item, questions } =
      req.body;

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const survey = createSurvey(
      title,
      team_id ?? null,
      anonymous ?? false,
      deadline ?? null,
      price_per_item ?? null,
      req.user!.id,
      questions ?? [],
    );

    const surveyQuestions = getQuestions(survey.id);
    res.status(201).json({ survey, questions: surveyQuestions });
  } catch (err) {
    console.error("Failed to create survey:", err);
    res.status(500).json({ error: "Failed to create survey" });
  }
});

// POST /surveys/templates/trikot-order — Create from trikot order template
surveysRouter.post(
  "/surveys/templates/trikot-order",
  authMiddleware,
  async (req, res) => {
    try {
      const { team_id } = req.body;
      const survey = createTrikotOrderTemplate(
        team_id ?? null,
        req.user!.id,
      );
      const questions = getQuestions(survey.id);
      res.status(201).json({ survey, questions });
    } catch (err) {
      console.error("Failed to create trikot order template:", err);
      res.status(500).json({ error: "Failed to create template" });
    }
  },
);

// POST /surveys/templates/feedback — Create from feedback template
surveysRouter.post(
  "/surveys/templates/feedback",
  authMiddleware,
  async (req, res) => {
    try {
      const { team_id } = req.body;
      const survey = createFeedbackTemplate(team_id ?? null, req.user!.id);
      const questions = getQuestions(survey.id);
      res.status(201).json({ survey, questions });
    } catch (err) {
      console.error("Failed to create feedback template:", err);
      res.status(500).json({ error: "Failed to create template" });
    }
  },
);

// GET /surveys — List surveys, optional ?team_id=
surveysRouter.get("/surveys", authMiddleware, async (req, res) => {
  try {
    const teamId = req.query.team_id
      ? Number(req.query.team_id)
      : undefined;
    const surveys = listSurveys(teamId);
    res.json(surveys);
  } catch (err) {
    console.error("Failed to list surveys:", err);
    res.status(500).json({ error: "Failed to list surveys" });
  }
});

// GET /surveys/:id — Get survey + questions
surveysRouter.get("/surveys/:id", authMiddleware, async (req, res) => {
  try {
    const survey = getSurveyById(Number(req.params.id));
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }
    const questions = getQuestions(survey.id);
    res.json({ ...survey, questions });
  } catch (err) {
    console.error("Failed to get survey:", err);
    res.status(500).json({ error: "Failed to get survey" });
  }
});

// GET /surveys/:id/results — Aggregated results
surveysRouter.get(
  "/surveys/:id/results",
  authMiddleware,
  async (req, res) => {
    try {
      const survey = getSurveyById(Number(req.params.id));
      if (!survey) {
        return res.status(404).json({ error: "Survey not found" });
      }
      const results = getAggregatedResults(survey.id);
      res.json(results);
    } catch (err) {
      console.error("Failed to get survey results:", err);
      res.status(500).json({ error: "Failed to get survey results" });
    }
  },
);

// PUT /surveys/:id/close — Close a survey
surveysRouter.put(
  "/surveys/:id/close",
  authMiddleware,
  async (req, res) => {
    try {
      const survey = getSurveyById(Number(req.params.id));
      if (!survey) {
        return res.status(404).json({ error: "Survey not found" });
      }
      closeSurvey(survey.id);
      const updated = getSurveyById(survey.id)!;
      res.json(updated);
    } catch (err) {
      console.error("Failed to close survey:", err);
      res.status(500).json({ error: "Failed to close survey" });
    }
  },
);

// PUT /surveys/:id/archive — Archive a survey
surveysRouter.put(
  "/surveys/:id/archive",
  authMiddleware,
  async (req, res) => {
    try {
      const survey = getSurveyById(Number(req.params.id));
      if (!survey) {
        return res.status(404).json({ error: "Survey not found" });
      }
      archiveSurvey(survey.id);
      const updated = getSurveyById(survey.id)!;
      res.json(updated);
    } catch (err) {
      console.error("Failed to archive survey:", err);
      res.status(500).json({ error: "Failed to archive survey" });
    }
  },
);
