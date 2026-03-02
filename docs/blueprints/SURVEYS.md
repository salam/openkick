# Surveys & Questionnaires — Implementation Blueprint

> Target audience: LLM implementing this module.
> PRD reference: section **4.5.11 Surveys & Questionnaires**.

---

## 1. Module Overview

The surveys module lets coaches create lightweight questionnaires to collect feedback (star ratings), orders (Trikot sizes) and general preferences from parents. Two ready-made templates ship out of the box. Every survey gets a unique URL that can be shared via WhatsApp, Signal, email or printed as a QR code. Surveys run in one of two modes: **anonymous** (no identifiers stored) or **identified** (stores the player nickname only — no PII).

Key capabilities:

- Five question types (single choice, multiple choice, star rating, free text, size picker).
- Shareable URL and QR code image endpoint.
- Result aggregation dashboard for coaches (averages, distributions, text lists).
- Optional payment redirect for order-type surveys (delegates to `payment.service`).
- Deadline enforcement, duplicate-submission prevention, close/archive lifecycle.

---

## 2. Dependencies

| Dependency | Purpose | Install |
|---|---|---|
| `qrcode` | Generate QR code PNG buffers from survey URLs | `npm install qrcode && npm install -D @types/qrcode` |

No other external packages are required. The module uses the existing `sql.js` database, Express router, and auth middleware already present in the codebase.

---

## 3. File Structure

All new files live under `server/src/`. Follow the existing project conventions (named exports, `.js` extension in imports, `rowsToObjects` helper pattern from `services/attendance.ts`).

```
server/src/
  models/
    survey.model.ts          -- TypeScript interfaces (Survey, Question, Response, etc.)
  services/
    survey.service.ts         -- CRUD, template factory, result aggregation
  routes/
    surveys.routes.ts         -- Admin endpoints (auth required)
    public/
      survey-respond.routes.ts  -- Public endpoints (no auth)
  __tests__/
    surveys.test.ts           -- Unit + integration tests
```

> **Note:** The `routes/public/` directory is new. Public routes must NOT use `authMiddleware`. Register them on a separate prefix (`/api/public`) in `index.ts`.

### Registration in `index.ts`

```ts
import { surveysRouter } from "./routes/surveys.routes.js";
import { surveyRespondRouter } from "./routes/public/survey-respond.routes.js";

// Admin routes (behind authMiddleware)
app.use("/api/admin", authMiddleware, surveysRouter);

// Public routes (no auth)
app.use("/api/public", surveyRespondRouter);
```

---

## 4. Database Schema

Add the following tables to the `SCHEMA` constant in `server/src/database.ts`. Place them after the existing `broadcasts` table.

```sql
CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  team_id INTEGER,
  anonymous INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',        -- 'open' | 'closed' | 'archived'
  deadline TEXT,                               -- ISO 8601 datetime, nullable
  price_per_item REAL,                         -- nullable; when set, triggers payment flow
  created_by INTEGER REFERENCES guardians(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                          -- see Question Types below
  label TEXT NOT NULL,
  options_json TEXT,                           -- JSON array for choice/size types, NULL for free_text/star_rating
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  player_nickname TEXT,                        -- NULL for anonymous surveys
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  value TEXT NOT NULL                          -- stored as text; interpret per question type
);
```

### Unique constraint for duplicate prevention

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_response_player
  ON survey_responses(survey_id, player_nickname)
  WHERE player_nickname IS NOT NULL;
```

This prevents the same identified player from submitting twice. Anonymous surveys (where `player_nickname` is NULL) are exempt because NULL values are always distinct in SQLite unique indexes.

---

## 5. Question Types

| `type` value | UI widget | `options_json` | `value` stored in `survey_answers` |
|---|---|---|---|
| `single_choice` | Radio buttons | `["Option A", "Option B", ...]` | The selected option string |
| `multiple_choice` | Checkboxes | `["Option A", "Option B", ...]` | JSON array of selected option strings |
| `star_rating` | 1-5 stars | `null` | Integer string `"1"` through `"5"` |
| `free_text` | Textarea | `null` | The entered text |
| `size_picker` | Dropdown | `["116","128","140","152","164","XS","S","M","L","XL","XXL"]` | The selected size string |

---

## 6. TypeScript Interfaces

Place in `server/src/models/survey.model.ts`:

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
  anonymous: boolean;           // stored as INTEGER 0/1 in SQLite
  status: SurveyStatus;
  deadline: string | null;      // ISO 8601
  price_per_item: number | null;
  created_by: number | null;
  created_at: string;
}

export interface Question {
  id: number;
  survey_id: number;
  type: QuestionType;
  label: string;
  options_json: string | null;  // raw JSON string from DB
  sort_order: number;
}

/** Parsed form of Question with options already deserialized. */
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

/** Payload sent by the public submission endpoint. */
export interface SubmitResponsePayload {
  player_nickname?: string;     // omitted or null for anonymous surveys
  answers: { question_id: number; value: string }[];
}

/** Aggregated results returned to the coach dashboard. */
export interface AggregatedResults {
  survey: Survey;
  total_responses: number;
  questions: AggregatedQuestion[];
}

export interface AggregatedQuestion {
  question: QuestionParsed;
  /** Only present for star_rating questions. */
  average_rating?: number;
  /** Only present for single_choice, multiple_choice, size_picker.
      Distribution map: option string -> count. */
  distribution?: Record<string, number>;
  /** Only present for free_text questions. List of all submitted text values. */
  text_responses?: string[];
}
```

