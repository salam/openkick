'use client';

import { useState } from 'react';
import { getToken } from '@/lib/auth';

interface Props {
  type: string;
  period: string;
}

export default function StatsExportButton({ type, period }: Props) {
  const [open, setOpen] = useState(false);

  async function download(format: 'csv' | 'pdf') {
    setOpen(false);
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    const params = new URLSearchParams({ format, type });
    if (period) params.set('period', period);
    const token = getToken();
    const res = await fetch(`${base}/api/admin/stats/export?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openkick-${type}-${period}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button onClick={() => download('csv')} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
            CSV
          </button>
          <button onClick={() => download('pdf')} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
            PDF
          </button>
        </div>
      )}
    </div>
  );
}
