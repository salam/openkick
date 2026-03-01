'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/* ── Types ─────────────────────────────────────────────────────────── */

interface QuestionParsed {
  id: number;
  type: string;
  label: string;
  options: string[] | null;
  sort_order: number;
}

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

interface AggregatedQuestion {
  question: QuestionParsed;
  average_rating?: number;
  distribution?: Record<string, number>;
  text_responses?: string[];
}

interface AggregatedResults {
  survey: SurveyDetail;
  total_responses: number;
  questions: AggregatedQuestion[];
}

/* ── Helpers ───────────────────────────────────────────────────────── */

const STATUS_BADGE: Record<SurveyDetail['status'], string> = {
  open: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-50 text-gray-400',
};

const STATUS_LABEL: Record<SurveyDetail['status'], string> = {
  open: 'survey_status_open',
  closed: 'survey_status_closed',
  archived: 'survey_status_archived',
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [results, setResults] = useState<AggregatedResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [s, r] = await Promise.all([
        apiFetch<SurveyDetail>(`/api/surveys/${id}`),
        apiFetch<AggregatedResults>(`/api/surveys/${id}/results`),
      ]);
      setSurvey(s);
      setResults(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleClose() {
    try {
      await apiFetch(`/api/surveys/${id}/close`, { method: 'PUT' });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function handleArchive() {
    try {
      await apiFetch(`/api/surveys/${id}/archive`, { method: 'PUT' });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/surveys/respond/${id}/`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ── Loading / Error / Not found ──────────────────────────────── */

  if (loading) {
    return <p className="py-8 text-center text-gray-500">{t('loading')}</p>;
  }

  if (error && !survey) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            {t('dismiss')}
          </button>
        </div>
      </div>
    );
  }

  if (!survey) {
    return <p className="py-8 text-center text-gray-500">{t('survey_not_found')}</p>;
  }

  /* ── Render helpers ───────────────────────────────────────────── */

  function renderDistribution(dist: Record<string, number>) {
    const maxCount = Math.max(...Object.values(dist), 1);
    return (
      <div className="mt-2 space-y-1">
        {Object.entries(dist).map(([option, count]) => (
          <div key={option} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate text-gray-700">{option}</span>
            <div className="relative h-5 flex-1 rounded bg-gray-100">
              <div
                className="absolute left-0 top-0 h-5 rounded bg-emerald-400"
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs text-gray-500">{count}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderQuestion(aq: AggregatedQuestion) {
    const q = aq.question;

    if (q.type === 'star_rating' && aq.average_rating !== undefined) {
      const pct = (aq.average_rating / 5) * 100;
      return (
        <div key={q.id} className="mb-4">
          <h4 className="mb-1 text-sm font-semibold text-gray-800">{q.label}</h4>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-amber-500">
              &#9733; {aq.average_rating.toFixed(1)} / 5
            </span>
          </div>
          <div className="mt-1 h-3 w-full rounded bg-gray-100">
            <div
              className="h-3 rounded bg-amber-400"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }

    if (
      (q.type === 'single_choice' || q.type === 'multiple_choice' || q.type === 'size_picker') &&
      aq.distribution
    ) {
      return (
        <div key={q.id} className="mb-4">
          <h4 className="mb-1 text-sm font-semibold text-gray-800">{q.label}</h4>
          {renderDistribution(aq.distribution)}
        </div>
      );
    }

    if (q.type === 'free_text' && aq.text_responses) {
      return (
        <div key={q.id} className="mb-4">
          <h4 className="mb-1 text-sm font-semibold text-gray-800">{q.label}</h4>
          {aq.text_responses.length === 0 ? (
            <p className="text-sm text-gray-400">{t('survey_no_responses')}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {aq.text_responses.map((resp, idx) => (
                <div key={idx} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  &ldquo;{resp}&rdquo;
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  /* ── Main render ──────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <button
        onClick={() => router.push('/surveys/')}
        className="mb-4 text-sm text-emerald-600 hover:underline"
      >
        &larr; {t('surveys')}
      </button>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{survey.title}</h1>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[survey.status]}`}
          >
            {t(STATUS_LABEL[survey.status])}
          </span>
        </div>

        <div className="flex gap-2">
          {survey.status === 'open' && (
            <button
              onClick={handleClose}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
            >
              {t('survey_close')}
            </button>
          )}
          {survey.status === 'closed' && (
            <button
              onClick={handleArchive}
              className="rounded-xl bg-gray-400 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-500"
            >
              {t('survey_archive')}
            </button>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-500">
        <span>{survey.anonymous ? t('survey_anonymous') : t('survey_identified')}</span>
        {survey.deadline && (
          <span>{t('survey_deadline')}: {new Date(survey.deadline).toLocaleDateString()}</span>
        )}
      </div>

      {/* Share card (only when open) */}
      {survey.status === 'open' && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('survey_share')}</h2>

          <div className="mb-3 flex items-center gap-2">
            <input
              readOnly
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/surveys/respond/${id}/`}
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
            />
            <button
              onClick={copyLink}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              {copied ? t('survey_link_copied') : t('survey_copy_link')}
            </button>
          </div>

          <div className="flex justify-center">
            <img
              src={`${API_URL}/api/public/surveys/${id}/qr`}
              alt={t('survey_qr_code')}
              className="h-48 w-48"
            />
          </div>
        </div>
      )}

      {/* Results card */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t('survey_results')}</h2>
          {results && (
            <span className="text-sm text-gray-500">
              {t('survey_total_responses')}: {results.total_responses}
            </span>
          )}
        </div>

        {!results || results.total_responses === 0 ? (
          <p className="text-sm text-gray-400">{t('survey_no_responses')}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {results.questions.map((aq) => (
              <div key={aq.question.id} className="py-3">
                {renderQuestion(aq)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
