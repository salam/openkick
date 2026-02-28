# Surveys & Questionnaires Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a backend surveys module that lets coaches create questionnaires and parents respond via shareable links/QR codes.

**Architecture:** 4 new DB tables, a models file for TypeScript interfaces, a service layer for CRUD/validation/aggregation, admin routes (auth required) and public routes (no auth). Two built-in templates (Trikot order, end-of-semester feedback). QR code generation via `qrcode` npm package.

**Tech Stack:** Express, sql.js, vitest, qrcode (npm)

---

### Task 1: Install qrcode dependency

**Files:**
- Modify: `server/package.json`

**Step 1: Install the dependency**

Run: `cd server && npm install qrcode && npm install -D @types/qrcode`

**Step 2: Verify installation**

Run: `cd server && node -e "import('qrcode')"`
Expected: No error

**Step 3: Commit**

Commit `server/package.json` and `server/package-lock.json` with message: `chore: add qrcode dependency for surveys`

---

### Task 2: Add survey tables to database schema

**Files:**
- Modify: `server/src/database.ts:270` (end of SCHEMA constant, before the closing backtick)

**Step 1: Write failing test**

Create `server/src/services/__tests__/surveys.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDB } from "../../database.js";
import type { Database } from "sql.js";

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
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/__tests__/surveys.test.ts`
Expected: FAIL — tables don't exist yet

**Step 3: Add the 4 survey tables to SCHEMA in database.ts**

In `server/src/database.ts`, before the closing backtick of `SCHEMA` (line 271), insert:

```sql
CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  team_id INTEGER,
  anonymous INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  deadline TEXT,
  price_per_item REAL,
  created_by INTEGER REFERENCES guardians(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  options_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  player_nickname TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  value TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_response_player
  ON survey_responses(survey_id, player_nickname)
  WHERE player_nickname IS NOT NULL;
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/__tests__/surveys.test.ts`
Expected: PASS

**Step 5: Commit**

Commit `server/src/database.ts` and `server/src/services/__tests__/surveys.test.ts` with message: `feat(surveys): add database schema and schema tests`

---

### Task 3: Create TypeScript interfaces

**Files:**
- Create: `server/src/models/survey.model.ts`

**Step 1: Create the models file**

Create `server/src/models/survey.model.ts` with the following content (from the blueprint section 6):

```ts
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
```

**Step 2: Verify it compiles**

Run: `cd server && npx tsc --noEmit src/models/survey.model.ts`
Expected: No errors

**Step 3: Commit**

Commit `server/src/models/survey.model.ts` with message: `feat(surveys): add TypeScript interfaces`

---

### Task 4: Implement service layer — CRUD functions

**Files:**
- Create: `server/src/services/survey.service.ts`
- Modify: `server/src/services/__tests__/surveys.test.ts`

**Step 1: Write failing tests for CRUD**

Add to `server/src/services/__tests__/surveys.test.ts`:

```ts
import {
  createSurvey,
  getSurveyById,
  getQuestions,
  closeSurvey,
  listSurveys,
} from "../survey.service.js";

describe("survey service — CRUD", () => {
  beforeEach(async () => {
    db = await initDB();
  });

  afterEach(() => {
    db.close();
  });

  it("createSurvey creates survey and questions", () => {
    const survey = createSurvey(
      "Test Survey",
      null,
      false,
      null,
      null,
      1,
      [
        { type: "free_text", label: "Name?", sort_order: 0 },
        { type: "star_rating", label: "Rate us", sort_order: 1 },
      ]
    );
    expect(survey.id).toBeGreaterThan(0);
    expect(survey.title).toBe("Test Survey");
    expect(survey.anonymous).toBe(false);

    const questions = getQuestions(survey.id);
    expect(questions).toHaveLength(2);
    expect(questions[0].type).toBe("free_text");
    expect(questions[1].type).toBe("star_rating");
  });

  it("getSurveyById returns null for non-existent ID", () => {
    expect(getSurveyById(9999)).toBeNull();
  });

  it("getSurveyById returns survey for valid ID", () => {
    const created = createSurvey("My Survey", null, true, null, null, 1, []);
    const found = getSurveyById(created.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe("My Survey");
  });

  it("closeSurvey sets status to closed", () => {
    const survey = createSurvey("S", null, true, null, null, 1, []);
    closeSurvey(survey.id);
    const updated = getSurveyById(survey.id);
    expect(updated!.status).toBe("closed");
  });

  it("listSurveys returns all surveys", () => {
    createSurvey("A", null, true, null, null, 1, []);
    createSurvey("B", null, true, null, null, 1, []);
    expect(listSurveys()).toHaveLength(2);
  });

  it("listSurveys filters by teamId", () => {
    createSurvey("A", 1, true, null, null, 1, []);
    createSurvey("B", 2, true, null, null, 1, []);
    expect(listSurveys(1)).toHaveLength(1);
    expect(listSurveys(1)[0].title).toBe("A");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/surveys.test.ts`
Expected: FAIL — service doesn't exist

**Step 3: Implement CRUD in survey.service.ts**

