'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function InviteTeamForm() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('coach');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState('');

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
        body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole }),
      });
      setUsers((prev) => [...prev, { ...newUser, createdAt: new Date().toISOString() }]);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('coach');
      setMsg('Invite sent successfully.');
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setInviting(false);
    }
    setTimeout(() => setMsg(''), 5000);
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">
        Invite Team Members
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Add coaches or other admins to help manage the club.
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="invite_name" className={labelClass}>Name</label>
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
          <label htmlFor="invite_email" className={labelClass}>Email</label>
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
          <label htmlFor="invite_role" className={labelClass}>Role</label>
          <select
            id="invite_role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className={inputClass}
          >
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          onClick={handleInvite}
          disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50"
        >
          {inviting ? 'Sending...' : 'Send Invite'}
        </button>
      </div>

      {msg && (
        <p
          className={`mt-3 text-sm font-medium ${
            msg.includes('Failed') || msg.includes('error') ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {msg}
        </p>
      )}

      {/* Existing team members */}
      {!loadingUsers && users.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">Team Members</h3>
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-900">{u.name}</span>
                  <span className="ml-2 text-xs text-gray-500">{u.email}</span>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 capitalize">
                  {u.role}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loadingUsers && (
        <div className="mt-4 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      )}
    </div>
  );
}
