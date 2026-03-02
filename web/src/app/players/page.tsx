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

  // Guardian editing
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [guardianEditForm, setGuardianEditForm] = useState({ name: '', phone: '', email: '' });
  const [savingGuardian, setSavingGuardian] = useState(false);

  // Guardian unlink/delete confirmation
  const [unlinkingGuardian, setUnlinkingGuardian] = useState<Guardian | null>(null);
  const [deletingGuardian, setDeletingGuardian] = useState<Guardian | null>(null);

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

  function openEditGuardian(g: Guardian) {
    setEditingGuardian(g);
    setGuardianEditForm({ name: g.name || '', phone: g.phone, email: g.email || '' });
  }

  async function handleUpdateGuardian() {
    if (!editingGuardian || !editingPlayer) return;
    setSavingGuardian(true);
    try {
      await apiFetch(`/api/guardians/${editingGuardian.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: guardianEditForm.name.trim() || null,
          phone: guardianEditForm.phone.trim(),
          email: guardianEditForm.email.trim() || null,
        }),
      });
      const detail = await apiFetch<PlayerDetail>(`/api/players/${editingPlayer.id}`);
      setEditingPlayer(detail);
      setEditingGuardian(null);
    } catch {
      setError(t('failed_update_guardian'));
    } finally {
      setSavingGuardian(false);
    }
  }

  async function handleUnlinkGuardian() {
    if (!unlinkingGuardian || !editingPlayer) return;
    try {
      await apiFetch(`/api/guardians/${unlinkingGuardian.id}/players/${editingPlayer.id}`, {
        method: 'DELETE',
      });
      const detail = await apiFetch<PlayerDetail>(`/api/players/${editingPlayer.id}`);
      setEditingPlayer(detail);
      setUnlinkingGuardian(null);
    } catch {
      setError(t('failed_unlink_guardian'));
    }
  }

  async function handleDeleteGuardian() {
    if (!deletingGuardian || !editingPlayer) return;
    try {
      await apiFetch(`/api/guardians/${deletingGuardian.id}`, { method: 'DELETE' });
      const detail = await apiFetch<PlayerDetail>(`/api/players/${editingPlayer.id}`);
      setEditingPlayer(detail);
      setDeletingGuardian(null);
      await fetchPlayers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('403')) {
        setError(t('delete_guardian_forbidden'));
      } else {
        setError(t('failed_delete_guardian'));
      }
      setDeletingGuardian(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('players')}</h1>
        <button
          onClick={openAddModal}
          className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              {/* Guardian linking (edit mode only) */}
              {editingPlayer && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('guardians')}</h3>

                  {editingPlayer.guardians && editingPlayer.guardians.length > 0 ? (
                    <ul className="mb-3 flex flex-col gap-1">
                      {editingPlayer.guardians.map((g) =>
                        editingGuardian?.id === g.id ? (
                          <li key={g.id} className="flex flex-col gap-2 rounded bg-gray-50 px-3 py-2 text-sm">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={guardianEditForm.name}
                                onChange={(e) => setGuardianEditForm({ ...guardianEditForm, name: e.target.value })}
                                placeholder={t('guardian_name')}
                                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              />
                              <input
                                type="tel"
                                value={guardianEditForm.phone}
                                onChange={(e) => setGuardianEditForm({ ...guardianEditForm, phone: e.target.value })}
                                placeholder={`${t('phone')} *`}
                                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              />
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="email"
                                value={guardianEditForm.email}
                                onChange={(e) => setGuardianEditForm({ ...guardianEditForm, email: e.target.value })}
                                placeholder={t('guardian_email')}
                                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              />
                              <button
                                onClick={handleUpdateGuardian}
                                disabled={!guardianEditForm.phone.trim() || savingGuardian}
                                className="rounded-lg bg-primary-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
                              >
                                {savingGuardian ? t('saving') : t('save')}
                              </button>
                              <button
                                onClick={() => setEditingGuardian(null)}
                                className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                              >
                                {t('cancel')}
                              </button>
                            </div>
                          </li>
                        ) : (
                          <li
                            key={g.id}
                            className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5 text-sm"
                          >
                            <span className="flex-1">
                              <span className="font-medium text-gray-800">
                                {g.name || t('unnamed')}
                              </span>
                              <span className="ml-2 text-gray-500">{g.phone}</span>
                              {g.email && <span className="ml-2 text-gray-400">{g.email}</span>}
                            </span>
                            <button
                              onClick={() => openEditGuardian(g)}
                              className="rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                              title={t('edit_guardian')}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setUnlinkingGuardian(g)}
                              className="rounded p-1 text-gray-400 transition hover:bg-orange-100 hover:text-orange-600"
                              title={t('unlink_guardian')}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeletingGuardian(g)}
                              className="rounded p-1 text-gray-400 transition hover:bg-red-100 hover:text-red-600"
                              title={t('delete_guardian')}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </li>
                        ),
                      )}
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
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <input
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      placeholder={`${t('phone')} *`}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button
                      onClick={handleLinkGuardian}
                      disabled={!guardianPhone.trim() || linkingGuardian}
                      className="rounded-xl bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
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
                className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? t('saving') : editingPlayer ? t('update') : t('create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlink guardian confirmation */}
      {unlinkingGuardian && editingPlayer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">{t('unlink_guardian')}</h2>
            <p className="mb-4 text-sm text-gray-600">
              {t('delete_confirm_prefix')}{' '}
              <span className="font-medium">{unlinkingGuardian.name || unlinkingGuardian.phone}</span>{' '}
              {t('unlink_guardian_confirm')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setUnlinkingGuardian(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleUnlinkGuardian}
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
              >
                {t('unlink_guardian')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete guardian confirmation */}
      {deletingGuardian && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-red-600">{t('delete_guardian')}</h2>
            <p className="mb-4 text-sm text-gray-600">
              <span className="font-medium">{deletingGuardian.name || deletingGuardian.phone}</span>{' '}
              {t('delete_guardian_confirm')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingGuardian(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDeleteGuardian}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                {t('delete_guardian')}
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