Create `server/src/services/survey.service.ts`. Key functions:

- `rowsToObjects()` — same helper as in other files
- `rowToSurvey()` — converts a raw DB row to a `Survey` object, mapping `anonymous` INTEGER to boolean
- `createSurvey()` — INSERT survey + INSERT each question in a loop. Uses `getLastInsertId()` after each insert.
- `getSurveyById()` — SELECT by id, return null if not found
- `getQuestions()` — SELECT by survey_id ORDER BY sort_order, parse `options_json` to `options` array
- `closeSurvey()` — UPDATE status = 'closed'
- `archiveSurvey()` — UPDATE status = 'archived'
- `listSurveys()` — SELECT all or filtered by team_id

Import from: `../database.js` (getDB, getLastInsertId) and `../models/survey.model.js` (types).

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/surveys.test.ts`
Expected: PASS

**Step 5: Commit**

Commit `server/src/services/survey.service.ts` and `server/src/services/__tests__/surveys.test.ts` with message: `feat(surveys): implement CRUD service with tests`

---

### Task 5: Implement service layer — response submission with validation

**Files:**
- Modify: `server/src/services/survey.service.ts`
- Modify: `server/src/services/__tests__/surveys.test.ts`

**Step 1: Write failing tests for submission**

Add test cases covering:
1. Happy path — identified survey submission
2. Rejects duplicate submission for identified survey (throws /already submitted/)
3. Allows duplicate for anonymous survey
4. Rejects when survey is closed (throws /no longer accepting/)
5. Rejects when deadline has passed (use "2020-01-01T00:00:00Z")
6. Rejects invalid question_id (throws /invalid question_id/)
7. Rejects star_rating outside 1-5 (throws /star_rating/)
8. Rejects single_choice value not in options (throws /not a valid option/)

Helper function `createTestSurvey(anonymous = false)` creates a survey with 3 questions: star_rating, single_choice (options: A, B), free_text.

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/__tests__/surveys.test.ts`
Expected: FAIL — submitResponse not implemented

**Step 3: Implement submitResponse**

The function:
1. Checks survey exists and status is 'open'
2. Checks deadline hasn't passed
3. For identified surveys, checks unique constraint (SELECT existing)
4. Validates each answer: question must belong to survey, value must match type rules
5. INSERT INTO survey_responses, then INSERT each answer into survey_answers
6. Returns the created SurveyResponse