---

## 7. Service Layer — `survey.service.ts`

File: `server/src/services/survey.service.ts`

Import `getDB` from `../database.js`. Reuse the `rowsToObjects` helper pattern from `services/attendance.ts` (copy the helper into this file or extract to a shared util).

### 7.1 CRUD Functions

```ts
/** Create a survey and its questions in a single transaction. */
export function createSurvey(
  title: string,
  team_id: number | null,
  anonymous: boolean,
  deadline: string | null,
  price_per_item: number | null,
  created_by: number,
  questions: {
    type: QuestionType;
    label: string;
    options?: string[];
    sort_order: number;
  }[]
): Survey

/** Get a survey by ID (returns null if not found). */
export function getSurveyById(id: number): Survey | null

/** Get all questions for a survey, ordered by sort_order. */
export function getQuestions(surveyId: number): QuestionParsed[]

/** Update survey status to 'closed' or 'archived'. */
export function closeSurvey(id: number): void

/** List surveys, optionally filtered by team_id. */
export function listSurveys(teamId?: number): Survey[]
```

### 7.2 Response Submission

```ts
/**
 * Submit a response. Validates:
 * 1. Survey exists and status is 'open'.
 * 2. Deadline has not passed.
 * 3. No duplicate submission (for identified surveys).
 * 4. Each answer references a valid question belonging to this survey.
 *
 * Returns the created SurveyResponse (with id).
 * Throws an Error with a descriptive message on validation failure.
 */
export function submitResponse(
  surveyId: number,
  payload: SubmitResponsePayload
): SurveyResponse
```

### 7.3 Result Aggregation

```ts
/**
 * Build aggregated results for a survey.
 *
 * - star_rating  -> compute average (rounded to 1 decimal).
 * - single_choice / multiple_choice / size_picker -> count occurrences
 *   per option. For multiple_choice, JSON-parse each value and
 *   increment each selected option.
 * - free_text -> collect all values into an array.
 */
export function getAggregatedResults(surveyId: number): AggregatedResults
```

### 7.4 Template Factory

```ts
/**
 * Create a Trikot & cap order survey with pre-defined questions:
 * 1. Player name (free_text, label: "Player name")
 * 2. Trikot size (size_picker, standard sizes)
 * 3. Cap size (single_choice, options: ["Adjustable", "S-M", "L-XL"])
 * 4. Name/number on back (free_text, label:
 *    "Name or number to print on back (optional)")
 *
 * The survey is identified (anonymous = false) so orders are attributable.
 */
export function createTrikotOrderTemplate(
  teamId: number,
  createdBy: number
): Survey

/**
 * Create an end-of-semester feedback survey with pre-defined questions:
 * 1. Overall satisfaction (star_rating)
 * 2. Training quality (star_rating)
 * 3. Communication (star_rating)
 * 4. "What should we improve?" (free_text)
 * 5. "What did you enjoy most?" (free_text)
 *
 * The survey is anonymous by default.
 */
export function createFeedbackTemplate(
  teamId: number,
  createdBy: number
): Survey
```

Both functions internally call `createSurvey` with the appropriate pre-configured question arrays.

---

## 8. API Endpoints

### 8.1 Admin Routes — `routes/surveys.routes.ts`

Mounted at `/api/admin`. All routes require `authMiddleware` (JWT) applied at the router level.

