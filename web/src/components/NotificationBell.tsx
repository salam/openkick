'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

interface Notification {
  id: number;
  type: string;
  message: string;
  createdAt: string;
}

export default function NotificationBell() {
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<Notification[]>('/api/notifications')
      .then(setNotifications)
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const markRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-600 hover:text-gray-800 transition-colors"
        aria-label={t('notifications')}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
          {notifications.length}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-xl shadow-lg w-80 z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              {t('notifications')}
            </h3>
          </div>
          {notifications.map((n) => (
            <div
              key={n.id}
              className="p-3 border-b border-gray-50 hover:bg-gray-50"
            >
              <p className="text-sm text-gray-800">{n.message}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">
                  {new Date(n.createdAt).toLocaleDateString('de-CH')}
                </span>
                <button
                  onClick={() => markRead(n.id)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {t('dismiss')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
