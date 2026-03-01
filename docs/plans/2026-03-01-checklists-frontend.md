# Checklists Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dashboard checklists page with tabbed view (Admin/Training/Tournament) and a collapsible checklist widget embedded in event detail pages.

**Architecture:** A single client-component page at `/dashboard/checklists/page.tsx` for the admin view. A reusable `<EventChecklist>` component at `web/src/components/EventChecklist.tsx` embedded into `EventDetailClient.tsx` for contextual checklists on training/tournament events.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, custom i18n (`t()` from `@/lib/i18n`), `apiFetch` from `@/lib/api`

---

### Task 1: i18n Translation Keys

**Files:**
- Modify: `web/src/lib/i18n.ts`

**Step 1: Add German keys**

At the end of the `de:` block (before line 626 `},`), add:

```ts
    // ── Checklists ─────────────────────────────────────────────────────
    checklists: 'Checklisten',
    checklist: 'Checkliste',
    checklist_admin: 'Verwaltung',
    checklist_training: 'Training',
    checklist_tournament: 'Turnier',
    checklist_progress: '{0}/{1} erledigt',
    checklist_add_item: 'Aufgabe hinzufuegen...',
    checklist_add: 'Hinzufuegen',
    checklist_custom: 'Eigene',
    checklist_no_items: 'Keine Checklisten-Eintraege vorhanden.',
    checklist_no_checklists: 'Keine Checklisten vorhanden.',
    checklist_completed_by: 'Erledigt von {0} am {1}',
    checklist_semester: 'Semester',
    checklist_delete_confirm: 'Eintrag loeschen?',
```

**Step 2: Add English keys**

At the end of the `en:` block (before its closing `},`), add:

```ts
    // ── Checklists ─────────────────────────────────────────────────────
    checklists: 'Checklists',
    checklist: 'Checklist',
    checklist_admin: 'Admin',
    checklist_training: 'Training',
    checklist_tournament: 'Tournament',
    checklist_progress: '{0}/{1} done',
    checklist_add_item: 'Add item...',
    checklist_add: 'Add',
    checklist_custom: 'Custom',
    checklist_no_items: 'No checklist items yet.',
    checklist_no_checklists: 'No checklists yet.',
    checklist_completed_by: 'Completed by {0} on {1}',
    checklist_semester: 'Semester',
    checklist_delete_confirm: 'Delete item?',
```

**Step 3: Add French keys**

At the end of the `fr:` block (before its closing `},`), add:

```ts
    // ── Checklists ─────────────────────────────────────────────────────
    checklists: 'Listes de controle',
    checklist: 'Liste de controle',
    checklist_admin: 'Administration',
    checklist_training: 'Entrainement',
    checklist_tournament: 'Tournoi',
    checklist_progress: '{0}/{1} termines',
    checklist_add_item: 'Ajouter une tache...',
    checklist_add: 'Ajouter',
    checklist_custom: 'Personnalise',
    checklist_no_items: 'Aucun element de liste.',
    checklist_no_checklists: 'Aucune liste de controle.',
    checklist_completed_by: 'Termine par {0} le {1}',
    checklist_semester: 'Semestre',
    checklist_delete_confirm: 'Supprimer cet element ?',
```

**Step 4: Verify build**

Run: `cd web && npx next build 2>&1 | tail -5` (or `npx tsc --noEmit`)
Expected: No errors related to i18n

**Step 5: Commit**

```bash
git restore --staged :/ && git add web/src/lib/i18n.ts && git commit -m "feat(checklists): add i18n translation keys (de/en/fr)"
```

---

### Task 2: Reusable EventChecklist Component

**Files:**
- Create: `web/src/components/EventChecklist.tsx`

**Step 1: Create the component**

Create `web/src/components/EventChecklist.tsx`:

```tsx
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
    // Optimistic update
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
      // Revert on failure
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
      // ignore — probably a template item
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
                      <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center">
                        <span className="h-4 w-4 rounded-full border-2 border-gray-300" />
                      </span>
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {item.label}
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
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              onClick={addItem}
              disabled={!newItemLabel.trim()}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {t('checklist_add')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
```

**Step 2: Verify build**