Validation rules per type:
- `star_rating`: integer 1-5
- `single_choice` / `size_picker`: value must be in options array
- `multiple_choice`: JSON.parse value, each element must be in options
- `free_text`: any value allowed

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/__tests__/surveys.test.ts`
Expected: PASS

**Step 5: Commit**

Commit both files with message: `feat(surveys): implement response submission with validation`

---

### Task 6: Implement service layer — result aggregation

**Files:**
- Modify: `server/src/services/survey.service.ts`
- Modify: `server/src/services/__tests__/surveys.test.ts`

**Step 1: Write failing tests for aggregation**

Test cases:
1. Correct average for star ratings (submit 4 and 2, expect 3.0)
2. Correct distribution for size_picker (2x M, 1x L => {S: 0, M: 2, L: 1})
3. Collects free_text responses into array

**Step 2: Run tests to verify they fail**

**Step 3: Implement getAggregatedResults**

For each question, fetch all answers and aggregate:
- `star_rating` → average, rounded to 1 decimal
- `single_choice` / `size_picker` → distribution map (option → count), init all options to 0
- `multiple_choice` → distribution map, JSON.parse each value and increment per selected option
- `free_text` → collect all values into array

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

Commit both files with message: `feat(surveys): implement result aggregation`

---

### Task 7: Implement service layer — templates

**Files:**
- Modify: `server/src/services/survey.service.ts`
- Modify: `server/src/services/__tests__/surveys.test.ts`

**Step 1: Write failing tests**

Test cases:
1. `createTrikotOrderTemplate` → creates identified survey with 4 questions (free_text, size_picker, single_choice, free_text)
2. `createFeedbackTemplate` → creates anonymous survey with 5 questions (3x star_rating, 2x free_text)

**Step 2: Run tests to verify they fail**

**Step 3: Implement template factories**

`createTrikotOrderTemplate(teamId, createdBy)` — calls createSurvey with:
- title: "Trikot & Cap Order"
- anonymous: false
- Questions: player name (free_text), trikot size (size_picker with standard sizes), cap size (single_choice: Adjustable/S-M/L-XL), back print (free_text)

`createFeedbackTemplate(teamId, createdBy)` — calls createSurvey with:
- title: "End-of-Semester Feedback"
- anonymous: true
- Questions: overall satisfaction, training quality, communication (all star_rating), what to improve, what enjoyed most (both free_text)

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

Commit both files with message: `feat(surveys): implement Trikot order and feedback templates`

---

### Task 8: Implement admin routes

**Files:**
- Create: `server/src/routes/surveys.routes.ts`
- Create: `server/src/routes/__tests__/surveys.test.ts`

**Step 1: Write failing route tests**

Test setup pattern (match existing `security-audit.test.ts`):
- `createTestApp()`: initDB, insert admin guardian, create express app, mount `surveysRouter` at `/api`, start server
- `teardown()`: close server and db
- Generate admin JWT with `generateJWT({ id: 1, role: "admin" })`

Test cases:
1. `POST /api/surveys` — returns 201 with survey object (requires auth)
2. `GET /api/surveys/:id/results` — returns aggregated data
3. `PUT /api/surveys/:id/close` — returns 200, status is "closed"
4. `POST /api/surveys` — returns 401 without auth

**Step 2: Run tests to verify they fail**

**Step 3: Implement admin routes**

Create `server/src/routes/surveys.routes.ts` with `export const surveysRouter = Router()`.

Routes (all use `authMiddleware` per-route):
- `POST /surveys` — create survey, return 201
- `GET /surveys` — list surveys, optional `?team_id=`
- `GET /surveys/:id` — get survey + questions
- `GET /surveys/:id/results` — aggregated results
- `PUT /surveys/:id/close` — close survey
- `PUT /surveys/:id/archive` — archive survey
- `POST /surveys/templates/trikot-order` — create from template
- `POST /surveys/templates/feedback` — create from template

Error handling: try/catch, return appropriate status codes (400/404).

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

Commit both files with message: `feat(surveys): implement admin routes with tests`

---

### Task 9: Implement public routes (no auth) + QR code endpoint

**Files:**
- Create: `server/src/routes/public/survey-respond.routes.ts` (create `routes/public/` directory first)
- Modify: `server/src/routes/__tests__/surveys.test.ts`

**Step 1: Write failing route tests for public endpoints**

Add a second describe block to the route tests, mounting both `surveysRouter` and `surveyRespondRouter`. Test cases:

1. `GET /api/public/surveys/:id` — returns survey + questions, no auth, omits `created_by`
2. `POST /api/public/surveys/:id/respond` — returns 201 with `{ response_id, payment_required: false }`
3. `POST /api/public/surveys/:id/respond` — returns 409 on duplicate (identified survey)
4. `GET /api/public/surveys/:id/qr` — returns `image/png` content type

**Step 2: Run tests to verify they fail**

**Step 3: Create public routes**

Create directory: `server/src/routes/public/`

Create `server/src/routes/public/survey-respond.routes.ts` with `export const surveyRespondRouter = Router()`.

Routes (NO auth):
- `GET /surveys/:id` — returns survey metadata + questions, 410 if closed/past deadline, omit `created_by`
- `POST /surveys/:id/respond` — calls submitResponse, returns 201/400/409/410. Includes payment stub (payment_required: true/false, payment_url: null when price_per_item is set)
- `GET /surveys/:id/qr` — generate QR code PNG with `QRCode.toBuffer()`, return as `image/png`

Import `QRCode from "qrcode"` for QR generation.

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

Commit both files with message: `feat(surveys): implement public routes with QR code generation`

---

### Task 10: Register routes in index.ts

**Files:**
- Modify: `server/src/index.ts`

**Step 1: Add imports and mount routers**

In `server/src/index.ts`, add imports:
```ts
import { surveysRouter } from "./routes/surveys.routes.js";
import { surveyRespondRouter } from "./routes/public/survey-respond.routes.js";
```

Mount after existing routes (around line 79):
```ts
app.use("/api", surveysRouter);
app.use("/api/public", surveyRespondRouter);
```

**Step 2: Verify the server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

Commit `server/src/index.ts` with message: `feat(surveys): register survey routes in index.ts`

---

### Task 11: Run full test suite and fix any issues

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 2: Verify build**

Run: `cd server && npm run build`
Expected: Build completes successfully

**Step 3: Fix any issues found (if needed)**

---

### Task 12: Update RELEASE_NOTES.md

**Files:**
- Modify: `RELEASE_NOTES.md`

**Step 1: Add release notes**

```markdown
## Release X.X (Sat, Mar 1 14:00)

* Surveys & Questionnaires: coaches can create surveys with 5 question types (single choice, multi choice, star rating, free text, size picker)
* Anonymous and identified survey modes for privacy control
* Built-in templates: Trikot & Cap order, end-of-semester feedback
* Shareable survey links with QR code generation
* Survey deadline enforcement and duplicate submission prevention
* Results dashboard with aggregation (averages, distributions, text lists)
* Close and archive survey lifecycle
```

**Step 2: Commit**

Commit `RELEASE_NOTES.md` with message: `docs: add surveys feature to release notes`

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Install qrcode | package.json |
| 2 | Database schema | database.ts |
| 3 | TypeScript interfaces | models/survey.model.ts |
| 4 | Service: CRUD | survey.service.ts |
| 5 | Service: submission + validation | survey.service.ts |
| 6 | Service: aggregation | survey.service.ts |
| 7 | Service: templates | survey.service.ts |
| 8 | Admin routes | surveys.routes.ts |
| 9 | Public routes + QR | public/survey-respond.routes.ts |
| 10 | Register routes | index.ts |
| 11 | Full test suite | — |
| 12 | Release notes | RELEASE_NOTES.md |
