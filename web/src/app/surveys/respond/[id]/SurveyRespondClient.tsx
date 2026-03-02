'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { t, getLanguage } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/* ── Types ──────────────────────────────────────────────────────────── */

interface PublicSurvey {
  id: number;
  title: string;
  anonymous: boolean;
  deadline: string | null;
  price_per_item: number | null;
  questions: PublicQuestion[];
}

interface PublicQuestion {
  id: number;
  type: string;
  label: string;
  options: string[] | null;
  sort_order: number;
}

/* ── Component ──────────────────────────────────────────────────────── */

export default function SurveyRespondClient() {
  const { id } = useParams<{ id: string }>();

  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [payingOrder, setPayingOrder] = useState(false);
  const [orderCurrency, setOrderCurrency] = useState('CHF');

  /* force re-render on language change */
  const [, setLang] = useState(getLanguage());
  useEffect(() => {
    const onStorage = () => setLang(getLanguage());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* fetch survey on mount */
  useEffect(() => {
    if (!id || id === '_') return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/surveys/${id}`);
        if (res.status === 410) { setError('closed'); return; }
        if (!res.ok) { setError('not_found'); return; }
        const data = await res.json();
        setSurvey(data);
      } catch {
        setError('not_found');
      } finally {
        setLoading(false);
      }
    })();
    // Fetch payment currency for survey_order use case
    fetch(`${API_URL}/api/public/payment-status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.useCases?.survey_order?.currency) {
          setOrderCurrency(data.useCases.survey_order.currency);
        }
      })
      .catch(() => {});
  }, [id]);

  /* ── Submit handler ───────────────────────────────────────────────── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!survey) return;
    setSubmitting(true);
    try {
      const payload = {
        player_nickname: survey.anonymous ? undefined : nickname || undefined,
        answers: survey.questions.map((q) => ({
          question_id: q.id,
          value: answers[q.id] || '',
        })),
      };
      const res = await fetch(`${API_URL}/api/public/surveys/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) { setError('already_submitted'); return; }
      if (res.status === 410) { setError('closed'); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Submit failed');
      }
      const result = await res.json().catch(() => ({}));
      if (result.payment_required) {
        setPaymentRequired(true);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('survey_not_found'));
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Helpers ──────────────────────────────────────────────────────── */

  const setAnswer = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultiChoice = (questionId: number, option: string) => {
    setAnswers((prev) => {
      const current: string[] = prev[questionId]
        ? JSON.parse(prev[questionId])
        : [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: JSON.stringify(next) };
    });
  };

  /* ── Render question ──────────────────────────────────────────────── */

  const renderQuestion = (q: PublicQuestion) => {
    switch (q.type) {
      case 'single_choice':
        return (
          <div className="space-y-2">
            {(q.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`q_${q.id}`}
                  value={opt}
                  checked={answers[q.id] === opt}
                  onChange={() => setAnswer(q.id, opt)}
                  className="accent-primary-500"
                />
                <span className="text-sm text-gray-700">{opt}</span>
              </label>
            ))}
          </div>
        );

      case 'multiple_choice': {
        const selected: string[] = answers[q.id]
          ? JSON.parse(answers[q.id])
          : [];
        return (
          <div className="space-y-2">
            {(q.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleMultiChoice(q.id, opt)}
                  className="accent-primary-500"
                />
                <span className="text-sm text-gray-700">{opt}</span>
              </label>
            ))}
          </div>
        );
      }

      case 'star_rating':
        return (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setAnswer(q.id, String(star))}
                className="text-2xl cursor-pointer select-none"
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
              >
                {Number(answers[q.id] || 0) >= star ? '★' : '☆'}
              </button>
            ))}
          </div>
        );

      case 'free_text':
        return (
          <textarea
            rows={3}
            value={answers[q.id] || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        );

      case 'size_picker':
        return (
          <select
            value={answers[q.id] || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">—</option>
            {(q.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      default:
        return <p className="text-sm text-gray-400">Unsupported question type</p>;
    }
  };

  /* ── Error states ─────────────────────────────────────────────────── */

  if (error === 'closed') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
          <p className="text-amber-800 font-medium">{t('survey_closed_message')}</p>
        </div>
        <p className="mt-8 text-center text-xs text-gray-400">Powered by OpenKick</p>
      </div>
    );
  }

  if (error === 'already_submitted') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-6 text-center">
          <p className="text-blue-800 font-medium">{t('survey_already_submitted')}</p>
        </div>
        <p className="mt-8 text-center text-xs text-gray-400">Powered by OpenKick</p>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-red-800 font-medium">{t('survey_not_found')}</p>
        </div>
        <p className="mt-8 text-center text-xs text-gray-400">Powered by OpenKick</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-red-800 font-medium">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-3 text-sm text-red-600 underline hover:text-red-700"
          >
            {t('dismiss')}
          </button>
        </div>
        <p className="mt-8 text-center text-xs text-gray-400">Powered by OpenKick</p>
      </div>
    );
  }

  /* ── Loading ──────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center text-gray-500">
        {t('loading')}
      </div>
    );
  }

  if (!survey) return null;

  /* ── Success state ────────────────────────────────────────────────── */

  if (submitted) {
    const totalAmount = paymentRequired && survey?.price_per_item
      ? Math.round(survey.price_per_item * 100)
      : 0;

    async function handlePayOrder() {
      if (!survey || !totalAmount) return;
      setPayingOrder(true);
      try {
        const res = await fetch(`${API_URL}/api/payments/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            useCase: 'survey_order',
            referenceId: String(survey.id),
            nickname: nickname || undefined,
            amount: totalAmount,
            currency: orderCurrency,
            successUrl: `${window.location.origin}/surveys/respond/${id}/?paid=1`,
            cancelUrl: window.location.href,
          }),
        });
        const data = await res.json();
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        }
      } catch { /* checkout failed */ }
      finally { setPayingOrder(false); }
    }

    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <div className="rounded-xl bg-primary-50 border border-primary-200 p-6 text-center">
          <p className="text-primary-800 font-medium text-lg">{t('survey_thank_you')}</p>
        </div>

        {paymentRequired && totalAmount > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <h3 className="mb-1 text-base font-semibold text-amber-800">{t('survey_payment_title')}</h3>
            <p className="mb-4 text-sm text-amber-700">{t('survey_payment_description')}</p>
            <button
              onClick={handlePayOrder}
              disabled={payingOrder}
              className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {payingOrder ? '...' : `${t('survey_payment_pay')} ${orderCurrency} ${(totalAmount / 100).toFixed(2)}`}
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">Powered by OpenKick</p>
      </div>
    );
  }

  /* ── Main form ────────────────────────────────────────────────────── */

  const sortedQuestions = [...survey.questions].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-xs text-gray-400 mb-4">OpenKick</p>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{survey.title}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Nickname field for non-anonymous surveys */}
        {!survey.anonymous && (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {t('survey_nickname')}
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-400">{t('survey_nickname_hint')}</p>
          </div>
        )}

        {/* Questions */}
        {sortedQuestions.map((q) => (
          <div key={q.id} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {q.label}
            </label>
            {renderQuestion(q)}
          </div>
        ))}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-primary-500 px-6 py-3 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {submitting ? t('loading') : t('survey_submit')}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-gray-400">Powered by OpenKick</p>
    </div>
  );
}
