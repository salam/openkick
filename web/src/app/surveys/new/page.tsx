'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

/* ── Types ──────────────────────────────────────────────────────────── */

interface QuestionForm {
  type: 'single_choice' | 'multiple_choice' | 'star_rating' | 'free_text' | 'size_picker';
  label: string;
  options: string[];
}

const QUESTION_TYPES = [
  { value: 'single_choice', label: 'survey_type_single_choice' },
  { value: 'multiple_choice', label: 'survey_type_multiple_choice' },
  { value: 'star_rating', label: 'survey_type_star_rating' },
  { value: 'free_text', label: 'survey_type_free_text' },
  { value: 'size_picker', label: 'survey_type_size_picker' },
] as const;

const SIZE_PICKER_OPTIONS = ['116', '128', '140', '152', '164', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];

/* ── Component ─────────────────────────────────────────────────────── */

export default function NewSurveyPage() {
  const router = useRouter();

  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const [title, setTitle] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [deadline, setDeadline] = useState('');
  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);

  async function handleTemplate(template: string) {
    setCreatingTemplate(template);
    try {
      const result = await apiFetch<{ id: number }>(`/api/surveys/templates/${template}`, {
        method: 'POST',
      });
      router.push(`/surveys/${result.id}/`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      setCreatingTemplate(null);
    }
  }

  /* ── Question helpers ─────────────────────────────────────────── */

  function addQuestion() {
    setQuestions((prev) => [...prev, { type: 'single_choice', label: '', options: [] }]);
  }

  function updateQuestion(index: number, updates: Partial<QuestionForm>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updates } : q)),
    );
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addOption(qIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, options: [...q.options, ''] } : q)),
    );
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) }
          : q,
      ),
    );
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.filter((_, j) => j !== oIndex) }
          : q,
      ),
    );
  }

  function handleTypeChange(index: number, newType: QuestionForm['type']) {
    const updates: Partial<QuestionForm> = { type: newType };
    if (newType === 'size_picker') {
      updates.options = [...SIZE_PICKER_OPTIONS];
    }
    updateQuestion(index, updates);
  }

  /* ── Submit ───────────────────────────────────────────────────── */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || questions.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        title,
        anonymous,
        deadline: deadline || null,
        questions: questions.map((q, i) => ({
          type: q.type,
          label: q.label,
          options: q.options.length > 0 ? q.options : undefined,
          sort_order: i,
        })),
      };

      const result = await apiFetch<{ id: number }>('/api/surveys', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      router.push('/surveys/' + result.id + '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setSaving(false);
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */

  const canSubmit = !saving && title.trim().length > 0 && questions.length > 0;
  const needsOptions = (type: string) =>
    type === 'single_choice' || type === 'multiple_choice' || type === 'size_picker';

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <a
        href="/surveys/"
        className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; {t('surveys')}
      </a>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('new_survey')}</h1>

      {/* Quick templates */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-gray-500">{t('survey_or_use_template')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleTemplate('trikot-order')}
            disabled={creatingTemplate !== null}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {creatingTemplate === 'trikot-order' ? t('loading') : t('survey_new_template_trikot')}
          </button>
          <button
            type="button"
            onClick={() => handleTemplate('feedback')}
            disabled={creatingTemplate !== null}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {creatingTemplate === 'feedback' ? t('loading') : t('survey_new_template_feedback')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Card 1: Survey Settings ── */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('survey_mode')}</h2>

          {/* Title */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('survey_title')} *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Anonymous toggle */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('survey_mode')}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAnonymous(true)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  anonymous
                    ? 'bg-emerald-500 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('survey_anonymous')}
              </button>
              <button
                type="button"
                onClick={() => setAnonymous(false)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  !anonymous
                    ? 'bg-emerald-500 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('survey_identified')}
              </button>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('survey_deadline')}
            </label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:max-w-xs"
            />
          </div>
        </div>

        {/* ── Card 2: Questions ── */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('survey_question_label')}</h2>

          {questions.length === 0 && (
            <p className="mb-4 text-sm text-gray-400">{t('survey_add_question')}</p>
          )}

          <div className="space-y-4">
            {questions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                {/* Type selector */}
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    {t('survey_question_type')}
                  </label>
                  <select
                    value={q.type}
                    onChange={(e) =>
                      handleTypeChange(qIdx, e.target.value as QuestionForm['type'])
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {QUESTION_TYPES.map((qt) => (
                      <option key={qt.value} value={qt.value}>
                        {t(qt.label)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Label input */}
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    {t('survey_question_label')}
                  </label>
                  <input
                    type="text"
                    value={q.label}
                    onChange={(e) => updateQuestion(qIdx, { label: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Options editor */}
                {needsOptions(q.type) && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      {t('survey_question_options')}
                    </label>
                    <div className="space-y-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(qIdx, oIdx)}
                            className="text-sm font-medium text-red-500 hover:text-red-700"
                          >
                            &#x2715;
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addOption(qIdx)}
                      className="mt-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      {t('survey_option_add')}
                    </button>
                  </div>
                )}

                {/* Actions row */}
                <div className="flex items-center gap-3 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => moveQuestion(qIdx, -1)}
                    disabled={qIdx === 0}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  >
                    {t('survey_move_up')}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(qIdx, 1)}
                    disabled={qIdx === questions.length - 1}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  >
                    {t('survey_move_down')}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(qIdx)}
                    className="ml-auto text-sm font-medium text-red-500 hover:text-red-700"
                  >
                    {t('survey_remove_question')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addQuestion}
            className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            {t('survey_add_question')}
          </button>
        </div>

        {/* ── Footer buttons ── */}
        <div className="flex items-center gap-4 border-t border-gray-200 pt-6">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? t('loading') : t('survey_create')}
          </button>
          <a
            href="/surveys/"
            className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {t('cancel')}
          </a>
        </div>
      </form>
    </div>
  );
}
