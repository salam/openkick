'use client';

interface CoachHoursData {
  coachName: string;
  sessionCount: number;
  coachHours: number;
}

export default function CoachHoursCard({ data }: { data: CoachHoursData[] }) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Coach Hours</h3>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100">
          <th className="pb-2 text-left font-medium text-gray-500">Coach</th>
          <th className="pb-2 text-right font-medium text-gray-500">Sessions</th>
          <th className="pb-2 text-right font-medium text-gray-500">Hours</th>
        </tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.coachName} className="border-b border-gray-50">
              <td className="py-2 text-gray-900">{d.coachName}</td>
              <td className="py-2 text-right text-gray-600">{d.sessionCount}</td>
              <td className="py-2 text-right font-medium text-gray-900">{d.coachHours}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
