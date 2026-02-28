'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { SettingsFormProps } from './ClubProfileForm';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

type ConnectionStatus = 'connected' | 'qr_pending' | 'disconnected' | 'checking';

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
  const [groupMsg, setGroupMsg] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wahaUrl = settings.waha_url || '';

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
            process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
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
      setGroupMsg('Joined group successfully.');
      loadGroups();
    } catch (err) {
      setGroupMsg(
        err instanceof Error ? err.message : 'Failed to join group.',
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
      setGroupMsg('Failed to leave group.');
      setTimeout(() => setGroupMsg(''), 4000);
    }
  }

  // ── Status indicator ────────────────────────────────────────────
  const statusDot =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'qr_pending'
        ? 'bg-amber-500'
        : status === 'checking'
          ? 'bg-gray-400 animate-pulse'
          : 'bg-red-500';

  const statusLabel =
    status === 'connected'
      ? `Connected${pushName ? ` as "${pushName}"` : ''}`
      : status === 'qr_pending'
        ? 'Waiting for QR scan...'
        : status === 'checking'
          ? 'Checking...'
          : 'Disconnected';

  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        WAHA Configuration
      </h2>

      {/* Info box */}
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1.5">
        <p className="font-medium">What is WAHA?</p>
        <p>
          WAHA (WhatsApp HTTP API) is a self-hosted service that connects
          OpenKick to WhatsApp. It runs as a Docker container on your server
          and provides the bridge so the bot can receive and send messages.
        </p>
      </div>

      {/* WAHA URL */}
      <div className="mb-4">
        <label htmlFor="waha_url" className={labelClass}>
          WAHA URL
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
      </div>

      {/* Dashboard link when connected */}
      {status === 'connected' && wahaUrl && (
        <a
          href={`${wahaUrl}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-block text-sm font-medium text-emerald-600 underline hover:text-emerald-700"
        >
          Open WAHA Dashboard &rarr;
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
                className="h-48 w-48 rounded-lg border border-gray-200"
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            <p className="font-medium">Scan with WhatsApp</p>
            <p className="mt-1 text-xs text-gray-400">
              Open WhatsApp on your phone, go to Settings &gt; Linked Devices,
              and scan this QR code to connect.
            </p>
          </div>
        </div>
      )}

      {/* WhatsApp Groups section — only when connected */}
      {status === 'connected' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">
            WhatsApp Groups
          </h3>

          {groups.length === 0 ? (
            <p className="mb-3 text-xs text-gray-400">
              No groups joined yet.
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
                    Leave
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
              placeholder="Paste WhatsApp group invite link..."
              className={inputClass}
            />
            <button
              onClick={handleJoinGroup}
              disabled={joining || !inviteLink.trim()}
              className="whitespace-nowrap rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>

          {groupMsg && (
            <p
              className={`mt-2 text-xs font-medium ${
                groupMsg.includes('Failed')
                  ? 'text-red-600'
                  : 'text-emerald-600'
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
