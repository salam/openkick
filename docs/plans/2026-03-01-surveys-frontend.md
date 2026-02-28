# Surveys Frontend UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 4 frontend pages for surveys: list, builder, detail+results (coach side), and public response form (parent side).

**Architecture:** Next.js 15 app router pages with Tailwind CSS. Auth pages use `apiFetch` + `AuthGuard` layout. Public page uses raw `fetch`, no navbar. i18n via `t()` function with de/en/fr keys.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, TypeScript

**Key patterns to match:**
- Layout: `web/src/app/events/layout.tsx` (AuthGuard + Navbar wrapper)
- List page: `web/src/app/players/page.tsx` (useState, useEffect, apiFetch, grid)
- Public page: `web/src/app/tournaments/[id]/page.tsx` + `PublicTournamentClient.tsx`
- API: `web/src/lib/api.ts` — `apiFetch<T>(path, options)` with JWT
- i18n: `web/src/lib/i18n.ts` — `t('key')`, keys in de/en/fr blocks
- Navbar: `web/src/components/Navbar.tsx` — `navLinks` array

---

### Task 1: Add i18n keys for surveys

**Files:**
- Modify: `web/src/lib/i18n.ts`

**Step 1: Add German keys**

In the `de:` block (around line 2-626), add a new section before the closing brace:

```ts
// ── Surveys ────────────────────────────────────────────────────────
surveys: 'Umfragen',
survey: 'Umfrage',
new_survey: 'Neue Umfrage',
survey_title: 'Titel',
survey_anonymous: 'Anonym',
survey_identified: 'Mit Name',
survey_mode: 'Modus',
survey_deadline: 'Frist',
survey_status_open: 'Offen',
survey_status_closed: 'Geschlossen',
survey_status_archived: 'Archiviert',
survey_responses: 'Antworten',
survey_no_responses: 'Noch keine Antworten.',
survey_close: 'Umfrage schliessen',
survey_archive: 'Archivieren',
survey_share: 'Teilen',
survey_copy_link: 'Link kopieren',
survey_link_copied: 'Link kopiert!',
survey_qr_code: 'QR-Code',
survey_create: 'Umfrage erstellen',
survey_template: 'Vorlage',
survey_template_trikot: 'Trikot-Bestellung',
survey_template_feedback: 'Semesterfeedback',
survey_from_scratch: 'Eigene Umfrage',
survey_add_question: 'Frage hinzufuegen',
survey_question_label: 'Frage',
survey_question_type: 'Typ',
survey_question_options: 'Optionen',
survey_option_add: 'Option hinzufuegen',
survey_type_single_choice: 'Einfachauswahl',
survey_type_multiple_choice: 'Mehrfachauswahl',
survey_type_star_rating: 'Sternebewertung',
survey_type_free_text: 'Freitext',
survey_type_size_picker: 'Groessenwahl',
survey_results: 'Ergebnisse',
survey_average: 'Durchschnitt',
survey_distribution: 'Verteilung',
survey_text_responses: 'Textantworten',
survey_total_responses: 'Antworten gesamt',
survey_empty: 'Noch keine Umfragen vorhanden.',
survey_empty_hint: 'Erstellen Sie eine Umfrage oder waehlen Sie eine Vorlage.',
survey_submit: 'Absenden',
survey_thank_you: 'Vielen Dank fuer Ihre Antwort!',
survey_already_submitted: 'Sie haben bereits an dieser Umfrage teilgenommen.',
survey_closed_message: 'Diese Umfrage nimmt keine Antworten mehr an.',
survey_not_found: 'Umfrage nicht gefunden.',
survey_nickname: 'Spielername / Spitzname',
survey_nickname_hint: 'Damit wir Ihre Antwort zuordnen koennen.',
survey_move_up: 'Nach oben',
survey_move_down: 'Nach unten',
survey_remove_question: 'Frage entfernen',
```

**Step 2: Add English keys**

In the `en:` block (around line 627-1206), add:

