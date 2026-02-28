'use client';

import { useState, useEffect, useRef } from 'react';
import { getLanguage, setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';

export default function LanguageToggle() {
  const [open, setOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(() => getLanguage());
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside detection
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stay in sync with language changes from other components
  useEffect(() => {
    function handleLangChange(e: Event) {
      const detail = (e as CustomEvent<{ lang: string }>).detail;
      if (detail?.lang) {
        setCurrentLang(detail.lang);
      }
    }
    window.addEventListener('languagechange', handleLangChange);
    return () => window.removeEventListener('languagechange', handleLangChange);
  }, []);

  function handleSelect(code: string) {
    setLanguage(code);
    setCurrentLang(code);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        aria-label="Select language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
          aria-label="Language options"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={currentLang === lang.code}
              onClick={() => handleSelect(lang.code)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <span>{lang.label}</span>
              {currentLang === lang.code && (
                <span className="text-green-600">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
