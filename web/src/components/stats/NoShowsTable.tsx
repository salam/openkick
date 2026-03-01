'use client';

interface NoShowData {
  playerName: string;
  noShows: number;
  registered: number;
  rate: number;
}

export default function NoShowsTable({ data }: { data: NoShowData[] }) {
  if (data.length === 0) return null;

  const sorted = [...data].sort((a, b) => b.rate - a.rate);

  function rateColor(rate: number): string {
    if (rate > 0.2) return 'text-red-600';
    if (rate >= 0.1) return 'text-yellow-600';
    return 'text-green-600';
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">No-Shows</h3>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100">
          <th className="pb-2 text-left font-medium text-gray-500">Player</th>
          <th className="pb-2 text-right font-medium text-gray-500">No-Shows</th>
          <th className="pb-2 text-right font-medium text-gray-500">Registered</th>
          <th className="pb-2 text-right font-medium text-gray-500">Rate</th>
        </tr></thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.playerName} className="border-b border-gray-50">
              <td className="py-2 text-gray-900">{d.playerName}</td>
              <td className="py-2 text-right text-gray-600">{d.noShows}</td>
              <td className="py-2 text-right text-gray-600">{d.registered}</td>
              <td className={`py-2 text-right font-medium ${rateColor(d.rate)}`}>
                {Math.round(d.rate * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
