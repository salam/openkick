'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: string;
  hasPassword?: boolean;
  createdAt: string;
}

interface PasswordCheckResult {
  acceptable: boolean;
  reasons: string[];
  zxcvbnScore: number;
  pwnedCount: number;
}

export default function InviteTeamForm() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState('coach');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingPhoneId, setEditingPhoneId] = useState<number | null>(null);
  const [editPhoneValue, setEditPhoneValue] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [checkingPw, setCheckingPw] = useState(false);
  const [pwCheckResult, setPwCheckResult] = useState<PasswordCheckResult | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [showPwCheck, setShowPwCheck] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetch<User[]>('/api/users');
      setUsers(data);
    } catch {
      // not available
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    setMsg('');
    try {
      const newUser = await apiFetch<User>('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ name: inviteName, email: inviteEmail, phone: invitePhone || undefined, role: inviteRole }),
      });
      setUsers((prev) => [...prev, { ...newUser, createdAt: new Date().toISOString() }]);
      setInviteName('');
      setInviteEmail('');
      setInvitePhone('');
      setInviteRole('coach');
      setMsg(t('invite_sent'));
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : t('failed_invite'));
    } finally {
      setInviting(false);
    }
    setTimeout(() => setMsg(''), 5000);
  }

  async function handleSavePhone(userId: number) {
    if (!editPhoneValue.trim()) return;
    setSavingPhone(true);
    try {
      const result = await apiFetch<{ id: number; phone: string }>(`/api/users/${userId}/phone`, {
        method: 'PUT',
        body: JSON.stringify({ phone: editPhoneValue }),
      });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, phone: result.phone } : u));
      setEditingPhoneId(null);
      setEditPhoneValue('');
      setMsg(t('phone_saved'));
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : t('phone_taken'));
    } finally {
      setSavingPhone(false);
    }
    setTimeout(() => setMsg(''), 5000);
  }

  async function handlePasswordCheck() {
    if (!pwInput) return;
    setCheckingPw(true);
    setPwCheckResult(null);
    try {
      const result = await apiFetch<PasswordCheckResult>('/api/users/check-password', {
        method: 'POST',
        body: JSON.stringify({ password: pwInput }),
      });
      setPwCheckResult(result);
    } catch {
      setPwCheckResult(null);
    } finally {
      setCheckingPw(false);
      setPwInput('');
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">
        {t('invite_team')}
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        {t('invite_team_desc')}
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="invite_name" className={labelClass}>{t('name')}</label>
          <input
            id="invite_name"
            type="text"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Jane Doe"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="invite_email" className={labelClass}>{t('email')}</label>
          <input
            id="invite_email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="jane@example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="invite_phone" className={labelClass}>{t('phone')} ({t('optional')})</label>
          <input
            id="invite_phone"
            type="tel"
            value={invitePhone}
            onChange={(e) => setInvitePhone(e.target.value)}
            placeholder="+41 79 123 45 67"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="invite_role" className={labelClass}>{t('role')}</label>
          <select
            id="invite_role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className={inputClass}
          >
            <option value="coach">{t('coach')}</option>
            <option value="admin">{t('admin')}</option>
          </select>
        </div>
        <button
          onClick={handleInvite}
          disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
          className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50"
        >
          {inviting ? t('sending') : t('send_invite')}
        </button>
      </div>

      {msg && (
        <p
          className={`mt-3 text-sm font-medium ${
            msg.includes('Failed') || msg.includes('error') ? 'text-red-600' : 'text-primary-600'
          }`}
        >
          {msg}
        </p>
      )}

      {/* Existing team members */}
      {!loadingUsers && users.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">{t('team_members')}</h3>
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900">{u.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{u.email}</span>
                    {u.phone && (
                      <span className="ml-2 text-xs text-gray-400">{u.phone}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                  {/* Password status badge */}
                  {u.hasPassword === false ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                      {t('password_not_set')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
                      {t('password_status')}
                    </span>
                  )}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 capitalize">
                      {u.role}
                    </span>
                    <button
                      onClick={() => { setEditingPhoneId(editingPhoneId === u.id ? null : u.id); setEditPhoneValue(u.phone || ''); }}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600"
                      title={t('edit_phone')}
                    >
                      {u.phone ? u.phone : t('edit_phone')}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                        <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.05 10.476a.75.75 0 0 0-.188.335l-.758 2.86a.75.75 0 0 0 .918.918l2.86-.758a.75.75 0 0 0 .335-.188l7.963-7.963a1.75 1.75 0 0 0 0-2.475l-.692-.692ZM11.72 3.22a.25.25 0 0 1 .354 0l.692.692a.25.25 0 0 1 0 .354L5.95 11.08l-1.59.422.422-1.59 6.938-6.692Z" />
                      </svg>
                    </button>
                  </div>
                </div>
                {editingPhoneId === u.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="tel"
                      value={editPhoneValue}
                      onChange={(e) => setEditPhoneValue(e.target.value)}
                      placeholder="+41 79 123 45 67"
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleSavePhone(u.id)}
                    />
                    <button
                      onClick={() => handleSavePhone(u.id)}
                      disabled={savingPhone || !editPhoneValue.trim()}
                      className="rounded-lg bg-primary-500 px-3 py-1 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                    >
                      {savingPhone ? '...' : t('save')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Self-check: password strength + HIBP */}
          <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{t('password_check')}</span>
              <button
                onClick={() => { setShowPwCheck(!showPwCheck); setPwCheckResult(null); setPwInput(''); }}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                {showPwCheck ? '×' : t('password_check')}
              </button>
            </div>
            {showPwCheck && (
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  placeholder="Enter your password"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordCheck()}
                />
                <button
                  onClick={handlePasswordCheck}
                  disabled={checkingPw || !pwInput}
                  className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {checkingPw ? t('password_checking') : t('password_check')}
                </button>
              </div>
            )}
            {pwCheckResult && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${pwCheckResult.acceptable ? 'bg-primary-500' : 'bg-red-500'}`} />
                  <span className={`text-sm font-medium ${pwCheckResult.acceptable ? 'text-primary-700' : 'text-red-700'}`}>
                    {pwCheckResult.acceptable ? t('password_strong') : t('password_weak')}
                    {' — '}
                    {t('password_status')}: {pwCheckResult.zxcvbnScore}/4
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${pwCheckResult.pwnedCount === 0 ? 'bg-primary-500' : pwCheckResult.pwnedCount === -1 ? 'bg-gray-400' : 'bg-red-500'}`} />
                  <span className={`text-xs ${pwCheckResult.pwnedCount === 0 ? 'text-primary-600' : pwCheckResult.pwnedCount === -1 ? 'text-gray-500' : 'text-red-600'}`}>
                    HIBP: {pwCheckResult.pwnedCount === 0 ? t('hibp_clean') : pwCheckResult.pwnedCount === -1 ? t('hibp_unknown') : t('hibp_breached')}
                    {pwCheckResult.pwnedCount > 0 && ` (${pwCheckResult.pwnedCount.toLocaleString()}×)`}
                  </span>
                </div>
                {pwCheckResult.reasons.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-red-600">
                    {pwCheckResult.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {loadingUsers && (
        <div className="mt-4 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}
    </div>
  );
}