```ts
// ── Surveys ────────────────────────────────────────────────────────
surveys: 'Surveys',
survey: 'Survey',
new_survey: 'New Survey',
survey_title: 'Title',
survey_anonymous: 'Anonymous',
survey_identified: 'Identified',
survey_mode: 'Mode',
survey_deadline: 'Deadline',
survey_status_open: 'Open',
survey_status_closed: 'Closed',
survey_status_archived: 'Archived',
survey_responses: 'Responses',
survey_no_responses: 'No responses yet.',
survey_close: 'Close Survey',
survey_archive: 'Archive',
survey_share: 'Share',
survey_copy_link: 'Copy Link',
survey_link_copied: 'Link copied!',
survey_qr_code: 'QR Code',
survey_create: 'Create Survey',
survey_template: 'Template',
survey_template_trikot: 'Trikot Order',
survey_template_feedback: 'Semester Feedback',
survey_from_scratch: 'Custom Survey',
survey_add_question: 'Add Question',
survey_question_label: 'Question',
survey_question_type: 'Type',
survey_question_options: 'Options',
survey_option_add: 'Add Option',
survey_type_single_choice: 'Single Choice',
survey_type_multiple_choice: 'Multiple Choice',
survey_type_star_rating: 'Star Rating',
survey_type_free_text: 'Free Text',
survey_type_size_picker: 'Size Picker',
survey_results: 'Results',
survey_average: 'Average',
survey_distribution: 'Distribution',
survey_text_responses: 'Text Responses',
survey_total_responses: 'Total Responses',
survey_empty: 'No surveys yet.',
survey_empty_hint: 'Create a survey or choose a template.',
survey_submit: 'Submit',
survey_thank_you: 'Thank you for your response!',
survey_already_submitted: 'You have already submitted a response.',
survey_closed_message: 'This survey is no longer accepting responses.',
survey_not_found: 'Survey not found.',
survey_nickname: 'Player name / nickname',
survey_nickname_hint: 'So we can link your response.',
survey_move_up: 'Move up',
survey_move_down: 'Move down',
survey_remove_question: 'Remove question',
```

**Step 3: Add French keys**

In the `fr:` block (around line 1207+), add:

```ts
// ── Surveys ────────────────────────────────────────────────────────
surveys: 'Sondages',
survey: 'Sondage',
new_survey: 'Nouveau sondage',
survey_title: 'Titre',
survey_anonymous: 'Anonyme',
survey_identified: 'Identifie',
survey_mode: 'Mode',
survey_deadline: 'Date limite',
survey_status_open: 'Ouvert',
survey_status_closed: 'Ferme',
survey_status_archived: 'Archive',
survey_responses: 'Reponses',
survey_no_responses: 'Pas encore de reponses.',
survey_close: 'Fermer le sondage',
survey_archive: 'Archiver',
survey_share: 'Partager',
survey_copy_link: 'Copier le lien',
survey_link_copied: 'Lien copie!',
survey_qr_code: 'Code QR',
survey_create: 'Creer un sondage',
survey_template: 'Modele',
survey_template_trikot: 'Commande de maillot',
survey_template_feedback: 'Feedback semestriel',
survey_from_scratch: 'Sondage personnalise',
survey_add_question: 'Ajouter une question',
survey_question_label: 'Question',
survey_question_type: 'Type',
survey_question_options: 'Options',
survey_option_add: 'Ajouter une option',
survey_type_single_choice: 'Choix unique',
survey_type_multiple_choice: 'Choix multiple',
survey_type_star_rating: 'Notation etoiles',
survey_type_free_text: 'Texte libre',
survey_type_size_picker: 'Taille',
survey_results: 'Resultats',
survey_average: 'Moyenne',
survey_distribution: 'Distribution',
survey_text_responses: 'Reponses texte',
survey_total_responses: 'Reponses totales',
survey_empty: 'Pas encore de sondages.',
survey_empty_hint: 'Creez un sondage ou choisissez un modele.',
survey_submit: 'Envoyer',
survey_thank_you: 'Merci pour votre reponse!',
survey_already_submitted: 'Vous avez deja repondu.',
survey_closed_message: 'Ce sondage ne accepte plus de reponses.',
survey_not_found: 'Sondage introuvable.',
survey_nickname: 'Nom du joueur / surnom',
survey_nickname_hint: 'Pour pouvoir associer votre reponse.',
survey_move_up: 'Monter',
survey_move_down: 'Descendre',
survey_remove_question: 'Supprimer la question',
```

