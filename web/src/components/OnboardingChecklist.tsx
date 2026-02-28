'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface OnboardingStatus {
  onboardingCompleted: boolean;
  checklist: {
    hasHolidays: boolean;
    hasTrainings: boolean;
    hasPlayers: boolean;
    hasGuardians: boolean;
    hasFeedsConfigured: boolean;
  };
}

const CHECKLIST_ITEMS = [
  { key: 'hasHolidays', label: 'Add holidays & vacations', href: '/settings#holidays' },
  { key: 'hasTrainings', label: 'Create your first training', href: '/events/new/' },
  { key: 'hasPlayers', label: 'Add players to the roster', href: '/players/' },
  { key: 'hasGuardians', label: 'Invite parents & guardians', href: '/players/' },
  { key: 'hasFeedsConfigured', label: 'Set up public feeds (optional)', href: '/settings#feeds' },
] as const;

const DISMISS_KEY = 'onboarding_checklist_dismissed';

export default function OnboardingChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(true); // default hidden until loaded
  const [collapsed, setCollapsed] = useState(false);

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

  const completedCount = CHECKLIST_ITEMS.filter(
    (item) => status.checklist[item.key],
  ).length;

  // All items complete — auto-hide
  if (completedCount === CHECKLIST_ITEMS.length) return null;

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
        <h2 className="text-lg font-semibold text-gray-900">Getting Started</h2>
        <span className="text-sm text-gray-500">
          {completedCount} of {CHECKLIST_ITEMS.length} done
        </span>
      </button>

      {!collapsed && (
        <>
          <ul className="mt-4 space-y-3">
            {CHECKLIST_ITEMS.map((item) => {
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

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
