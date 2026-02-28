import { getDB, getLastInsertId } from "../database.js";
import type {
  Survey,
  SurveyStatus,
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
