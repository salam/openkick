'use client';

import { useState } from 'react';

export interface Player {
  id: number;
  name: string;
  yearOfBirth: number | null;
  category: string | null;
  position: string | null;
  notes: string | null;
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
  return position.charAt(0).toUpperCase() + position.slice(1);
}

export default function PlayerList({ players, onEdit, onDelete }: PlayerListProps) {
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
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          {players.length === 0 ? 'No players yet. Add your first player!' : 'No players match your search.'}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Year of Birth</th>
                  <th className="pb-3 pr-4 font-medium">Category</th>
                  <th className="pb-3 pr-4 font-medium">Position</th>
                  <th className="pb-3 font-medium">Actions</th>
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
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEdit(player)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(player)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
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
                <div className="mb-3 flex gap-4 text-xs text-gray-500">
                  {player.yearOfBirth && <span>Born {player.yearOfBirth}</span>}
                  {player.position && <span>{formatPosition(player.position)}</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(player)}
                    className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(player)}
                    className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    Delete
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
