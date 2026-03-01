'use client';

interface TournamentData {
  playerName: string;
  tournamentsPlayed: number;
}

export default function TournamentStatsCard({ data }: { data: TournamentData[] }) {
  if (data.length === 0) return null;

  const totalTournaments = data.length > 0
    ? Math.max(...data.map(d => d.tournamentsPlayed))
    : 0;

  const sorted = [...data].sort((a, b) => b.tournamentsPlayed - a.tournamentsPlayed);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Tournament Participation</h3>
      <p className="mb-3 text-sm text-gray-600">
        <span className="text-lg font-semibold text-gray-900">{totalTournaments}</span> tournament{totalTournaments !== 1 ? 's' : ''} total
      </p>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100">
          <th className="pb-2 text-left font-medium text-gray-500">Player</th>
          <th className="pb-2 text-right font-medium text-gray-500">Tournaments</th>
        </tr></thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.playerName} className="border-b border-gray-50">
              <td className="py-2 text-gray-900">{d.playerName}</td>
              <td className="py-2 text-right font-medium text-gray-900">{d.tournamentsPlayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
