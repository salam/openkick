'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import PlayerList, { type Player } from '@/components/PlayerList';

const SFV_CATEGORIES = ['G', 'F', 'E', 'D-7', 'D-9', 'C', 'B', 'A'] as const;
const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward'] as const;

interface Guardian {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  language: string;
}

interface PlayerDetail extends Player {
  guardians?: Guardian[];
}

interface PlayerFormData {
  name: string;
  yearOfBirth: string;
  category: string;
  position: string;
  notes: string;
}

const emptyForm: PlayerFormData = {
  name: '',
  yearOfBirth: '',
  category: '',
  position: '',
  notes: '',
};

/** Compute the SFV category from birth year (client-side mirror of server logic). */
function computeCategory(yearOfBirth: number): string {
  const now = new Date();
  const seasonYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const age = seasonYear - yearOfBirth;

  const ranges: [string, number, number][] = [
    ['G', 0, 5],
    ['F', 6, 7],
    ['E', 8, 9],
    ['D-7', 10, 10],
    ['D-9', 11, 11],
    ['C', 12, 13],
    ['B', 14, 15],
    ['A', 16, 17],
  ];

  for (const [name, min, max] of ranges) {
    if (age >= min && age <= max) return name;
  }
  return age <= 5 ? 'G' : 'A';
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerDetail | null>(null);
  const [form, setForm] = useState<PlayerFormData>(emptyForm);
  const [autoCategory, setAutoCategory] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Guardian linking
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [linkingGuardian, setLinkingGuardian] = useState(false);

  // Delete confirmation
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);

  const fetchPlayers = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch<Player[]>('/api/players');
      setPlayers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load players');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Recompute auto category when yearOfBirth changes
  useEffect(() => {
    const yob = parseInt(form.yearOfBirth, 10);
    if (!isNaN(yob) && yob > 1900 && yob <= new Date().getFullYear()) {
      setAutoCategory(computeCategory(yob));
    } else {
      setAutoCategory('');
    }
  }, [form.yearOfBirth]);

  function openAddModal() {
    setEditingPlayer(null);
    setForm(emptyForm);
    setGuardianName('');
    setGuardianPhone('');
    setModalOpen(true);
  }

  async function openEditModal(player: Player) {
    try {
      const detail = await apiFetch<PlayerDetail>(`/api/players/${player.id}`);
      setEditingPlayer(detail);
      setForm({
        name: detail.name,
        yearOfBirth: detail.yearOfBirth?.toString() ?? '',
        category: detail.category ?? '',
        position: detail.position ?? '',
        notes: detail.notes ?? '',
      });
      setGuardianName('');
      setGuardianPhone('');
      setModalOpen(true);
    } catch {
      setError('Failed to load player details');
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);

    const yob = parseInt(form.yearOfBirth, 10);
    const computed = !isNaN(yob) ? computeCategory(yob) : null;
    const categoryToSend = form.category && form.category !== computed ? form.category : null;

    const body = {
      name: form.name.trim(),
      yearOfBirth: !isNaN(yob) ? yob : null,
      position: form.position || null,
      notes: form.notes.trim() || null,
      category: categoryToSend,
    };

    try {
      if (editingPlayer) {
        await apiFetch(`/api/players/${editingPlayer.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/players', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setModalOpen(false);
      await fetchPlayers();
    } catch {
      setError('Failed to save player');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingPlayer) return;
    try {
      await apiFetch(`/api/players/${deletingPlayer.id}`, { method: 'DELETE' });
      setDeletingPlayer(null);
      await fetchPlayers();
    } catch {
      setError('Failed to delete player');
    }
  }

  async function handleLinkGuardian() {
    if (!editingPlayer || !guardianPhone.trim()) return;
    setLinkingGuardian(true);
    try {
      // Create guardian first
      const guardian = await apiFetch<{ id: number }>('/api/guardians', {
        method: 'POST',
        body: JSON.stringify({
          phone: guardianPhone.trim(),
          name: guardianName.trim() || null,
        }),
      });
      // Link to player
      await apiFetch(`/api/guardians/${guardian.id}/players`, {
        method: 'POST',
        body: JSON.stringify({ playerId: editingPlayer.id }),
      });
      // Refresh detail
      const detail = await apiFetch<PlayerDetail>(`/api/players/${editingPlayer.id}`);
      setEditingPlayer(detail);
      setGuardianName('');
      setGuardianPhone('');
    } catch {
      setError('Failed to link guardian');
    } finally {
      setLinkingGuardian(false);
    }
  }

  return (
    <AuthGuard>
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Players</h1>
          <button
            onClick={openAddModal}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            Add Player
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <p className="py-8 text-center text-gray-500">Loading players...</p>
        ) : (
          <PlayerList
            players={players}
            onEdit={openEditModal}
            onDelete={(p) => setDeletingPlayer(p)}
          />
        )}

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-bold text-gray-900">
                {editingPlayer ? 'Edit Player' : 'Add Player'}
              </h2>

              <div className="flex flex-col gap-4">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                {/* Year of Birth */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Year of Birth *
                  </label>
                  <input
                    type="number"
                    value={form.yearOfBirth}
                    onChange={(e) => setForm({ ...form, yearOfBirth: e.target.value })}
                    placeholder="e.g. 2015"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    min={1990}
                    max={new Date().getFullYear()}
                    required
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Category
                    {autoCategory && (
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        (auto: {autoCategory})
                      </span>
                    )}
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">
                      {autoCategory ? `Auto (${autoCategory})` : 'Select category'}
                    </option>
                    {SFV_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Position */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Position</label>
                  <select
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">None</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos.charAt(0).toUpperCase() + pos.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Guardian linking (edit mode only) */}
                {editingPlayer && (
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Guardians</h3>

                    {editingPlayer.guardians && editingPlayer.guardians.length > 0 ? (
                      <ul className="mb-3 flex flex-col gap-1">
                        {editingPlayer.guardians.map((g) => (
                          <li
                            key={g.id}
                            className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5 text-sm"
                          >
                            <span className="font-medium text-gray-800">
                              {g.name || 'Unnamed'}
                            </span>
                            <span className="text-gray-500">{g.phone}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mb-3 text-xs text-gray-500">No guardians linked yet.</p>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                        placeholder="Guardian name"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <input
                        type="tel"
                        value={guardianPhone}
                        onChange={(e) => setGuardianPhone(e.target.value)}
                        placeholder="Phone *"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <button
                        onClick={handleLinkGuardian}
                        disabled={!guardianPhone.trim() || linkingGuardian}
                        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {linkingGuardian ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name.trim() || saving}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingPlayer ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {deletingPlayer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
              <h2 className="mb-2 text-lg font-bold text-gray-900">Delete Player</h2>
              <p className="mb-4 text-sm text-gray-600">
                Are you sure you want to delete{' '}
                <span className="font-medium">{deletingPlayer.name}</span>? This action cannot be
                undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingPlayer(null)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