| Method | Path | Handler | Description |
|---|---|---|---|
| `POST` | `/surveys` | `createSurveyHandler` | Create a new survey with questions. Body: `{ title, team_id?, anonymous, deadline?, price_per_item?, questions: [...] }` |
| `GET` | `/surveys` | `listSurveysHandler` | List all surveys. Optional query param `?team_id=`. |
| `GET` | `/surveys/:id` | `getSurveyHandler` | Get a single survey with its questions. |
| `GET` | `/surveys/:id/results` | `getResultsHandler` | Return `AggregatedResults`. |
| `PUT` | `/surveys/:id/close` | `closeSurveyHandler` | Set status to `closed`. |
| `PUT` | `/surveys/:id/archive` | `archiveSurveyHandler` | Set status to `archived`. |
| `POST` | `/surveys/templates/trikot-order` | `createTrikotTemplateHandler` | Body: `{ team_id }`. Creates from template. |
| `POST` | `/surveys/templates/feedback` | `createFeedbackTemplateHandler` | Body: `{ team_id }`. Creates from template. |

**Response codes:**
- 201 on successful creation.
- 200 on reads and updates.
- 404 if survey not found.
- 400 on validation errors.

### 8.2 Public Routes — `routes/public/survey-respond.routes.ts`

Mounted at `/api/public`. No authentication.

| Method | Path | Handler | Description |
|---|---|---|---|
| `GET` | `/surveys/:id` | `getPublicSurveyHandler` | Returns survey metadata + parsed questions. Omits internal fields (created_by). Returns 410 if closed/archived. |
| `POST` | `/surveys/:id/respond` | `submitResponseHandler` | Body: `SubmitResponsePayload`. Returns 201 on success, 400 on validation error, 409 on duplicate, 410 if closed/past deadline. |
| `GET` | `/surveys/:id/qr` | `getQrCodeHandler` | Returns a PNG image (`Content-Type: image/png`) of a QR code encoding the public survey URL. |

#### QR Code Generation

```ts
import QRCode from "qrcode";

async function getQrCodeHandler(req: Request, res: Response) {
  const surveyId = Number(req.params.id);
  const survey = getSurveyById(surveyId);
  if (!survey) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  const baseUrl =
    process.env.PUBLIC_URL ||
    req.protocol + "://" + req.get("host");
  const surveyUrl = baseUrl + "/surveys/" + surveyId;

  const pngBuffer = await QRCode.toBuffer(surveyUrl, {
    width: 400,
    margin: 2,
  });
  res.set("Content-Type", "image/png");
  res.send(pngBuffer);
}
```

---

## 9. Payment Integration

When a survey has a non-null `price_per_item`, the public submission endpoint triggers a payment flow after persisting the response.

### Flow

1. Parent submits survey response via `POST /api/public/surveys/:id/respond`.
2. Service layer saves the response and answers.
3. If `survey.price_per_item` is set, compute the order total. For Trikot orders the total is `price_per_item * 1` (one item per response). For surveys where multiple items can be ordered, extend the calculation.
4. Call `payment.service.createCheckoutSession(...)` with amount, currency (`"CHF"`), purpose (`"survey_order"`), and `reference_id` set to the response id.
5. Return a JSON response including `{ response_id, payment_url }` so the client can redirect the parent to the hosted checkout page (Stripe Checkout / Datatrans Lightbox).
6. The payment webhook (handled by the existing payment module) marks the response/order as paid.

### Response shape when payment is required

```json
{
  "response_id": 42,
  "payment_required": true,
  "payment_url": "https://checkout.stripe.com/..."
}
```

When no payment is required:

```json
{
  "response_id": 42,
  "payment_required": false
}
```

> **Important:** The payment service does not exist yet. Define the interface your code will call and leave a clear `// TODO: integrate with payment.service once implemented` comment. The calling code should check whether the payment module is available (feature flag or settings check) and skip payment if it is disabled.

---

## 10. Privacy

| Mode | `anonymous` column | `player_nickname` in responses | Tracking |
|---|---|---|---|
| Anonymous | `1` | Always `NULL` | Cannot detect duplicates; cannot send reminders |
| Identified | `0` | Stores the nickname string the parent enters | Duplicates prevented via unique index; reminders possible |

**Rules:**
- Never store real names, phone numbers or emails in the survey tables.
- `player_nickname` is the only identifier and is provided voluntarily by the respondent.
- The admin results endpoint returns nicknames for identified surveys and omits them for anonymous ones.
- When a survey is archived, responses remain in the database. Implement a future `purgeSurvey(id)` function (out of scope for now) that deletes all associated data.

---

## 11. Edge Cases & Validation

