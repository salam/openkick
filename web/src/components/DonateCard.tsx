'use client';

import { useState, useEffect } from 'react';
import { t, getLanguage } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const PRESET_AMOUNTS = [500, 1000, 2000, 5000]; // centimes

export default function DonateCard() {
  const [enabled, setEnabled] = useState(false);
  const [currency, setCurrency] = useState('CHF');
  const [amount, setAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [, setLang] = useState(() => getLanguage());

  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`${API_URL}/api/public/payment-status`);
        const data = await res.json();
        if (data.useCases?.donation?.enabled) {
          setEnabled(true);
          setCurrency(data.useCases.donation.currency || 'CHF');
        }
      } catch { /* donation not available */ }
    }
    checkStatus();
  }, []);

  if (!enabled) return null;

  const effectiveAmount = customAmount ? Math.round(parseFloat(customAmount) * 100) : amount;

  async function handleDonate() {
    if (!effectiveAmount || effectiveAmount <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useCase: 'donation',
          amount: effectiveAmount,
          currency,
          donorMessage: message || undefined,
          successUrl: `${window.location.origin}/?donated=1`,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch {
      // checkout failed silently
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-gray-900">{t('donate_title')}</h3>
      <p className="mb-4 text-sm text-gray-500">{t('donate_description')}</p>

      {/* Preset amounts */}
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESET_AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => { setAmount(a); setCustomAmount(''); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !customAmount && amount === a
                ? 'bg-primary-500 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {currency} {(a / 100).toFixed(0)}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="mb-3">
        <input
          type="number"
          min="1"
          step="0.5"
          placeholder={t('donate_custom_amount')}
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
        />
      </div>

      {/* Optional message */}
      <div className="mb-4">
        <input
          type="text"
          maxLength={120}
          placeholder={t('donate_message_placeholder')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
        />
      </div>

      <button
        onClick={handleDonate}
        disabled={submitting || effectiveAmount <= 0}
        className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? '...' : `${t('donate_button')} ${currency} ${(effectiveAmount / 100).toFixed(2)}`}
      </button>
    </div>
  );
}
