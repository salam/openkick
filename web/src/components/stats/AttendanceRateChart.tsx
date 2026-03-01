'use client';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

interface AttendanceRateData {
  playerName: string;
  attended: number;
  total: number;
  rate: number;
}

export default function AttendanceRateChart({ data }: { data: AttendanceRateData[] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">No data</p>;

  const sorted = [...data].sort((a, b) => b.rate - a.rate);

  const chartData = {
    labels: sorted.map(d => d.playerName),
    datasets: [{
      label: 'Attendance Rate (%)',
      data: sorted.map(d => Math.round(d.rate * 100)),
      backgroundColor: sorted.map(d => {
        if (d.rate > 0.8) return '#10b981';
        if (d.rate >= 0.5) return '#f59e0b';
        return '#ef4444';
      }),
      borderRadius: 6,
    }],
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Attendance Rate</h3>
      <Bar data={chartData} options={{
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
      }} />
    </div>
  );
}
