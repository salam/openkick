'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';
import { formatDateTime } from '@/lib/date';

/* ── Types ──────────────────────────────────────────────────────────── */

interface ChecklistItem {
  id: number;
  instance_id: number;
  label: string;
  sort_order: number;
  completed: number;
  completed_at: string | null;
  completed_by: number | null;
  is_custom: number;
}

interface ChecklistInstance {
  id: number;
  template_id: number | null;
  event_id: number | null;
  semester: string;
  status: string;
  type: string | null;
  itemCount: number;
  completedCount: number;
}

interface ChecklistFull extends ChecklistInstance {
  items: ChecklistItem[];
}

type TabType = 'admin' | 'training' | 'tournament';

/* ── Helpers ────────────────────────────────────────────────────────── */

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';

/* ── Component ──────────────────────────────────────────────────────── */

export default function ChecklistsPage() {
  const [tab, setTab] = useState<TabType>('admin');
  const [instances, setInstances] = useState<ChecklistInstance[]>([]);
  const [expanded, setExpanded] = useState<Record<number, ChecklistFull>>({});
  const [loading, setLoading] = useState(true);
  const [, setLang] = useState(() => getLanguage());

  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await apiFetch<ChecklistInstance[]>(
          `/api/admin/checklists?type=${tab}`
        );
        setInstances(data);
        const fulls: Record<number, ChecklistFull> = {};
        for (const inst of data) {
          try {
            const full = await apiFetch<ChecklistFull>(
              `/api/admin/checklists/${inst.id}`
            );
            fulls[inst.id] = full;
          } catch { /* skip */ }
        }
        setExpanded(fulls);
      } catch {
        setInstances([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tab]);

  async function toggleItem(instanceId: number, item: ChecklistItem) {
    const full = expanded[instanceId];
    if (!full) return;
    const newCompleted = item.completed ? false : true;
    setExpanded({
      ...expanded,
      [instanceId]: {
        ...full,
        items: full.items.map((i) =>
          i.id === item.id ? { ...i, completed: newCompleted ? 1 : 0 } : i
        ),
      },
    });
    try {
      await apiFetch(`/api/admin/checklists/${instanceId}/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: newCompleted }),
      });
    } catch {
      setExpanded({
        ...expanded,
        [instanceId]: full,
      });
    }
  }

  async function addItem(instanceId: number, label: string) {
    const full = expanded[instanceId];
    if (!full) return;
    try {
      const item = await apiFetch<ChecklistItem>(
        `/api/admin/checklists/${instanceId}/items`,
        {
          method: 'POST',
          body: JSON.stringify({ label, sortOrder: full.items.length + 1 }),
        }
      );
      setExpanded({
        ...expanded,
        [instanceId]: { ...full, items: [...full.items, item] },
      });
    } catch { /* ignore */ }
  }

  async function deleteItem(instanceId: number, itemId: number) {
    const full = expanded[instanceId];
    if (!full) return;
    try {
      await apiFetch(`/api/admin/checklists/${instanceId}/items/${itemId}`, {
        method: 'DELETE',
      });
      setExpanded({
        ...expanded,
        [instanceId]: {
          ...full,
          items: full.items.filter((i) => i.id !== itemId),
        },
      });
    } catch { /* ignore */ }
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'admin', label: t('checklist_admin') },
    { key: 'training', label: t('checklist_tab_training') },
    { key: 'tournament', label: t('checklist_tab_tournament') },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('checklists')}</h1>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2.5 text-sm font-medium transition ${
              tab === tb.key
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : instances.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <p className="text-sm text-gray-500">{t('checklist_no_checklists')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {instances.map((inst) => {
            const full = expanded[inst.id];
            if (!full) return null;
            const completedCount = full.items.filter((i) => i.completed).length;
            return (
              <ChecklistCard
                key={inst.id}
                instance={full}
                completedCount={completedCount}
                onToggle={(item) => toggleItem(inst.id, item)}
                onAdd={(label) => addItem(inst.id, label)}
                onDelete={(itemId) => deleteItem(inst.id, itemId)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Checklist Card sub-component ────────────────────────────────── */

function ChecklistCard({
  instance,
  completedCount,
  onToggle,
  onAdd,
  onDelete,
}: {
  instance: ChecklistFull;
  completedCount: number;
  onToggle: (item: ChecklistItem) => void;
  onAdd: (label: string) => void;
  onDelete: (itemId: number) => void;
}) {
  const [newLabel, setNewLabel] = useState('');

  function handleAdd() {
    if (!newLabel.trim()) return;
    onAdd(newLabel.trim());
    setNewLabel('');
  }

  return (
    <div className={cardClass}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">
          {instance.semester}
        </h2>
        <span className="text-xs text-gray-500">
          {completedCount}/{instance.items.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-primary-500 transition-all"
          style={{
            width: instance.items.length > 0
              ? `${(completedCount / instance.items.length) * 100}%`
              : '0%',
          }}
        />
      </div>

      {/* Items */}
      {instance.items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{t('checklist_no_items')}</p>
      ) : (
        <ul className="space-y-1">
          {instance.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-1.5">
              <button onClick={() => onToggle(item)} className="flex-shrink-0">
                {item.completed ? (
                  <svg className="h-5 w-5 text-primary-500" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center">
                    <span className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  </span>
                )}
              </button>
              <span className={`flex-1 text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                {item.is_custom ? item.label : (t(item.label) || item.label)}
              </span>
              {item.is_custom === 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {t('checklist_custom')}
                  </span>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-gray-300 hover:text-red-400"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {item.completed && item.completed_at && (
                <span className="text-[10px] text-gray-400">
                  {formatDateTime(item.completed_at!)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add item */}
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('checklist_add_item')}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newLabel.trim()}
          className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-40"
        >
          {t('checklist_add')}
        </button>
      </div>
    </div>
  );
}