**Step 4: Verify the app compiles**

Run: `cd web && npx next build 2>&1 | head -20` (or `npx tsc --noEmit`)
Expected: No errors related to i18n

**Step 5: Commit**

Commit `web/src/lib/i18n.ts` with message: `feat(surveys): add i18n keys for surveys UI (de/en/fr)`

---

### Task 2: Add Surveys to navbar + create layout

**Files:**
- Modify: `web/src/components/Navbar.tsx:9-15`
- Create: `web/src/app/surveys/layout.tsx`

**Step 1: Add nav link**

In `web/src/components/Navbar.tsx`, add to the `navLinks` array (line 9-15), after calendar and before settings:

```ts
const navLinks = [
  { href: '/dashboard/', label: 'dashboard' },
  { href: '/events/', label: 'events' },
  { href: '/players/', label: 'players' },
  { href: '/calendar/', label: 'calendar' },
  { href: '/surveys/', label: 'surveys' },
  { href: '/settings/', label: 'settings' },
];
```

**Step 2: Create layout**

Create `web/src/app/surveys/layout.tsx` — identical pattern to `web/src/app/events/layout.tsx`:

```tsx
'use client';

import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';

export default function SurveysLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
```

**Step 3: Verify compilation**

Run: `cd web && npx tsc --noEmit`

**Step 4: Commit**

Commit both files with message: `feat(surveys): add Surveys nav link and layout`

---

### Task 3: Surveys list page

**Files:**
- Create: `web/src/app/surveys/page.tsx`

**Step 1: Create the list page**

Create `web/src/app/surveys/page.tsx`. This is a `'use client'` component that:

1. Fetches surveys from `GET /api/surveys` via `apiFetch`
2. Provides filter chips (All, Open, Closed, Archived)
3. Shows a grid of survey cards
4. Has a "New Survey" button and template shortcuts
5. Has loading spinner and empty state

Key interfaces:

```ts
interface Survey {
  id: number;
  title: string;
  anonymous: boolean;
  status: 'open' | 'closed' | 'archived';
  deadline: string | null;
  created_at: string;
}
```

Page structure:
- Header row: `<h1>` + buttons (New Survey, Trikot Template, Feedback Template)
- Filter row: All / Open / Closed / Archived chips
- Grid: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`
- Each card: title, status badge (emerald/gray/gray-300), response count (fetched lazily or from list), anonymous indicator, deadline
- Card links to `/surveys/${id}/`
- Template buttons call `POST /api/surveys/templates/trikot-order` or `POST /api/surveys/templates/feedback` then redirect to the created survey's detail page

Status badge colors:
- open: `bg-emerald-100 text-emerald-700`
- closed: `bg-gray-100 text-gray-600`
- archived: `bg-gray-50 text-gray-400`

Empty state: dashed border box with survey icon, "No surveys yet" text, hint text, and "Create Survey" button.

**Step 2: Verify**

Run: `cd web && npx tsc --noEmit`

**Step 3: Commit**

Commit with message: `feat(surveys): add surveys list page`

---

### Task 4: Survey builder page

**Files:**
- Create: `web/src/app/surveys/new/page.tsx`

**Step 1: Create the builder page**

Create `web/src/app/surveys/new/page.tsx`. This is the most complex page. `'use client'` component.

Key state:

```ts
interface QuestionForm {
  type: 'single_choice' | 'multiple_choice' | 'star_rating' | 'free_text' | 'size_picker';
  label: string;
  options: string[];
}

