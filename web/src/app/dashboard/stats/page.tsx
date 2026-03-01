'use client';

import { useEffect, useState } from 'react';
import SemesterPicker from '@/components/stats/SemesterPicker';
import StatsExportButton from '@/components/stats/StatsExportButton';
import TrainingHoursChart from '@/components/stats/TrainingHoursChart';
import PersonHoursChart from '@/components/stats/PersonHoursChart';
import AttendanceRateChart from '@/components/stats/AttendanceRateChart';
import CoachHoursCard from '@/components/stats/CoachHoursCard';
import NoShowsTable from '@/components/stats/NoShowsTable';
import TournamentStatsCard from '@/components/stats/TournamentStatsCard';
import {
  fetchTrainingHours,
  fetchPersonHours,
  fetchCoachHours,
  fetchNoShows,
  fetchAttendanceRate,
  fetchTournamentParticipation,
} from '@/lib/api';

export default function StatsPage() {
  // Generate default period value (current semester)
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  let defaultPeriod: string;
  if (month >= 1 && month <= 6) defaultPeriod = `spring-${year}`;
  else if (month >= 7) defaultPeriod = `autumn-${year}`;
  else defaultPeriod = `autumn-${year - 1}`;

  const [period, setPeriod] = useState(defaultPeriod);
  const [trainingHours, setTrainingHours] = useState<any[]>([]);
  const [personHours, setPersonHours] = useState<any[]>([]);
  const [coachHours, setCoachHours] = useState<any[]>([]);
  const [noShows, setNoShows] = useState<any[]>([]);
  const [attendanceRate, setAttendanceRate] = useState<any[]>([]);
  const [tournamentStats, setTournamentStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportType, setExportType] = useState('training-hours');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [th, ph, ch, ns, ar, tp] = await Promise.all([
          fetchTrainingHours(period),
          fetchPersonHours(period),
          fetchCoachHours(period),
          fetchNoShows(period),
          fetchAttendanceRate(period),
          fetchTournamentParticipation(period),
        ]);
        setTrainingHours(th);
        setPersonHours(ph);
        setCoachHours(ch);
        setNoShows(ns);
        setAttendanceRate(ar);
        setTournamentStats(tp);
      } catch { /* API unavailable */ }
      setLoading(false);
    }
    load();
  }, [period]);

  // Summary totals
  const totalTrainingHours = trainingHours.reduce((s, d) => s + (d.trainingHours || 0), 0);
  const totalPersonHours = personHours.reduce((s, d) => s + (d.personHours || 0), 0);
  const totalCoaches = coachHours.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
        <div className="flex items-center gap-2">
          <SemesterPicker value={period} onChange={setPeriod} />
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            <option value="training-hours">Training Hours</option>
            <option value="person-hours">Person Hours</option>
            <option value="coach-hours">Coach Hours</option>
            <option value="no-shows">No-Shows</option>
            <option value="attendance-rate">Attendance Rate</option>
            <option value="tournament-participation">Tournaments</option>
          </select>
          <StatsExportButton type={exportType} period={period} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Training Hours</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{totalTrainingHours.toFixed(1)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Person-Hours</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{totalPersonHours.toFixed(1)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Active Coaches</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{totalCoaches}</p>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrainingHoursChart data={trainingHours} />
            <PersonHoursChart data={personHours} />
          </div>

          {/* Attendance + No-shows row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AttendanceRateChart data={attendanceRate} />
            <NoShowsTable data={noShows} />
          </div>

          {/* Coach + Tournaments row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CoachHoursCard data={coachHours} />
            <TournamentStatsCard data={tournamentStats} />
          </div>
        </div>
      )}
    </div>
  );
}
