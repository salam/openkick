export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "star_rating"
  | "free_text"
  | "size_picker";

export type SurveyStatus = "open" | "closed" | "archived";

export interface Survey {
  id: number;
  title: string;
  team_id: number | null;
  anonymous: boolean;
  status: SurveyStatus;
  deadline: string | null;
  price_per_item: number | null;
  created_by: number | null;
  created_at: string;
}

export interface Question {
  id: number;
  survey_id: number;
  type: QuestionType;
  label: string;
  options_json: string | null;
  sort_order: number;
}

export interface QuestionParsed extends Omit<Question, "options_json"> {
  options: string[] | null;
}

export interface SurveyResponse {
  id: number;
  survey_id: number;
  player_nickname: string | null;
  submitted_at: string;
}

export interface Answer {
  id: number;
  response_id: number;
  question_id: number;
  value: string;
}

export interface SubmitResponsePayload {
  player_nickname?: string;
  answers: { question_id: number; value: string }[];
}

export interface AggregatedResults {
  survey: Survey;
  total_responses: number;
  questions: AggregatedQuestion[];
}

export interface AggregatedQuestion {
  question: QuestionParsed;
  average_rating?: number;
  distribution?: Record<string, number>;
  text_responses?: string[];
}
