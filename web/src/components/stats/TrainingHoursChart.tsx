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

interface TrainingHoursData {
  teamName: string | null;
  trainingHours: number;
  sessionCount: number;
}

export default function TrainingHoursChart({ data }: { data: TrainingHoursData[] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">No data</p>;

  const chartData = {
    labels: data.map(d => d.teamName ?? 'All'),
    datasets: [{
      label: 'Training Hours',
      data: data.map(d => d.trainingHours),
      backgroundColor: '#10b981',
      borderRadius: 6,
    }],
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Training Hours</h3>
      <Bar data={chartData} options={{
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      }} />
    </div>
  );
}
