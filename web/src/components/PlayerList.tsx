'use client';

import { useEffect, useState } from 'react';
import { t, getLanguage } from '@/lib/i18n';

export interface Guardian {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  language: string;
}

export interface Player {
  id: number;
  name: string;
  yearOfBirth: number | null;
  category: string | null;
  position: string | null;
  lastNameInitial: string | null;
  notes: string | null;
  guardians?: Guardian[];
}

interface PlayerListProps {
  players: Player[];
  onEdit: (player: Player) => void;
  onDelete: (player: Player) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  G: 'bg-pink-100 text-pink-800',
  F: 'bg-purple-100 text-purple-800',
  E: 'bg-blue-100 text-blue-800',
  'D-7': 'bg-cyan-100 text-cyan-800',
  'D-9': 'bg-cyan-200 text-cyan-900',
  C: 'bg-green-100 text-green-800',
  B: 'bg-orange-100 text-orange-800',
  A: 'bg-red-100 text-red-800',
};

const POSITION_KEYS: Record<string, string> = {
  goalkeeper: 'pos_goalkeeper',
  defender: 'pos_defender',
  midfielder: 'pos_midfielder',
  forward: 'pos_forward',
};

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-400">—</span>;
  const colors = CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors}`}>
      {category}
    </span>
  );
}

function formatPosition(position: string | null): string {
  if (!position) return '—';
  const key = POSITION_KEYS[position];
  return key ? t(key) : position.charAt(0).toUpperCase() + position.slice(1);
}

export default function PlayerList({ players, onEdit, onDelete }: PlayerListProps) {
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const [search, setSearch] = useState('');

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      {/* Search input */}
      <div className="mb-4">
        <input
          type="text"
          placeholder={t('search_players')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          {players.length === 0 ? t('no_players_yet') : t('no_players_match')}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="pb-3 pr-4 font-medium">{t('name')}</th>
                  <th className="pb-3 pr-4 font-medium">{t('year_of_birth')}</th>
                  <th className="pb-3 pr-4 font-medium">{t('category')}</th>
                  <th className="pb-3 pr-4 font-medium">{t('position')}</th>
                  <th className="pb-3 pr-4 font-medium">{t('contact')}</th>
                  <th className="pb-3 font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((player) => (
                  <tr
                    key={player.id}
                    className="border-b border-gray-100 transition-colors hover:bg-gray-50"
                  >
                    <td className="py-3 pr-4 font-medium text-gray-900">{player.name}</td>
                    <td className="py-3 pr-4 text-gray-600">{player.yearOfBirth ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <CategoryBadge category={player.category} />
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{formatPosition(player.position)}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {player.guardians && player.guardians.length > 0 ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          {player.guardians.map((g) => (
                            <span key={g.id}>
                              {g.name || t('parent')}: {g.phone}
                              {g.email && ` / ${g.email}`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEdit(player)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                        >
                          {t('edit')}
                        </button>
                        <button
                          onClick={() => onDelete(player)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {filtered.map((player) => (
              <div
                key={player.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-gray-900">{player.name}</span>
                  <CategoryBadge category={player.category} />
                </div>
                <div className="mb-2 flex gap-4 text-xs text-gray-500">
                  {player.yearOfBirth && <span>{t('born')} {player.yearOfBirth}</span>}
                  {player.position && <span>{formatPosition(player.position)}</span>}
                </div>
                {player.guardians && player.guardians.length > 0 && (
                  <div className="mb-3 flex flex-col gap-0.5 text-xs text-gray-500">
                    {player.guardians.map((g) => (
                      <span key={g.id}>
                        {g.name || t('parent')}: {g.phone}
                        {g.email && ` / ${g.email}`}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(player)}
                    className="rounded-lg bg-primary-50 px-3 py-1 text-xs font-medium text-primary-600 hover:bg-primary-100"
                  >
                    {t('edit')}
                  </button>
                  <button
                    onClick={() => onDelete(player)}
                    className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    {t('delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