| Scenario | Behaviour |
|---|---|
| **Duplicate submission** (identified) | `submitResponse` checks the unique index. If a row with the same `(survey_id, player_nickname)` exists, return HTTP 409 with `{ error: "You have already submitted a response to this survey." }`. |
| **Duplicate submission** (anonymous) | Allowed. Anonymous surveys accept unlimited responses. |
| **Deadline passed** | Before inserting, compare `survey.deadline` with `datetime('now')`. If past, return HTTP 410 `{ error: "This survey is no longer accepting responses." }`. |
| **Survey closed or archived** | Same 410 response as deadline passed. |
| **Survey not found** | Return HTTP 404 `{ error: "Survey not found" }`. |
| **Missing required answers** | If any question in the survey has no corresponding entry in `payload.answers`, return HTTP 400 `{ error: "All questions must be answered." }`. (Future: add an `optional` flag to questions.) |
| **Invalid question_id** | If an answer references a `question_id` that does not belong to this survey, return HTTP 400 `{ error: "Invalid question_id: <id>" }`. |
| **Invalid star_rating value** | Must be an integer string between `"1"` and `"5"`. Return HTTP 400 otherwise. |
| **Invalid single_choice value** | Must match one of the options in `options_json`. Return HTTP 400 otherwise. |
| **Invalid size_picker value** | Must match one of the options in `options_json`. Return HTTP 400 otherwise. |
| **Empty free_text** | Allowed (store empty string). |
| **multiple_choice validation** | The value must be a valid JSON array where every element is present in `options_json`. Return HTTP 400 otherwise. |

---

## 12. Testing Strategy

File: `server/src/__tests__/surveys.test.ts`

Use the same test setup pattern as the existing test files (import `initDB`, create an in-memory database).

### Test cases to cover

**Service layer:**
1. `createSurvey` — creates survey and questions; verify row counts.
2. `getSurveyById` — returns null for non-existent ID.
3. `submitResponse` — happy path for identified survey.
4. `submitResponse` — rejects duplicate submission (identified).
5. `submitResponse` — allows duplicate submission (anonymous).
6. `submitResponse` — rejects when deadline has passed.
7. `submitResponse` — rejects when survey is closed.
8. `submitResponse` — rejects invalid question_id.
9. `submitResponse` — validates star_rating range.
10. `submitResponse` — validates single_choice against options.
11. `closeSurvey` — sets status to `closed`.
12. `getAggregatedResults` — correct average for star ratings.
13. `getAggregatedResults` — correct distribution for size_picker.
14. `getAggregatedResults` — collects free_text responses.
15. `createTrikotOrderTemplate` — creates survey with 4 questions of correct types.
16. `createFeedbackTemplate` — creates survey with 5 questions, anonymous by default.

**Route layer:**
17. `POST /api/admin/surveys` — returns 201 with survey object.
18. `GET /api/public/surveys/:id` — returns survey and questions, no auth.
19. `POST /api/public/surveys/:id/respond` — returns 201.
20. `POST /api/public/surveys/:id/respond` — returns 409 on duplicate.
21. `GET /api/public/surveys/:id/qr` — returns `image/png` content type.
22. `GET /api/admin/surveys/:id/results` — returns aggregated data.
23. `PUT /api/admin/surveys/:id/close` — returns 200, survey status is `closed`.

---

## 13. Implementation Order

Follow this sequence to keep each step independently testable:

1. **Schema** — Add the four tables and the unique index to `database.ts`.
2. **Models** — Create `models/survey.model.ts` with all interfaces.
3. **Service: CRUD** — Implement `createSurvey`, `getSurveyById`, `getQuestions`, `closeSurvey`, `listSurveys`.
4. **Service: submission** — Implement `submitResponse` with all validation.
5. **Service: aggregation** — Implement `getAggregatedResults`.
6. **Service: templates** — Implement `createTrikotOrderTemplate` and `createFeedbackTemplate`.
7. **Routes: admin** — Wire up `routes/surveys.routes.ts` with auth.
8. **Routes: public** — Wire up `routes/public/survey-respond.routes.ts` without auth.
9. **QR endpoint** — Install `qrcode`, implement the PNG generation handler.
10. **Register routes** — Update `index.ts` to mount admin and public routers.
11. **Tests** — Write and pass all test cases listed above.
12. **Payment hook** — Add the conditional payment redirect in `submitResponse` (stub the payment service call with a TODO).

---

## 14. Conventions to Follow

These are patterns already established in the codebase. Match them exactly:

- **Imports** use `.js` extension: `import { getDB } from "../database.js";`
- **Router creation**: `export const surveysRouter = Router();`
- **DB queries**: Use `db.exec(sql, params)` for reads and `db.run(sql, params)` for writes. Use the `rowsToObjects` helper to convert result sets.
- **Error responses**: `res.status(4xx).json({ error: "message" })` — always an `error` field.
- **No ORM**: Raw SQL only (sql.js).
- **Auth**: Admin routes use `authMiddleware` from `../auth.js`. Public routes use no middleware.
- **Timestamps**: Stored as ISO 8601 text via `datetime('now')`.
- **Boolean columns**: Stored as INTEGER `0`/`1` in SQLite. Convert to `boolean` in TypeScript when returning to the client.
