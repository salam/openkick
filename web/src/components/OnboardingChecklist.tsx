'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

interface OnboardingStatus {
  onboardingCompleted: boolean;
  checklist: {
    hasHolidays: boolean;
    hasTrainings: boolean;
    hasPlayers: boolean;
    hasGuardians: boolean;
    hasTournaments: boolean;
    hasFeedsConfigured: boolean;
  };
}

const CHECKLIST_KEYS = [
  { key: 'hasHolidays', i18nKey: 'checklist_holidays', href: '/settings#holidays' },
  { key: 'hasTrainings', i18nKey: 'checklist_training', href: '/events/new/' },
  { key: 'hasPlayers', i18nKey: 'checklist_players', href: '/players/' },
  { key: 'hasGuardians', i18nKey: 'checklist_guardians', href: '/players/' },
  { key: 'hasTournaments', i18nKey: 'checklist_tournament', href: '/events/new/' },
  { key: 'hasFeedsConfigured', i18nKey: 'checklist_feeds', href: '/settings#feeds' },
] as const;

function getChecklistItems() {
  return CHECKLIST_KEYS.map((item) => ({
    ...item,
    label: t(item.i18nKey),
  }));
}

// Static tips shown below the checklist — not trackable, just helpful nudges
function getTips() {
  return [
    { label: t('tip_log_results'), href: '/events/new/' },
  ];
}

const DISMISS_KEY = 'onboarding_checklist_dismissed';

export default function OnboardingChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(true); // default hidden until loaded
  const [collapsed, setCollapsed] = useState(false);
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true');

    apiFetch<OnboardingStatus>('/api/onboarding/status')
      .then(setStatus)
      .catch(() => {
        // API not available — hide checklist
      });
  }, []);

  // Nothing to render if: still loading, dismissed, stepper not finished, or all done
  if (!status || dismissed || !status.onboardingCompleted) return null;

  const checklistItems = getChecklistItems();
  const tips = getTips();

  const completedCount = checklistItems.filter(
    (item) => status.checklist[item.key],
  ).length;

  // All items complete — auto-hide
  if (completedCount === checklistItems.length) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
      {/* Header — clickable to collapse */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between"
      >
        <h2 className="text-lg font-semibold text-gray-900">{t('getting_started')}</h2>
        <span className="text-sm text-gray-500">
          {completedCount} / {checklistItems.length} {t('done')}
        </span>
      </button>

      {!collapsed && (
        <>
          <ul className="mt-4 space-y-3">
            {checklistItems.map((item) => {
              const done = status.checklist[item.key];
              return (
                <li key={item.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {done ? (
                      <svg
                        className="h-5 w-5 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
                        />
                      </svg>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center">
                        <span className="h-3 w-3 rounded-full border-2 border-gray-300" />
                      </span>
                    )}
                    {done ? (
                      <span className="text-sm text-gray-400 line-through">
                        {item.label}
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-sm font-medium text-gray-700 hover:text-emerald-600"
                      >
                        {item.label}
                      </Link>
                    )}
                  </div>
                  {!done && (
                    <Link
                      href={item.href}
                      className="text-gray-400 hover:text-emerald-500"
                      aria-label={`Go to ${item.label}`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.25 4.5l7.5 7.5-7.5 7.5"
                        />
                      </svg>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Static tips */}
          {tips.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              {tips.map((tip) => (
                <div key={tip.label} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center text-gray-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                  </span>
                  <Link
                    href={tip.href}
                    className="text-sm text-gray-500 hover:text-emerald-600"
                  >
                    {tip.label}
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              {t('dismiss')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
