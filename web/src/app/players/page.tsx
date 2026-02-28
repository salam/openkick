'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';
import PlayerList, { type Player } from '@/components/PlayerList';

const SFV_CATEGORIES = ['G', 'F', 'E', 'D-7', 'D-9', 'C', 'B', 'A'] as const;
const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward'] as const;

const POSITION_KEYS: Record<string, string> = {
  goalkeeper: 'pos_goalkeeper',
  defender: 'pos_defender',
  midfielder: 'pos_midfielder',
  forward: 'pos_forward',
};

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
  lastNameInitial: string;
  notes: string;
}

const emptyForm: PlayerFormData = {
  name: '',
  yearOfBirth: '',
  category: '',
  position: '',
  lastNameInitial: '',
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
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

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
      setError(err instanceof Error ? err.message : t('failed_load_players'));
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
        lastNameInitial: detail.lastNameInitial ?? '',
        notes: detail.notes ?? '',
      });
      setGuardianName('');
      setGuardianPhone('');
      setModalOpen(true);
    } catch {
      setError(t('failed_load_details'));
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
      lastNameInitial: form.lastNameInitial.trim() || null,
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
      setError(t('failed_save_player'));
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
      setError(t('failed_delete_player'));
    }
  }

  async function handleLinkGuardian() {
    if (!editingPlayer || !guardianPhone.trim()) return;
    setLinkingGuardian(true);
    try {
      const guardian = await apiFetch<{ id: number }>('/api/guardians', {
        method: 'POST',
        body: JSON.stringify({
          phone: guardianPhone.trim(),
          name: guardianName.trim() || null,
        }),
      });
      await apiFetch(`/api/guardians/${guardian.id}/players`, {
        method: 'POST',
        body: JSON.stringify({ playerId: editingPlayer.id }),
      });
      const detail = await apiFetch<PlayerDetail>(`/api/players/${editingPlayer.id}`);
      setEditingPlayer(detail);
      setGuardianName('');
      setGuardianPhone('');
    } catch {
      setError(t('failed_link_guardian'));
    } finally {
      setLinkingGuardian(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('players')}</h1>
        <button
          onClick={openAddModal}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
        >
          {t('add_player')}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <p className="py-8 text-center text-gray-500">{t('loading_players')}</p>
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
              {editingPlayer ? t('edit_player') : t('add_player')}
            </h2>

            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('name')} *</label>
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
                  {t('year_of_birth')} *
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
                  {t('category')}
                  {autoCategory && (
                    <span className="ml-1 text-xs font-normal text-gray-500">
                      ({t('auto')}: {autoCategory})
                    </span>
                  )}
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">
                    {autoCategory ? `${t('auto')} (${autoCategory})` : t('select_category')}
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
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('position')}</label>
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">{t('none')}</option>
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {t(POSITION_KEYS[pos])}
                    </option>
                  ))}
                </select>
              </div>

              {/* Last Name Initial */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('last_name_initial')}
                </label>
                <input
                  type="text"
                  maxLength={1}
                  value={form.lastNameInitial}
                  onChange={(e) => setForm({ ...form, lastNameInitial: e.target.value.toUpperCase() })}
                  placeholder="e.g., M"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t('last_name_initial_hint')}
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('notes')}</label>
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
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('guardians')}</h3>

                  {editingPlayer.guardians && editingPlayer.guardians.length > 0 ? (
                    <ul className="mb-3 flex flex-col gap-1">
                      {editingPlayer.guardians.map((g) => (
                        <li
                          key={g.id}
                          className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5 text-sm"
                        >
                          <span className="font-medium text-gray-800">
                            {g.name || t('unnamed')}
                          </span>
                          <span className="text-gray-500">{g.phone}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-xs text-gray-500">{t('no_guardians')}</p>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder={t('guardian_name')}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <input
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      placeholder={`${t('phone')} *`}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      onClick={handleLinkGuardian}
                      disabled={!guardianPhone.trim() || linkingGuardian}
                      className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {linkingGuardian ? t('adding') : t('add')}
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
                {t('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? t('saving') : editingPlayer ? t('update') : t('create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">{t('delete_player')}</h2>
            <p className="mb-4 text-sm text-gray-600">
              {t('delete_confirm_prefix')}{' '}
              <span className="font-medium">{deletingPlayer.name}</span>{t('delete_confirm_suffix')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingPlayer(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
