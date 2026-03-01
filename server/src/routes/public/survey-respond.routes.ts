import { Router } from "express";
import QRCode from "qrcode";
import {
  getSurveyById,
  getQuestions,
  submitResponse,
} from "../../services/survey.service.js";

export const surveyRespondRouter = Router();

// GET /surveys/:id — Public survey view (no auth)
surveyRespondRouter.get("/surveys/:id", async (req, res) => {
  try {
    const survey = getSurveyById(Number(req.params.id));
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }

    // Return 410 if survey is not open or deadline has passed
    if (survey.status !== "open") {
      return res
        .status(410)
        .json({ error: "This survey is no longer available." });
    }
    if (survey.deadline && new Date(survey.deadline) < new Date()) {
      return res
        .status(410)
        .json({ error: "This survey is no longer available." });
    }

    const questions = getQuestions(survey.id);

    // Omit created_by and created_at from public response
    res.json({
      id: survey.id,
      title: survey.title,
      anonymous: survey.anonymous,
      status: survey.status,
      deadline: survey.deadline,
      price_per_item: survey.price_per_item ?? null,
      questions,
    });
  } catch (err) {
    console.error("Failed to get public survey:", err);
    res.status(500).json({ error: "Failed to get survey" });
  }
});

// POST /surveys/:id/respond — Submit response (no auth)
surveyRespondRouter.post("/surveys/:id/respond", async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    const response = submitResponse(surveyId, req.body);

    // Check if survey has price_per_item set
    const survey = getSurveyById(surveyId)!;
    const paymentRequired = survey.price_per_item != null && survey.price_per_item > 0;

    res.status(201).json({
      response_id: response.id,
      payment_required: paymentRequired,
      ...(paymentRequired ? { payment_url: null } : {}),
    });
  } catch (err) {
    const message = (err as Error).message;

    if (message.includes("already submitted")) {
      return res.status(409).json({ error: message });
    }
    if (message.includes("no longer accepting")) {
      return res.status(410).json({ error: message });
    }
    if (message.includes("not found")) {
      return res.status(404).json({ error: message });
    }

    res.status(400).json({ error: message });
  }
});

// GET /surveys/:id/qr — QR code PNG (no auth)
surveyRespondRouter.get("/surveys/:id/qr", async (req, res) => {
  try {
    const survey = getSurveyById(Number(req.params.id));
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }

    const surveyUrl =
      (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")) +
      "/surveys/" +
      survey.id;

    const pngBuffer = await QRCode.toBuffer(surveyUrl, {
      width: 400,
      margin: 2,
    });

    res.set("Content-Type", "image/png");
    res.send(pngBuffer);
  } catch (err) {
    console.error("Failed to generate QR code:", err);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});
