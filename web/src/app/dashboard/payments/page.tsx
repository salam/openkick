'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

interface Transaction {
  id: number;
  useCase: string;
  provider: string;
  externalId: string;
  amount: number;
  currency: string;
  status: string;
  nickname: string | null;
  createdAt: string;
}

const USE_CASE_LABELS: Record<string, string> = {
  tournament_fee: 'payments_tournament_fee',
  survey_order: 'payments_merchandise',
  donation: 'payments_donation',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-600',
  partially_refunded: 'bg-orange-100 text-orange-800',
};

export default function PaymentsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [useCaseFilter, setUseCaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const limit = 20;

  // Re-render on language change
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (useCaseFilter) params.set('useCase', useCaseFilter);
    if (statusFilter) params.set('status', statusFilter);

    apiFetch<{ transactions: Transaction[]; total: number }>(
      `/api/admin/payments/transactions?${params}`
    )
      .then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total);
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [page, useCaseFilter, statusFilter]);

  async function handleRefund(id: number) {
    if (!confirm(t('payments_confirm_refund'))) return;
    await apiFetch(`/api/admin/payments/refund/${id}`, { method: 'POST' });
    setPage(page); // triggers re-fetch via dependency
    // Force refetch
    setUseCaseFilter((v) => v);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('payments_title')}</h1>
        <Link
          href="/dashboard/payments/settings/"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {t('payments_settings')}
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <select
          value={useCaseFilter}
          onChange={(e) => { setUseCaseFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('payments_all_types')}</option>
          <option value="tournament_fee">{t('payments_tournament_fee')}</option>
          <option value="survey_order">{t('payments_merchandise')}</option>
          <option value="donation">{t('payments_donation')}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('payments_all_statuses')}</option>
          <option value="completed">{t('payments_completed')}</option>
          <option value="pending">{t('payments_pending')}</option>
          <option value="failed">{t('payments_failed')}</option>
          <option value="refunded">{t('payments_refunded')}</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : transactions.length === 0 ? (
        <p className="text-gray-500">{t('payments_no_transactions')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('payments_date')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('payments_type')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('payments_player')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">{t('payments_amount')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('payments_status')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">{t('payments_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {new Date(tx.createdAt).toLocaleDateString(getLanguage())}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {t(USE_CASE_LABELS[tx.useCase] || tx.useCase)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {tx.nickname || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {(tx.amount / 100).toFixed(2)} {tx.currency}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[tx.status] || 'bg-gray-100 text-gray-600'}`}>
                        {t(`payments_${tx.status}`) || tx.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        {tx.status === 'completed' && (
                          <button
                            onClick={() => handleRefund(tx.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            {t('payments_refund')}
                          </button>
                        )}
                        {(tx.status === 'completed' || tx.status === 'refunded') && (
                          <a
                            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/payments/receipt/${tx.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-800"
                          >
                            {t('payments_receipt')}
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                {t('payments_showing')} {(page - 1) * limit + 1}–{Math.min(page * limit, total)} {t('payments_of')} {total}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded border px-3 py-1 disabled:opacity-50"
                >
                  &laquo;
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="rounded border px-3 py-1 disabled:opacity-50"
                >
                  &raquo;
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
