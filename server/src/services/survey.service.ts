import { getDB, getLastInsertId } from "../database.js";
import type {
  Survey,
  SurveyStatus,
  SurveyResponse,
  SubmitResponsePayload,
  QuestionParsed,
  QuestionType,
} from "../models/survey.model.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function rowToSurvey(row: Record<string, unknown>): Survey {
  return {
    id: row.id as number,
    title: row.title as string,
    team_id: (row.team_id as number) ?? null,
    anonymous: (row.anonymous as number) === 1,
    status: row.status as SurveyStatus,
    deadline: (row.deadline as string) ?? null,
    price_per_item: (row.price_per_item as number) ?? null,
    created_by: (row.created_by as number) ?? null,
    created_at: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createSurvey(
  title: string,
  team_id: number | null,
  anonymous: boolean,
  deadline: string | null,
  price_per_item: number | null,
  created_by: number | null,
  questions: { type: QuestionType; label: string; options_json?: string; sort_order: number }[],
): Survey {
  const db = getDB();
  db.run(
    `INSERT INTO surveys (title, team_id, anonymous, deadline, price_per_item, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, team_id, anonymous ? 1 : 0, deadline, price_per_item, created_by],
  );
  const surveyId = getLastInsertId();

  for (const q of questions) {
    db.run(
      `INSERT INTO survey_questions (survey_id, type, label, options_json, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [surveyId, q.type, q.label, q.options_json ?? null, q.sort_order],
    );
  }

  return getSurveyById(surveyId)!;
}

export function getSurveyById(id: number): Survey | null {
  const db = getDB();
  const result = db.exec("SELECT * FROM surveys WHERE id = ?", [id]);
  const rows = rowsToObjects(result);
  if (rows.length === 0) return null;
  return rowToSurvey(rows[0]);
}

export function getQuestions(surveyId: number): QuestionParsed[] {
  const db = getDB();
  const result = db.exec(
    "SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order",
    [surveyId],
  );
  const rows = rowsToObjects(result);
  return rows.map((row) => ({
    id: row.id as number,
    survey_id: row.survey_id as number,
    type: row.type as QuestionType,
    label: row.label as string,
    options: row.options_json ? JSON.parse(row.options_json as string) : null,
    sort_order: row.sort_order as number,
  }));
}

export function closeSurvey(id: number): void {
  const db = getDB();
  db.run("UPDATE surveys SET status = 'closed' WHERE id = ?", [id]);
}

export function archiveSurvey(id: number): void {
  const db = getDB();
  db.run("UPDATE surveys SET status = 'archived' WHERE id = ?", [id]);
}

export function listSurveys(teamId?: number): Survey[] {
  const db = getDB();
  let result;
  if (teamId !== undefined) {
    result = db.exec("SELECT * FROM surveys WHERE team_id = ? ORDER BY id DESC", [teamId]);
  } else {
    result = db.exec("SELECT * FROM surveys ORDER BY id DESC");
  }
  const rows = rowsToObjects(result);
  return rows.map(rowToSurvey);
}

// ---------------------------------------------------------------------------
// Submit response
// ---------------------------------------------------------------------------

export function submitResponse(
  surveyId: number,
  payload: SubmitResponsePayload,
): SurveyResponse {
  const db = getDB();

  // 1. Get survey
  const survey = getSurveyById(surveyId);
  if (!survey) throw new Error("Survey not found");

  // 2. Check status
  if (survey.status !== "open") {
    throw new Error("This survey is no longer accepting responses.");
  }

  // 3. Check deadline
  if (survey.deadline && new Date(survey.deadline) < new Date()) {
    throw new Error("This survey is no longer accepting responses.");
  }

  // 4. Check duplicate for identified (non-anonymous) surveys
  if (!survey.anonymous && payload.player_nickname) {
    const existing = db.exec(
      "SELECT id FROM survey_responses WHERE survey_id = ? AND player_nickname = ?",
      [surveyId, payload.player_nickname],
    );
    if (existing.length > 0 && existing[0].values.length > 0) {
      throw new Error("You have already submitted a response to this survey.");
    }
  }

  // 5. Validate answers
  const questions = getQuestions(surveyId);
  const questionMap = new Map<number, QuestionParsed>();
  for (const q of questions) {
    questionMap.set(q.id, q);
  }

  if (payload.answers.length !== questions.length) {
    throw new Error("All questions must be answered.");
  }

  for (const answer of payload.answers) {
    const question = questionMap.get(answer.question_id);
    if (!question) {
      throw new Error(`Invalid question_id: ${answer.question_id}`);
    }

    switch (question.type) {
      case "star_rating": {
        const num = Number(answer.value);
        if (!Number.isInteger(num) || num < 1 || num > 5) {
          throw new Error(
            `star_rating value must be an integer between 1 and 5, got "${answer.value}"`,
          );
        }
        break;
      }
      case "single_choice":
      case "size_picker": {
        const options = question.options ?? [];
        if (!options.includes(answer.value)) {
          throw new Error(
            `"${answer.value}" is not a valid option for "${question.label}"`,
          );
        }
        break;
      }
      case "multiple_choice": {
        const options = question.options ?? [];
        const selected: string[] = JSON.parse(answer.value);
        for (const s of selected) {
          if (!options.includes(s)) {
            throw new Error(
              `"${s}" is not a valid option for "${question.label}"`,
            );
          }
        }
        break;
      }
      case "free_text":
        // Any value is OK
        break;
    }
  }

  // 6. INSERT response
  const nickname = survey.anonymous ? null : (payload.player_nickname ?? null);
  db.run(
    "INSERT INTO survey_responses (survey_id, player_nickname) VALUES (?, ?)",
    [surveyId, nickname],
  );
  const responseId = getLastInsertId();

  // 7. INSERT each answer
  for (const answer of payload.answers) {
    db.run(
      "INSERT INTO survey_answers (response_id, question_id, value) VALUES (?, ?, ?)",
      [responseId, answer.question_id, answer.value],
    );
  }

  // 8. Return the created response
  const result = db.exec("SELECT * FROM survey_responses WHERE id = ?", [responseId]);
  const rows = rowsToObjects(result);
  const row = rows[0];
  return {
    id: row.id as number,
    survey_id: row.survey_id as number,
    player_nickname: (row.player_nickname as string) ?? null,
    submitted_at: row.submitted_at as string,
  };
}
