import { getToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // response had no JSON body — keep generic message
    }
    throw new Error(message);
  }
  return res.json();
}

// Statistics API
export async function fetchTrainingHours(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/training-hours?${params}`);
}

export async function fetchPersonHours(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/person-hours?${params}`);
}

export async function fetchCoachHours(period?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  return apiFetch<any[]>(`/api/admin/stats/coach-hours?${params}`);
}

export async function fetchNoShows(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/no-shows?${params}`);
}

export async function fetchAttendanceRate(period?: string, team?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (team) params.set("team", team);
  return apiFetch<any[]>(`/api/admin/stats/attendance-rate?${params}`);
}

export async function fetchTournamentParticipation(period?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  return apiFetch<any[]>(`/api/admin/stats/tournament-participation?${params}`);
}

export function getStatsExportUrl(format: "csv" | "pdf", type: string, period?: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  const params = new URLSearchParams({ format, type });
  if (period) params.set("period", period);
  return `${base}/api/admin/stats/export?${params}`;
}

export async function fetchHomepageStats() {
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  const res = await fetch(`${base}/api/public/homepage-stats`);
  return res.json();
}

export async function fetchHomepageStatsSettings() {
  return apiFetch<Record<string, boolean>>("/api/admin/settings/homepage-stats");
}

export async function updateHomepageStatsSettings(settings: Record<string, boolean>) {
  return apiFetch<Record<string, boolean>>("/api/admin/settings/homepage-stats", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
