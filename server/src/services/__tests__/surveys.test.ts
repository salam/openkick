import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";
import {
  createSurvey,
  getSurveyById,
  getQuestions,
  closeSurvey,
  listSurveys,
} from "../survey.service.js";

let db: Database;

describe("surveys schema", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  afterEach(() => {
    db.close();
  });

  it("creates surveys table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='surveys'");
    expect(result[0]?.values.length).toBe(1);
  });

  it("creates survey_questions table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='survey_questions'");
    expect(result[0]?.values.length).toBe(1);
  });

  it("creates survey_responses table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='survey_responses'");
    expect(result[0]?.values.length).toBe(1);
  });

  it("creates survey_answers table", () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='survey_answers'");
    expect(result[0]?.values.length).toBe(1);
  });
});

describe("surveys CRUD", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  afterEach(() => {
    db.close();
  });

  it("createSurvey creates survey with 2 questions", () => {
    const survey = createSurvey(
      "Team Feedback",
      1,
      true,
      "2026-04-01",
      null,
      null,
      [
        { type: "star_rating", label: "How was training?", sort_order: 0 },
        { type: "free_text", label: "Any comments?", sort_order: 1 },
      ],
    );
    expect(survey.id).toBeGreaterThan(0);
    expect(survey.title).toBe("Team Feedback");
    expect(typeof survey.anonymous).toBe("boolean");
    expect(survey.anonymous).toBe(true);

    const questions = getQuestions(survey.id);
    expect(questions.length).toBe(2);
  });

  it("getSurveyById returns null for non-existent ID", () => {
    const survey = getSurveyById(9999);
    expect(survey).toBeNull();
  });

  it("getSurveyById returns survey for valid ID", () => {
    const created = createSurvey("Valid Survey", null, false, null, null, null, []);
    const fetched = getSurveyById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("Valid Survey");
    expect(fetched!.anonymous).toBe(false);
  });

  it("closeSurvey sets status to closed", () => {
    const survey = createSurvey("Open Survey", null, true, null, null, null, []);
    expect(survey.status).toBe("open");

    closeSurvey(survey.id);

    const updated = getSurveyById(survey.id);
    expect(updated!.status).toBe("closed");
  });

  it("listSurveys returns all surveys", () => {
    createSurvey("Survey A", null, true, null, null, null, []);
    createSurvey("Survey B", null, false, null, null, null, []);

    const all = listSurveys();
    expect(all.length).toBe(2);
  });

  it("listSurveys filters by team_id", () => {
    createSurvey("Team 1 Survey", 1, true, null, null, null, []);
    createSurvey("Team 2 Survey", 2, true, null, null, null, []);

    const team1 = listSurveys(1);
    expect(team1.length).toBe(1);
    expect(team1[0].title).toBe("Team 1 Survey");
  });
});
