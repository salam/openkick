'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

/* ── Types ──────────────────────────────────────────────────────────── */

interface Achievement {
  type: string;
  label: string;
}

interface TournamentResult {
  id: number;
  eventId: number;
  placement: number | null;
  totalTeams: number | null;
  summary: string | null;
  resultsUrl: string | null;
  achievements: Achievement[];
  createdAt: string;
  updatedAt: string;
}

interface Props {
  eventId: number;
  eventType: string;
  isCoach: boolean;
  initialResults: TournamentResult | null;
}

/* ── Constants ──────────────────────────────────────────────────────── */

const PREDEFINED_ACHIEVEMENT_KEYS: { type: string; key: string }[] = [
  { type: '1st_place', key: 'achievement_1st' },
  { type: '2nd_place', key: 'achievement_2nd' },
  { type: '3rd_place', key: 'achievement_3rd' },
  { type: 'fair_play', key: 'achievement_fair_play' },
  { type: 'best_player', key: 'achievement_best_player' },
];

/* ── Helpers ─────────────────────────────────────────────────────────── */

function placementBgClass(placement: number): string {
  if (placement === 1) return 'bg-[#FEF3C7] text-amber-800';
  if (placement === 2) return 'bg-[#F3F4F6] text-gray-800';
  if (placement === 3) return 'bg-[#FED7AA] text-orange-800';
  return 'bg-gray-100 text-gray-700';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ── Component ──────────────────────────────────────────────────────── */

export default function TournamentResultsForm({
  eventId,
  eventType: _eventType,
  isCoach,
  initialResults,
}: Props) {
  const [results, setResults] = useState<TournamentResult | null>(initialResults);
  const [editing, setEditing] = useState(false);

  // Form state
  const [placement, setPlacement] = useState<string>(
    initialResults?.placement != null ? String(initialResults.placement) : '',
  );
  const [totalTeams, setTotalTeams] = useState<string>(
    initialResults?.totalTeams != null ? String(initialResults.totalTeams) : '',
  );
  const [summary, setSummary] = useState(initialResults?.summary ?? '');
  const [resultsUrl, setResultsUrl] = useState(initialResults?.resultsUrl ?? '');
  const [achievements, setAchievements] = useState<Achievement[]>(
    initialResults?.achievements ?? [],
  );
  const [customAchievement, setCustomAchievement] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suppress unused-var lint for eventType (kept in props for future use)
  void _eventType;

  // Language reactivity
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  /* ── Handlers ── */

  function resetForm(r: TournamentResult | null) {
    setPlacement(r?.placement != null ? String(r.placement) : '');
    setTotalTeams(r?.totalTeams != null ? String(r.totalTeams) : '');
    setSummary(r?.summary ?? '');
    setResultsUrl(r?.resultsUrl ?? '');
    setAchievements(r?.achievements ?? []);
    setCustomAchievement('');
    setError(null);
  }

  function handleEdit() {
    resetForm(results);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError(null);
  }

  function toggleAchievement(achievement: Achievement) {
    setAchievements((prev) => {
      const exists = prev.some((a) => a.type === achievement.type);
      if (exists) return prev.filter((a) => a.type !== achievement.type);
      return [...prev, achievement];
    });
  }

  function addCustomAchievement() {
    const label = customAchievement.trim();
    if (!label) return;
    const type = 'custom_' + label.toLowerCase().replace(/\s+/g, '_');
    if (achievements.some((a) => a.type === type)) return;
    setAchievements((prev) => [...prev, { type, label }]);
    setCustomAchievement('');
  }

  function removeAchievement(type: string) {
    setAchievements((prev) => prev.filter((a) => a.type !== type));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        placement: placement ? Number(placement) : null,
        totalTeams: totalTeams ? Number(totalTeams) : null,
        summary: summary || null,
        resultsUrl: resultsUrl || null,
        achievements,
      };

      const isNew = !results;
      const saved = await apiFetch<TournamentResult>(
        `/api/events/${eventId}/results`,
        {
          method: isNew ? 'POST' : 'PUT',
          body: JSON.stringify(body),
        },
      );
      setResults(saved);
      setEditing(false);
      resetForm(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_save_results'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('delete_results_confirm'))) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/events/${eventId}/results`, { method: 'DELETE' });
      setResults(null);
      setEditing(false);
      resetForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_delete_results'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleImportFromUrl() {
    if (!resultsUrl.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const imported = await apiFetch<{
        placement?: number;
        totalTeams?: number;
        summary?: string;
        achievements?: Achievement[];
      }>(`/api/events/${eventId}/results/import`, {
        method: 'POST',
        body: JSON.stringify({ url: resultsUrl }),
      });
      if (imported.placement != null) setPlacement(String(imported.placement));
      if (imported.totalTeams != null) setTotalTeams(String(imported.totalTeams));
      if (imported.summary) setSummary(imported.summary);
      if (imported.achievements) setAchievements(imported.achievements);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_import_results'));
    } finally {
      setImporting(false);
    }
  }

  /* ── View mode ── */

  if (!editing) {
    if (!results) {
      // No results yet — show add button for coaches
      if (!isCoach) return null;
      return (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('tournament_results')}
          </h2>
          <button
            onClick={handleEdit}
            className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
          >
            {t('add_results')}
          </button>
        </section>
      );
    }

    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('tournament_results')}
        </h2>

        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          {/* Placement badge */}
          {results.placement != null && (
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold ${placementBgClass(results.placement)}`}
              >
                {ordinal(results.placement)}
                {results.totalTeams != null && ` ${t('out_of')} ${results.totalTeams}`}
              </span>
            </div>
          )}

          {/* Summary */}
          {results.summary && (
            <p className="whitespace-pre-line text-sm text-gray-700">
              {results.summary}
            </p>
          )}

          {/* Achievement badges */}
          {results.achievements.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {results.achievements.map((a) => (
                <span
                  key={a.type}
                  className="inline-block rounded-full bg-primary-100 px-3 py-0.5 text-xs font-semibold text-primary-700"
                >
                  {a.label}
                </span>
              ))}
            </div>
          )}

          {/* Results URL */}
          {results.resultsUrl && (
            <a
              href={results.resultsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary-600 underline hover:text-primary-800"
            >
              {t('view_full_results')}
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}

          {/* Edit button (coach only) */}
          {isCoach && (
            <div className="pt-1">
              <button
                onClick={handleEdit}
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                {t('edit')}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  /* ── Edit mode ── */

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('tournament_results')}
      </h2>

      <div className="space-y-4 rounded-lg border border-gray-200 p-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Placement & Total Teams */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm text-gray-600">
            {t('placement')}
            <input
              type="number"
              min={1}
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              placeholder="e.g. 1"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="block text-sm text-gray-600">
            {t('total_teams_field')}
            <input
              type="number"
              min={1}
              value={totalTeams}
              onChange={(e) => setTotalTeams(e.target.value)}
              placeholder="e.g. 8"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>

        {/* Summary */}
        <label className="block text-sm text-gray-600">
          {t('summary')}
          <textarea
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={t('summary_placeholder')}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </label>

        {/* Achievements */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">{t('achievements')}</p>

          {/* Predefined chips */}
          <div className="mb-2 flex flex-wrap gap-2">
            {PREDEFINED_ACHIEVEMENT_KEYS.map((a) => {
              const label = t(a.key);
              const active = achievements.some((sel) => sel.type === a.type);
              return (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => toggleAchievement({ type: a.type, label })}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-primary-400 bg-primary-100 text-primary-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Custom achievement input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customAchievement}
              onChange={(e) => setCustomAchievement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomAchievement();
                }
              }}
              placeholder={t('add_achievement')}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={addCustomAchievement}
              className="rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-sm font-medium text-primary-600 transition hover:bg-primary-50"
            >
              {t('add')}
            </button>
          </div>

          {/* Selected achievements as removable pills */}
          {achievements.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {achievements.map((a) => (
                <span
                  key={a.type}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-0.5 text-xs font-semibold text-primary-700"
                >
                  {a.label}
                  <button
                    type="button"
                    onClick={() => removeAchievement(a.type)}
                    className="ml-0.5 text-primary-500 hover:text-primary-800"
                    aria-label={`${t('delete')} ${a.label}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results URL */}
        <div>
          <label className="block text-sm text-gray-600">
            {t('results_url')}
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={resultsUrl}
                onChange={(e) => setResultsUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={handleImportFromUrl}
                disabled={importing || !resultsUrl.trim()}
                className="whitespace-nowrap rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50 disabled:opacity-50"
              >
                {importing ? (
                  <span className="inline-flex items-center gap-1">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('importing')}
                  </span>
                ) : (
                  t('import_from_url_btn')
                )}
              </button>
            </div>
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {t('cancel')}
          </button>
          {results && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? t('deleting') : t('delete')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