Run: `cd web && npx tsc --noEmit 2>&1 | grep -i checklist`
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add web/src/components/EventChecklist.tsx && git commit -m "feat(checklists): add reusable EventChecklist component"
```

---

### Task 3: Embed EventChecklist in Event Detail Page

**Files:**
- Modify: `web/src/app/events/[id]/EventDetailClient.tsx`

**Step 1: Add import**

After the existing imports (around line 8), add:

```tsx
import EventChecklist from '@/components/EventChecklist';
```

**Step 2: Add the widget to the page**

After the attendance section (after the `{/* ── Coach: Attendance table ── */}` section around line 663), and before the `{/* ── Coach: Team assignment ── */}` section, add:

```tsx
      {/* ── Coach: Event checklist ── */}
      {isCoach && ['training', 'tournament'].includes(event.type) && (
        <EventChecklist eventId={event.id} />
      )}
```

**Step 3: Verify build**

Run: `cd web && npx tsc --noEmit 2>&1 | grep -i checklist`
Expected: No errors

**Step 4: Commit**

```bash
git restore --staged :/ && git add "web/src/app/events/[id]/EventDetailClient.tsx" && git commit -m "feat(checklists): embed checklist widget in event detail page"
```

---

### Task 4: Dashboard Checklists Page

**Files:**
- Create: `web/src/app/dashboard/checklists/page.tsx`

**Step 1: Create the page**

Create `web/src/app/dashboard/checklists/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { t, getLanguage } from '@/lib/i18n';

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

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

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
        // Auto-expand all
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
    // Optimistic
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
      // Revert
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
    { key: 'training', label: t('checklist_training') },
    { key: 'tournament', label: t('checklist_tournament') },
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
                ? 'border-b-2 border-emerald-500 text-emerald-600'
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
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
          className="h-1.5 rounded-full bg-emerald-500 transition-all"
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
                  <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center">
                    <span className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  </span>
                )}
              </button>
              <span className={`flex-1 text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                {item.label}
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
                  {formatDate(item.completed_at)}
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
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newLabel.trim()}
          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          {t('checklist_add')}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd web && npx tsc --noEmit 2>&1 | grep -i checklist`
Expected: No errors

**Step 3: Test manually**

Open http://localhost:3000/dashboard/checklists/ in browser while logged in as admin/coach.
Expected: Tab bar shows, Admin tab loads semester checklists.

**Step 4: Commit**

```bash
git restore --staged :/ && git add web/src/app/dashboard/checklists/page.tsx && git commit -m "feat(checklists): add dashboard checklists page with tabbed view"
```

---

### Task 5: Add Checklists Link to Dashboard Navigation

**Files:**
- Modify: `web/src/components/Navbar.tsx` (or wherever the dashboard nav links are defined)

**Step 1: Find and read the Navbar**

The Navbar component is at `web/src/components/Navbar.tsx`. Look for the array of nav links and add a "Checklists" entry pointing to `/dashboard/checklists/`.

Add after the existing dashboard-area links:

```tsx
{ href: '/dashboard/checklists/', label: t('checklists') },
```

**Step 2: Verify build and test**

Run: `cd web && npx tsc --noEmit`
Expected: No errors. Navbar shows "Checklists" link.

**Step 3: Commit**

```bash
git restore --staged :/ && git add web/src/components/Navbar.tsx && git commit -m "feat(checklists): add checklists link to dashboard nav"
```

---

### Task 6: Update FEATURES.md and RELEASE_NOTES.md

**Files:**
- Modify: `FEATURES.md`
- Modify: `RELEASE_NOTES.md`

**Step 1: Update FEATURES.md**

Change the checklist frontend item from `[ ]` to `[x]`:

```markdown
- [x] Frontend UI — dashboard page with tabbed view + event detail widget
```

**Step 2: Update RELEASE_NOTES.md**

Add to the current version section:

```markdown
* Checklists dashboard page with Admin/Training/Tournament tabs
* Collapsible checklist widget on training and tournament event detail pages
* Add custom items, toggle completion, delete custom items
```

**Step 3: Commit**

```bash
git restore --staged :/ && git add FEATURES.md RELEASE_NOTES.md && git commit -m "docs: update FEATURES.md and RELEASE_NOTES.md for checklists frontend"
```
