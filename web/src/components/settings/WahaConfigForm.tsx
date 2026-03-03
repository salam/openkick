'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { SettingsFormProps } from './ClubProfileForm';
import { t } from '@/lib/i18n';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

type ConnectionStatus = 'connected' | 'qr_pending' | 'disconnected' | 'checking';
type DockerStatus = 'checking' | 'available' | 'unavailable';
type WahaContainerStatus = 'checking' | 'running' | 'stopped' | 'not_found';
type NativeWahaStatus = 'checking' | 'reachable' | 'unreachable';

interface WahaGroup {
  id: string;
  name?: string;
  subject?: string;
}

export default function WahaConfigForm({
  settings,
  onUpdate,
}: SettingsFormProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [pushName, setPushName] = useState('');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [groups, setGroups] = useState<WahaGroup[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [joining, setJoining] = useState(false);

  // Docker + WAHA container state
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>('checking');
  const [containerStatus, setContainerStatus] = useState<WahaContainerStatus>('checking');
  const [nativeStatus, setNativeStatus] = useState<NativeWahaStatus>('checking');
  const [installingDocker, setInstallingDocker] = useState(false);
  const [dockerLog, setDockerLog] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [installError, setInstallError] = useState<string | null>(null);
  const [containerAction, setContainerAction] = useState(false);
  const [recheckingInfra, setRecheckingInfra] = useState(false);
  const [groupMsg, setGroupMsg] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wahaUrl = settings.waha_url || '';

  // ── Check Docker + WAHA container ─────────────────────────────
  const checkInfra = useCallback(async () => {
    try {
      const dockerRes = await apiFetch<{ available: boolean }>('/api/setup-waha/docker/status');
      setDockerStatus(dockerRes.available ? 'available' : 'unavailable');

      if (!dockerRes.available) {
        // Docker not available — check if WAHA is running natively
        setContainerStatus('not_found');
        try {
          const nativeRes = await apiFetch<{ reachable: boolean }>('/api/setup-waha/waha/reachable');
          setNativeStatus(nativeRes.reachable ? 'reachable' : 'unreachable');
        } catch {
          setNativeStatus('unreachable');
        }
        return;
      }

      setNativeStatus('unreachable');
      const wahaRes = await apiFetch<{ status: string; port?: number }>('/api/setup-waha/waha/status');
      setContainerStatus(wahaRes.status as WahaContainerStatus);
    } catch {
      setDockerStatus('unavailable');
      setContainerStatus('not_found');
      setNativeStatus('unreachable');
    }
  }, []);

  useEffect(() => { checkInfra(); }, [checkInfra]);

  const handleRecheck = async () => {
    setRecheckingInfra(true);
    setDockerStatus('checking');
    setContainerStatus('checking');
    await checkInfra();
    setRecheckingInfra(false);
  };

  const handleInstallDocker = async () => {
    setInstallingDocker(true);
    setDockerLog([]);
    const token = getToken();
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    try {
      const res = await fetch(`${API_URL}/api/setup-waha/docker/install`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n').filter(l => l.startsWith('data: '))) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'progress') setDockerLog(prev => [...prev, json.text]);
            if (json.type === 'done') setDockerStatus('available');
            if (json.type === 'error') setDockerLog(prev => [...prev, `Error: ${json.text}`]);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setDockerLog(prev => [...prev, 'Failed to run Docker installer.']);
    } finally {
      setInstallingDocker(false);
      checkInfra();
    }
  };

  const handleInstallWaha = async () => {
    setInstalling(true);
    setInstallLog([]);
    setInstallError(null);
    const token = getToken();
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    try {
      const res = await fetch(`${API_URL}/api/setup-waha/waha/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ port: 3008, engine: 'WEBJS' }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n').filter(l => l.startsWith('data: '))) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'progress') setInstallLog(prev => [...prev, json.text]);
            if (json.type === 'done') { setContainerStatus('running'); if (json.wahaUrl) onUpdate('waha_url', json.wahaUrl); }
            if (json.type === 'error') setInstallError(json.text);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling(false);
      checkInfra();
    }
  };

  const handleStartWaha = async () => {
    setContainerAction(true);
    try { await apiFetch('/api/setup-waha/waha/start', { method: 'POST' }); } catch { /* ignore */ }
    await checkInfra();
    setContainerAction(false);
  };

  const handleStopWaha = async () => {
    setContainerAction(true);
    try { await apiFetch('/api/setup-waha/waha/stop', { method: 'POST' }); } catch { /* ignore */ }
    await checkInfra();
    setContainerAction(false);
  };

  // ── Start WAHA session (triggers QR code) ──────────────────────
  const handleStartSession = async () => {
    setStartingSession(true);
    try {
      await apiFetch('/api/setup-waha/waha/session/start', { method: 'POST' });
    } catch { /* polling will pick up state change */ }
    setStartingSession(false);
  };

  // ── Poll session status ─────────────────────────────────────────
  const pollSession = useCallback(async () => {
    if (!wahaUrl) {
      setStatus('disconnected');
      return;
    }
    try {
      const data = await apiFetch<{
        status: string;
        me?: { pushName?: string; id?: string };
      }>('/api/setup-waha/waha/session');

      if (data.status === 'SCAN_QR_CODE') {
        setStatus('qr_pending');
        // Fetch QR image as binary blob
        try {
          const token = getToken();
          const API_URL =
            process.env.NEXT_PUBLIC_API_URL || '';
          const res = await fetch(`${API_URL}/api/setup-waha/waha/qr`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const blob = await res.blob();
            setQrUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return URL.createObjectURL(blob);
            });
          }
        } catch {
          // QR not ready yet
        }
      } else if (data.status === 'WORKING' || data.status === 'STARTING') {
        setStatus('checking');
      } else if (data.me) {
        setStatus('connected');
        setPushName(data.me.pushName || data.me.id || '');
        setQrUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  }, [wahaUrl]);

  useEffect(() => {
    pollSession();
    pollingRef.current = setInterval(pollSession, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pollSession]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      setQrUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  // ── Fetch groups when connected ─────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (status !== 'connected') return;
    try {
      const data = await apiFetch<WahaGroup[]>(
        '/api/setup-waha/waha/groups',
      );
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    }
  }, [status]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // ── Join group ──────────────────────────────────────────────────
  async function handleJoinGroup() {
    if (!inviteLink.trim()) return;
    setJoining(true);
    setGroupMsg('');
    try {
      await apiFetch('/api/setup-waha/waha/groups/join', {
        method: 'POST',
        body: JSON.stringify({ inviteLink: inviteLink.trim() }),
      });
      setInviteLink('');
      setGroupMsg(t('joined_group'));
      loadGroups();
    } catch (err) {
      setGroupMsg(
        err instanceof Error ? err.message : t('failed_join'),
      );
    } finally {
      setJoining(false);
      setTimeout(() => setGroupMsg(''), 4000);
    }
  }

  // ── Leave group ─────────────────────────────────────────────────
  async function handleLeaveGroup(groupId: string) {
    try {
      await apiFetch('/api/setup-waha/waha/groups/leave', {
        method: 'POST',
        body: JSON.stringify({ groupId }),
      });
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch {
      setGroupMsg(t('failed_leave'));
      setTimeout(() => setGroupMsg(''), 4000);
    }
  }

  // ── Status indicator ────────────────────────────────────────────
  const statusDot =
    status === 'connected'
      ? 'bg-primary-500'
      : status === 'qr_pending'
        ? 'bg-amber-500'
        : status === 'checking'
          ? 'bg-gray-400 animate-pulse'
          : 'bg-red-500';

  const statusLabel =
    status === 'connected'
      ? t('waha_connected') + (pushName ? ` as "${pushName}"` : '')
      : status === 'qr_pending'
        ? t('waha_waiting')
        : status === 'checking'
          ? t('waha_checking')
          : t('waha_disconnected');

  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {t('waha_config')}
      </h2>

      {/* Info box */}
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1.5">
        <p className="font-medium">{t('what_is_waha')}</p>
        <p>
          {t('waha_desc')}
        </p>
      </div>

      {/* Docker + Container status */}
      <div className="mb-4 space-y-3">
        {/* Docker status */}
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${dockerStatus === 'available' ? 'bg-primary-500' : dockerStatus === 'unavailable' ? 'bg-red-500' : 'bg-gray-400 animate-pulse'}`} />
          <span className="text-gray-700">
            Docker: {dockerStatus === 'available' ? t('docker_available') : dockerStatus === 'unavailable' ? t('docker_not_found_label') : t('waha_checking')}
          </span>
          {dockerStatus !== 'checking' && (
            <button
              onClick={handleRecheck}
              disabled={recheckingInfra}
              className="ml-1 text-xs text-primary-600 hover:text-primary-800 underline disabled:opacity-50 disabled:no-underline"
            >
              {t('check_again')}
            </button>
          )}
        </div>

        {/* Native WAHA detected (no Docker) */}
        {dockerStatus === 'unavailable' && nativeStatus === 'reachable' && (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-primary-500" />
            <span className="text-gray-700">
              WAHA: {t('waha_native_label')}
            </span>
            <button
              onClick={handleRecheck}
              disabled={recheckingInfra}
              className="ml-1 text-xs text-primary-600 hover:text-primary-800 underline disabled:opacity-50 disabled:no-underline"
            >
              {t('check_again')}
            </button>
          </div>
        )}

        {/* Docker not found and no native WAHA — install button */}
        {dockerStatus === 'unavailable' && nativeStatus !== 'reachable' && !installingDocker && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm text-amber-900">
              {t('docker_required_msg')}
            </p>
            <button
              onClick={handleInstallDocker}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
            >
              {t('install_docker')}
            </button>
          </div>
        )}

        {/* Docker installing */}
        {installingDocker && (
          <div className="space-y-2">
            <p className="text-xs text-amber-600 font-medium">{t('installing_docker')}</p>
            <pre className="max-h-40 overflow-y-auto rounded-lg bg-gray-900 p-3 text-xs text-green-400">
              {dockerLog.join('\n') || 'Starting...'}
            </pre>
          </div>
        )}

        {/* WAHA container status — only show when Docker is available */}
        {dockerStatus === 'available' && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${containerStatus === 'running' ? 'bg-primary-500' : containerStatus === 'stopped' ? 'bg-amber-500' : containerStatus === 'not_found' ? 'bg-red-500' : 'bg-gray-400 animate-pulse'}`} />
              <span className="text-gray-700">
                {t('waha_container')}: {containerStatus === 'running' ? t('waha_running') : containerStatus === 'stopped' ? t('waha_stopped') : containerStatus === 'not_found' ? t('waha_not_installed') : t('waha_checking')}
              </span>
              {containerStatus === 'running' && (
                <button onClick={handleStopWaha} disabled={containerAction} className="ml-2 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {t('waha_stop')}
                </button>
              )}
              {containerStatus === 'stopped' && (
                <button onClick={handleStartWaha} disabled={containerAction} className="ml-2 rounded border border-primary-300 px-2 py-0.5 text-xs text-primary-700 hover:bg-primary-50 disabled:opacity-50">
                  {t('waha_start')}
                </button>
              )}
              {containerStatus !== 'checking' && (
                <button
                  onClick={handleRecheck}
                  disabled={recheckingInfra}
                  className="ml-1 text-xs text-primary-600 hover:text-primary-800 underline disabled:opacity-50 disabled:no-underline"
                >
                  {t('check_again')}
                </button>
              )}
            </div>

            {containerStatus === 'not_found' && !installing && (
              <button
                onClick={handleInstallWaha}
                className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
              >
                {t('install_waha')}
              </button>
            )}

            {installing && (
              <div className="space-y-2">
                <p className="text-xs text-primary-600 font-medium">{t('installing_waha')}</p>
                <pre className="max-h-32 overflow-y-auto rounded-lg bg-gray-900 p-3 text-xs text-green-400">
                  {installLog.join('\n') || 'Starting...'}
                </pre>
              </div>
            )}

            {installError && (
              <div className="space-y-2">
                <p className="text-xs text-red-600">Error: {installError}</p>
                <button onClick={handleInstallWaha} className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  {t('waha_retry')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* WAHA URL */}
      <div className="mb-4">
        <label htmlFor="waha_url" className={labelClass}>
          {t('waha_url')}
        </label>
        <input
          id="waha_url"
          type="text"
          value={settings.waha_url || ''}
          onChange={(e) => onUpdate('waha_url', e.target.value)}
          placeholder="http://localhost:3008"
          className={inputClass}
        />
      </div>

      {/* Connection status */}
      <div className="mb-4 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
        <span className="text-sm text-gray-700">{statusLabel}</span>
        {status === 'disconnected' && (containerStatus === 'running' || nativeStatus === 'reachable') && (
          <button
            onClick={handleStartSession}
            disabled={startingSession}
            className="ml-2 rounded-xl bg-primary-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
          >
            {startingSession ? t('waha_checking') : t('link_whatsapp')}
          </button>
        )}
      </div>

      {/* Dashboard link when connected */}
      {status === 'connected' && wahaUrl && (
        <a
          href={`${wahaUrl}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-block text-sm font-medium text-primary-600 underline hover:text-primary-700"
        >
          {t('open_waha_dashboard')}
        </a>
      )}

      {/* QR code when pending */}
      {status === 'qr_pending' && (
        <div className="mb-4 flex items-start gap-4">
          <div className="flex-shrink-0">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt="WhatsApp QR Code"
                className="max-w-xs rounded-lg border border-gray-200"
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            <p className="font-medium">{t('scan_whatsapp')}</p>
            <p className="mt-1 text-xs text-gray-400">
              {t('scan_instruction')}
            </p>
          </div>
        </div>
      )}

      {/* WhatsApp Groups section — only when connected */}
      {status === 'connected' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">
            {t('whatsapp_groups')}
          </h3>

          {groups.length === 0 ? (
            <p className="mb-3 text-xs text-gray-400">
              {t('no_groups')}
            </p>
          ) : (
            <ul className="mb-3 space-y-2">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm"
                >
                  <span className="text-gray-700">
                    {g.subject || g.name || g.id}
                  </span>
                  <button
                    onClick={() => handleLeaveGroup(g.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    {t('leave')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Join by invite link */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteLink}
              onChange={(e) => setInviteLink(e.target.value)}
              placeholder={t('paste_invite_link')}
              className={inputClass}
            />
            <button
              onClick={handleJoinGroup}
              disabled={joining || !inviteLink.trim()}
              className="whitespace-nowrap rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {joining ? t('joining') : t('join')}
            </button>
          </div>

          {groupMsg && (
            <p
              className={`mt-2 text-xs font-medium ${
                groupMsg.includes('Failed')
                  ? 'text-red-600'
                  : 'text-primary-600'
              }`}
            >
              {groupMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