const [title, setTitle] = useState('');
const [anonymous, setAnonymous] = useState(true);
const [deadline, setDeadline] = useState('');
const [questions, setQuestions] = useState<QuestionForm[]>([]);
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
```

Layout:
- Back link to /surveys/
- Title: "New Survey"
- Card 1: Survey Settings
  - Title input (required)
  - Anonymous toggle (two buttons: Anonymous / Identified)
  - Deadline input (datetime-local, optional)
- Card 2: Questions
  - List of question cards, each with:
    - Type selector: dropdown with 5 types (use `t('survey_type_...')` for labels)
    - Label input: text input for question text
    - Options editor: shown only for single_choice, multiple_choice, size_picker
      - List of option text inputs with delete buttons
      - "Add Option" button
      - For size_picker: auto-populate with `["116","128","140","152","164","XS","S","M","L","XL","XXL"]` when type changes
    - Move up/down buttons (arrows, not drag)
    - Remove button (red text)
  - "Add Question" button at bottom
- Footer: Cancel (back to /surveys/) + "Create Survey" button (primary)

On submit:
- Build payload: `{ title, anonymous, deadline: deadline || null, questions: questions.map((q, i) => ({ type: q.type, label: q.label, options: q.options.length > 0 ? q.options : undefined, sort_order: i })) }`
- `POST /api/surveys` via apiFetch
- On success: `router.push('/surveys/' + result.id + '/')`

The question type names map:
```ts
const QUESTION_TYPES = [
  { value: 'single_choice', label: 'survey_type_single_choice' },
  { value: 'multiple_choice', label: 'survey_type_multiple_choice' },
  { value: 'star_rating', label: 'survey_type_star_rating' },
  { value: 'free_text', label: 'survey_type_free_text' },
  { value: 'size_picker', label: 'survey_type_size_picker' },
];
```

**Step 2: Verify**

Run: `cd web && npx tsc --noEmit`

**Step 3: Commit**

Commit with message: `feat(surveys): add survey builder page`

---

### Task 5: Survey detail + results page

**Files:**
- Create: `web/src/app/surveys/[id]/page.tsx`

**Step 1: Create the detail/results page**

Create `web/src/app/surveys/[id]/page.tsx`. `'use client'` component.

Interfaces:

```ts
interface SurveyDetail {
  id: number;
  title: string;
  anonymous: boolean;
  status: 'open' | 'closed' | 'archived';
  deadline: string | null;
  price_per_item: number | null;
  created_at: string;
  questions: QuestionParsed[];
}

interface QuestionParsed {
  id: number;
  type: string;
  label: string;
  options: string[] | null;
  sort_order: number;
}

interface AggregatedResults {
  survey: SurveyDetail;
  total_responses: number;
  questions: AggregatedQuestion[];
}

interface AggregatedQuestion {
  question: QuestionParsed;
  average_rating?: number;
  distribution?: Record<string, number>;
  text_responses?: string[];
}
```

Fetches:
- `GET /api/surveys/${id}` for survey + questions
- `GET /api/surveys/${id}/results` for aggregated results

Layout sections:

**Header**: Title, status badge, action buttons (Close if open, Archive if closed)

**Share section** (card):
- Public link: `${window.location.origin}/surveys/respond/${id}/`
- Copy button (copies to clipboard, shows "Copied!" toast)
- QR code: `<img>` pointing to `${API_URL}/api/public/surveys/${id}/qr`

**Results section** (card):
- "Total Responses: N"
- Per question, render based on type:
  - `star_rating`: Show average as "★ 4.2 / 5" with a simple horizontal bar
  - `single_choice` / `multiple_choice` / `size_picker`: Table with option, count, and simple bar width
  - `free_text`: Scrollable list of quoted responses in gray boxes

Action handlers:
- Close: `PUT /api/surveys/${id}/close` then re-fetch
- Archive: `PUT /api/surveys/${id}/archive` then re-fetch

**Step 2: Verify**

Run: `cd web && npx tsc --noEmit`

**Step 3: Commit**

Commit with message: `feat(surveys): add survey detail and results page`

---

### Task 6: Public response form

**Files:**
- Create: `web/src/app/surveys/respond/[id]/page.tsx`

**Step 1: Create the SSG wrapper**

This is a public page — NO auth, NO navbar. Uses the same pattern as `web/src/app/tournaments/[id]/page.tsx`:

```tsx
// web/src/app/surveys/respond/[id]/page.tsx
import SurveyRespondClient from './SurveyRespondClient';

