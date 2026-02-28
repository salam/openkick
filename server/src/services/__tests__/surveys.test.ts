import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";
import {
  createSurvey,
  getSurveyById,
  getQuestions,
  closeSurvey,
  listSurveys,
  submitResponse,
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

// ---------------------------------------------------------------------------
// submitResponse
// ---------------------------------------------------------------------------

describe("survey service — submitResponse", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  afterEach(() => {
    db.close();
  });

  function createTestSurvey(anonymous = false) {
    return createSurvey("Test", null, anonymous, null, null, null, [
      { type: "star_rating", label: "Rate", sort_order: 0 },
      { type: "single_choice", label: "Pick", options_json: JSON.stringify(["A", "B"]), sort_order: 1 },
      { type: "free_text", label: "Comment", sort_order: 2 },
    ]);
  }

  /** Build valid answers for the 3-question test survey. */
  function validAnswers(surveyId: number) {
    const questions = getQuestions(surveyId);
    return [
      { question_id: questions[0].id, value: "4" },
      { question_id: questions[1].id, value: "A" },
      { question_id: questions[2].id, value: "Great!" },
    ];
  }

  it("happy path — identified survey", () => {
    const survey = createTestSurvey(false);
    const response = submitResponse(survey.id, {
      player_nickname: "Luca",
      answers: validAnswers(survey.id),
    });
    expect(response.id).toBeGreaterThan(0);
    expect(response.player_nickname).toBe("Luca");
  });

  it("rejects duplicate submission for identified survey", () => {
    const survey = createTestSurvey(false);
    submitResponse(survey.id, {
      player_nickname: "Luca",
      answers: validAnswers(survey.id),
    });
    expect(() =>
      submitResponse(survey.id, {
        player_nickname: "Luca",
        answers: validAnswers(survey.id),
      }),
    ).toThrow(/already submitted/i);
  });

  it("allows duplicate submissions for anonymous survey", () => {
    const survey = createTestSurvey(true);
    submitResponse(survey.id, { answers: validAnswers(survey.id) });
    expect(() =>
      submitResponse(survey.id, { answers: validAnswers(survey.id) }),
    ).not.toThrow();
  });

  it("rejects submission to a closed survey", () => {
    const survey = createTestSurvey(false);
    closeSurvey(survey.id);
    expect(() =>
      submitResponse(survey.id, {
        player_nickname: "Luca",
        answers: validAnswers(survey.id),
      }),
    ).toThrow(/no longer accepting/i);
  });

  it("rejects submission past deadline", () => {
    const survey = createSurvey("Past", null, false, "2020-01-01T00:00:00Z", null, null, [
      { type: "free_text", label: "Anything?", sort_order: 0 },
    ]);
    const questions = getQuestions(survey.id);
    expect(() =>
      submitResponse(survey.id, {
        player_nickname: "Luca",
        answers: [{ question_id: questions[0].id, value: "hello" }],
      }),
    ).toThrow(/no longer accepting/i);
  });

  it("rejects invalid question_id", () => {
    const survey = createTestSurvey(false);
    expect(() =>
      submitResponse(survey.id, {
        player_nickname: "Luca",
        answers: [
          { question_id: 99999, value: "4" },
          ...validAnswers(survey.id).slice(1),
        ],
      }),
    ).toThrow(/invalid question_id/i);
  });

  it("rejects star_rating outside 1-5", () => {
    const survey = createTestSurvey(false);
    const questions = getQuestions(survey.id);
    expect(() =>
      submitResponse(survey.id, {
        player_nickname: "Luca",
        answers: [
          { question_id: questions[0].id, value: "6" },
          { question_id: questions[1].id, value: "A" },
          { question_id: questions[2].id, value: "ok" },
        ],
      }),
    ).toThrow(/star_rating/i);
  });

  it("rejects invalid single_choice value", () => {
    const survey = createTestSurvey(false);
    const questions = getQuestions(survey.id);
    expect(() =>
      submitResponse(survey.id, {
        player_nickname: "Luca",
        answers: [
          { question_id: questions[0].id, value: "3" },
          { question_id: questions[1].id, value: "C" },
          { question_id: questions[2].id, value: "ok" },
        ],
      }),
    ).toThrow(/not a valid option/i);
  });
});
