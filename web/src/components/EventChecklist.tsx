'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';

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
  items: ChecklistItem[];
}

interface Props {
  eventId: number;
  defaultOpen?: boolean;
}

export default function EventChecklist({ eventId, defaultOpen = false }: Props) {
  const [checklist, setChecklist] = useState<ChecklistInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(defaultOpen);
  const [newItemLabel, setNewItemLabel] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const instances = await apiFetch<ChecklistInstance[]>(
          `/api/admin/checklists?eventId=${eventId}`
        );
        if (instances.length > 0) {
          const full = await apiFetch<ChecklistInstance>(
            `/api/admin/checklists/${instances[0].id}`
          );
          setChecklist(full);
        }
      } catch {
        // Not authorized or no checklist — hide widget
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  async function toggleItem(item: ChecklistItem) {
    if (!checklist) return;
    const newCompleted = item.completed ? false : true;
    setChecklist({
      ...checklist,
      items: checklist.items.map((i) =>
        i.id === item.id ? { ...i, completed: newCompleted ? 1 : 0 } : i
      ),
    });
    try {
      await apiFetch(`/api/admin/checklists/${checklist.id}/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: newCompleted }),
      });
    } catch {
      setChecklist({
        ...checklist,
        items: checklist.items.map((i) =>
          i.id === item.id ? { ...i, completed: item.completed } : i
        ),
      });
    }
  }

  async function addItem() {
    if (!checklist || !newItemLabel.trim()) return;
    try {
      const item = await apiFetch<ChecklistItem>(
        `/api/admin/checklists/${checklist.id}/items`,
        {
          method: 'POST',
          body: JSON.stringify({
            label: newItemLabel.trim(),
            sortOrder: checklist.items.length + 1,
          }),
        }
      );
      setChecklist({ ...checklist, items: [...checklist.items, item] });
      setNewItemLabel('');
    } catch {
      // ignore
    }
  }

  async function deleteItem(itemId: number) {
    if (!checklist) return;
    try {
      await apiFetch(`/api/admin/checklists/${checklist.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      setChecklist({
        ...checklist,
        items: checklist.items.filter((i) => i.id !== itemId),
      });
    } catch {
      // ignore
    }
  }

  if (loading || !checklist) return null;

  const completedCount = checklist.items.filter((i) => i.completed).length;
  const totalCount = checklist.items.length;

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">{t('checklist')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {completedCount}/{totalCount}
          </span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-4">
          {checklist.items.length === 0 ? (
            <p className="py-3 text-sm text-gray-400 italic">{t('checklist_no_items')}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {checklist.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <button
                    onClick={() => toggleItem(item)}
                    className="flex-shrink-0"
                  >
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
                        onClick={() => deleteItem(item.id)}
                        className="text-gray-300 hover:text-red-400"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add custom item */}
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder={t('checklist_add_item')}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              onClick={addItem}
              disabled={!newItemLabel.trim()}
              className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-40"
            >
              {t('checklist_add')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