export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function SurveyRespondPage() {
  return <SurveyRespondClient />;
}
```

**Step 2: Create the client component**

Create `web/src/app/surveys/respond/[id]/SurveyRespondClient.tsx`:

`'use client'` component. Uses `useParams()` to get id. Fetches from `${API_URL}/api/public/surveys/${id}` (raw fetch, no auth).

States:
```ts
const [survey, setSurvey] = useState<PublicSurvey | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [answers, setAnswers] = useState<Record<number, string>>({});
const [nickname, setNickname] = useState('');
const [submitting, setSubmitting] = useState(false);
const [submitted, setSubmitted] = useState(false);
```

Layout:
- Centered container: `mx-auto max-w-2xl p-6`
- OpenKick logo at top (small)
- Survey title as h1
- If anonymous: no nickname field. If identified: nickname input with hint text
- Questions rendered by type:
  - `single_choice`: radio button group
  - `multiple_choice`: checkbox group (store as JSON array string)
  - `star_rating`: 5 clickable star icons (filled/empty)
  - `free_text`: textarea
  - `size_picker`: dropdown select
- Submit button at bottom
- After submit: green success card with "Thank you!" message
- Error states: 410 → "Survey closed" card, 409 → "Already submitted" card

On submit:
```ts
const payload = {
  player_nickname: survey.anonymous ? undefined : nickname,
  answers: Object.entries(answers).map(([qid, value]) => ({
    question_id: Number(qid),
    value,
  })),
};
const res = await fetch(`${API_URL}/api/public/surveys/${id}/respond`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

Styling: Clean, mobile-first design matching the public tournament page pattern. Uses emerald accent colors. No navbar, but a small "Powered by OpenKick" footer.

**Step 3: Verify**

Run: `cd web && npx tsc --noEmit`

**Step 4: Commit**

Commit both files with message: `feat(surveys): add public survey response form`

---

### Task 7: Verify full build + visual testing

**Step 1: Build the web app**

Run: `cd web && npm run build`
Expected: Build succeeds

**Step 2: Start dev servers and visually verify**

Run server: `cd server && npm run dev`
Run web: `cd web && npm run dev`

Verify:
1. Navbar shows "Surveys" link
2. `/surveys/` shows empty state
3. Create a survey via template button → redirects to detail
4. Detail page shows share link, QR code, empty results
5. Open public link in incognito → form renders
6. Submit response → thank you message
7. Back to detail page → results show the response

**Step 3: Commit any fixes**

---

### Task 8: Update release notes

**Files:**
- Modify: `RELEASE_NOTES.md`

**Step 1: Add frontend entries to existing Version 1.9 section**

Add to the Version 1.9 bullet list:

```
* Survey builder UI: create custom surveys with drag-to-reorder questions
* Survey list with status filtering (open/closed/archived)
* Results dashboard with star rating averages, distribution charts, and text response lists
* Public survey response form with mobile-friendly question rendering
* One-click template creation for Trikot orders and semester feedback
* QR code display and shareable link with copy-to-clipboard
```

**Step 2: Commit**

Commit `RELEASE_NOTES.md` with message: `docs: add surveys frontend to release notes`

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | i18n keys (de/en/fr) | i18n.ts |
| 2 | Navbar + layout | Navbar.tsx, surveys/layout.tsx |
| 3 | Surveys list page | surveys/page.tsx |
| 4 | Survey builder | surveys/new/page.tsx |
| 5 | Detail + results | surveys/[id]/page.tsx |
| 6 | Public response form | surveys/respond/[id]/ (2 files) |
| 7 | Full build + visual test | — |
| 8 | Release notes | RELEASE_NOTES.md |
