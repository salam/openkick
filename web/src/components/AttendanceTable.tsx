'use client';

interface AttendanceRow {
  playerId: string;
  playerName: string;
  category: string;
  status: 'attending' | 'absent' | 'waitlist' | 'unknown';
  respondedAt?: string;
  source?: string;
}

interface AttendanceTableProps {
  rows: AttendanceRow[];
}

const statusStyles: Record<string, string> = {
  attending: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  waitlist: 'bg-yellow-100 text-yellow-700',
  unknown: 'bg-gray-100 text-gray-600',
};

const statusLabels: Record<string, string> = {
  attending: 'Attending',
  absent: 'Absent',
  waitlist: 'Waitlist',
  unknown: 'Unknown',
};

export default function AttendanceTable({ rows }: AttendanceTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Player
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Responded
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Source
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.map((row) => (
              <tr key={row.playerId} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {row.playerName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{row.category}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[row.status]}`}
                  >
                    {statusLabels[row.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {row.respondedAt || '-'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {row.source || '-'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No attendance data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 md:hidden">
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">No attendance data available</p>
        )}
        {rows.map((row) => (
          <div key={row.playerId} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">{row.playerName}</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[row.status]}`}
              >
                {statusLabels[row.status]}
              </span>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              <div>Category: {row.category}</div>
              {row.respondedAt && <div>Responded: {row.respondedAt}</div>}
              {row.source && <div>Source: {row.source}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
