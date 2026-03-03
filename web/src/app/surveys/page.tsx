'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';
import { formatDate } from '@/lib/date';
import AuthGuard from '@/components/AuthGuard';

interface Survey {
  id: number;
  title: string;
  anonymous: boolean;
  status: 'open' | 'closed' | 'archived';
  deadline: string | null;
  created_at: string;
  response_count?: number;
}

type StatusFilter = 'all' | 'open' | 'closed' | 'archived';

const STATUS_BADGE: Record<Survey['status'], string> = {
  open: 'bg-primary-100 text-primary-700',
  closed: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-50 text-gray-400',
};

const STATUS_LABEL: Record<Survey['status'], string> = {
  open: 'survey_status_open',
  closed: 'survey_status_closed',
  archived: 'survey_status_archived',
};

export default function SurveysPage() {
  return <AuthGuard><SurveysPageContent /></AuthGuard>;
}

function SurveysPageContent() {
  const router = useRouter();

  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);

  const fetchSurveys = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch<Survey[]>('/api/surveys');
      setSurveys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  async function handleTemplate(template: string) {
    setCreatingTemplate(template);
    try {
      const result = await apiFetch<{ survey: { id: number } }>(`/api/surveys/templates/${template}`, {
        method: 'POST',
      });
      router.push(`/surveys/${result.survey.id}/`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      setCreatingTemplate(null);
    }
  }

  const filtered = filter === 'all' ? surveys : surveys.filter((s) => s.status === filter);

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('survey_template') === 'Vorlage' ? 'Alle' : 'All' },
    { key: 'open', label: t('survey_status_open') },
    { key: 'closed', label: t('survey_status_closed') },
    { key: 'archived', label: t('survey_status_archived') },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('surveys')}</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleTemplate('trikot-order')}
            disabled={creatingTemplate !== null}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {creatingTemplate === 'trikot-order' ? t('loading') : t('survey_new_template_trikot')}
          </button>
          <button
            onClick={() => handleTemplate('feedback')}
            disabled={creatingTemplate !== null}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {creatingTemplate === 'feedback' ? t('loading') : t('survey_new_template_feedback')}
          </button>
          <button
            onClick={() => router.push('/surveys/new/')}
            className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
          >
            {t('new_survey')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div className="mb-4 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              filter === f.key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <p className="py-8 text-center text-gray-500">{t('loading')}</p>
      ) : filtered.length === 0 && surveys.length > 0 ? (
        <p className="py-8 text-center text-gray-500">{t('survey_empty')}</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 py-12">
          <p className="text-gray-600">{t('survey_empty')}</p>
          <p className="text-sm text-gray-400">{t('survey_empty_hint')}</p>
          <button
            onClick={() => router.push('/surveys/new/')}
            className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
          >
            {t('survey_create')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((survey) => (
            <button
              key={survey.id}
              onClick={() => router.push(`/surveys/${survey.id}/`)}
              className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900">{survey.title}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[survey.status]}`}
                >
                  {t(STATUS_LABEL[survey.status])}
                </span>
              </div>

              <p className="text-xs text-gray-500">
                {survey.anonymous ? t('survey_anonymous') : t('survey_identified')}
              </p>

              {survey.deadline && (
                <p className="text-xs text-gray-500">
                  {t('survey_deadline')}: {formatDate(survey.deadline)}
                </p>
              )}

              {survey.response_count !== undefined && (
                <p className="text-xs text-gray-500">
                  {t('survey_responses')}: {survey.response_count}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
