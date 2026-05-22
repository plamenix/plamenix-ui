import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  History,
  Loader2,
  Pencil,
  Search,
  Square,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { SqlHighlight } from './SqlHighlight';
import type { HistoryEntry } from './types';

export interface HistoryPanelProps {
  open: boolean;
  /** Label shown in the header — typically the active profile's name. */
  profileLabel: string;
  /** Entries to display, newest first. Pass `null` while loading. */
  entries: HistoryEntry[] | null;
  loading?: boolean;
  onClose: () => void;
  /** Fired when the user picks an entry. The host should drop the SQL
   *  into the editor buffer; the panel closes after. */
  onPick: (sql: string) => void;
  /** Optional clear-all handler. When omitted the Clear button is
   *  hidden. */
  onClear?: () => void;
  /** Optional label setter. When provided each row shows a Pencil
   *  affordance for inline-renaming; pass `null` as the label to clear
   *  the entry's current value. Host applies the change server-side
   *  and is responsible for refreshing `entries` afterwards. */
  onSetLabel?: (id: number, label: string | null) => Promise<void> | void;
  /** Optional per-row delete handler. When provided each row gains a
   *  Trash button; the host removes the entry server-side and updates
   *  the in-panel list optimistically. */
  onDeleteEntry?: (id: number) => Promise<void> | void;
  /** Optional bulk delete handler. When provided the panel surfaces
   *  per-row checkboxes + a master checkbox and a sticky action bar
   *  for the multi-select flow. */
  onDeleteEntries?: (ids: number[]) => Promise<void> | void;
}

/**
 * Per-profile query history viewer. Modal, opened from the command
 * palette or a keyboard shortcut. Browse-and-replay only — the panel
 * never executes SQL itself.
 */
export function HistoryPanel({
  open,
  profileLabel,
  entries,
  loading = false,
  onClose,
  onPick,
  onClear,
  onSetLabel,
  onDeleteEntry,
  onDeleteEntries,
}: HistoryPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [labelBusy, setLabelBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset the query + selection whenever the panel closes so the next
  // open starts from a clean state; auto-focus the search input on
  // open so the user can type immediately without an extra click.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIds(new Set());
      setEditingId(null);
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    if (!entries) return null;
    const q = query.trim().toLowerCase();
    if (q.length === 0) return entries;
    return entries.filter(
      (e) =>
        e.sql.toLowerCase().includes(q) ||
        (e.error && e.error.toLowerCase().includes(q)) ||
        (e.label && e.label.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  // Prune `selectedIds` whenever entries change so a row removed by
  // some other mutation can't leave a dangling selection.
  useEffect(() => {
    if (!entries) return;
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(entries.map((e) => e.id));
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [entries]);

  const filteredIds = useMemo(
    () => (filtered ? filtered.map((e) => e.id) : []),
    [filtered],
  );
  const selectableCount = filteredIds.length;
  const selectedInView = useMemo(
    () => filteredIds.filter((id) => selectedIds.has(id)).length,
    [filteredIds, selectedIds],
  );
  const allInViewSelected =
    selectableCount > 0 && selectedInView === selectableCount;
  const someInViewSelected = selectedInView > 0;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInView = () => {
    if (allInViewSelected) {
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) next.add(id);
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleDeleteRow = async (entry: HistoryEntry) => {
    if (!onDeleteEntry) return;
    if (!window.confirm('Delete this entry?')) return;
    try {
      await onDeleteEntry(entry.id);
      setSelectedIds((prev) => {
        if (!prev.has(entry.id)) return prev;
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    } catch {
      // Host surfaces the error; selection survives so a retry is possible.
    }
  };

  const handleDeleteSelected = async () => {
    if (!onDeleteEntries || selectedIds.size === 0 || bulkBusy) return;
    const ids = [...selectedIds];
    if (
      !window.confirm(
        `Delete ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}?`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await onDeleteEntries(ids);
      setSelectedIds(new Set());
    } catch {
      // Host owns the error message; selection stays so the user can retry.
    } finally {
      setBulkBusy(false);
    }
  };

  const beginEditLabel = (entry: HistoryEntry) => {
    setEditingId(entry.id);
    setLabelDraft(entry.label ?? '');
    setLabelBusy(false);
    // Focus + select after the input mounts.
    window.setTimeout(() => {
      const node = labelInputRef.current;
      if (!node) return;
      node.focus();
      node.select();
    }, 0);
  };

  const cancelEditLabel = () => {
    setEditingId(null);
    setLabelDraft('');
    setLabelBusy(false);
  };

  const commitEditLabel = async () => {
    if (editingId === null || !onSetLabel || labelBusy) return;
    const draft = labelDraft.trim();
    const current = entries?.find((e) => e.id === editingId)?.label ?? null;
    const next = draft.length === 0 ? null : draft;
    if ((next ?? '') === (current ?? '')) {
      cancelEditLabel();
      return;
    }
    setLabelBusy(true);
    try {
      await onSetLabel(editingId, next);
      cancelEditLabel();
    } catch {
      // Host surfaces the error; keep the input open so the user can
      // retry or cancel.
      setLabelBusy(false);
    }
  };

  if (!open) return null;

  const handleClear = () => {
    if (!onClear) return;
    if (window.confirm(`Clear all history entries for "${profileLabel}"?`)) {
      onClear();
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Query history"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="mt-[10vh] flex max-h-[80vh] w-[min(48rem,92vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <History className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[13px] font-semibold text-fg">Query History</h2>
          <span className="font-mono text-[10px] text-fg-subtle">·</span>
          <span className="truncate font-mono text-[12px] text-fg-muted" title={profileLabel}>
            {profileLabel}
          </span>
          <span className="flex-1" />
          {entries && entries.length > 0 && (
            <span className="font-mono text-[10px] text-fg-subtle">
              {filtered?.length ?? 0} / {entries.length}
            </span>
          )}
          {onClear && entries && entries.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear every history entry for this profile"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
            >
              <Trash2 className="h-3 w-3" />
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="border-b border-edge bg-canvas px-3 py-2">
          <div className="flex items-center gap-2 rounded-md border border-edge bg-inset px-2 py-1.5 text-xs focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SQL or errors…"
              spellCheck={false}
              className="flex-1 bg-transparent text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            {query !== '' && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {onDeleteEntries && entries && entries.length > 0 && (
          <div className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-1.5 text-[11px] text-fg-muted">
            <button
              type="button"
              onClick={toggleSelectAllInView}
              aria-label={allInViewSelected ? 'Clear selection' : 'Select all visible'}
              title={allInViewSelected ? 'Clear selection' : 'Select all visible'}
              disabled={selectableCount === 0}
              className="rounded p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
            >
              {allInViewSelected ? (
                <CheckSquare className="h-3.5 w-3.5 text-accent" />
              ) : someInViewSelected ? (
                <CheckSquare className="h-3.5 w-3.5 text-fg-muted" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
            </button>
            {selectedIds.size > 0 ? (
              <>
                <span className="font-mono text-fg">
                  {selectedIds.size.toLocaleString()} selected
                </span>
                <span className="text-fg-subtle">·</span>
                <button
                  type="button"
                  onClick={() => void handleDeleteSelected()}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
                >
                  {bulkBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Delete
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={bulkBusy}
                  className="rounded-md px-2 py-0.5 text-[11px] text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                >
                  Clear selection
                </button>
              </>
            ) : (
              <span className="text-fg-subtle">
                Select rows to bulk-delete or use the per-row trash icon.
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-subtle">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history…
            </div>
          ) : !entries || entries.length === 0 ? (
            <p className="py-12 text-center text-sm text-fg-subtle">
              No history yet. Execute SQL while this profile is open and entries appear here.
            </p>
          ) : filtered && filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-fg-subtle">
              No entries match <span className="font-mono text-fg-muted">{query}</span>.
            </p>
          ) : (
            <ul className="divide-y divide-edge">
              {(filtered ?? []).map((e) => {
                const editing = editingId === e.id;
                const checked = selectedIds.has(e.id);
                const pick = () => {
                  if (editing) return;
                  onPick(e.sql);
                  onClose();
                };
                return (
                  <li
                    key={e.id}
                    onMouseEnter={() => setHoveredId(e.id)}
                    onMouseLeave={() =>
                      setHoveredId((prev) => (prev === e.id ? null : prev))
                    }
                    className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-elevated ${
                      checked ? 'bg-accent-subtle/30' : ''
                    }`}
                  >
                    {onDeleteEntries && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(e.id)}
                        aria-label={
                          checked ? 'Deselect entry' : 'Select entry'
                        }
                        className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent"
                      />
                    )}
                    {e.status === 'ok' ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                    )}
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <div className="mb-1 flex items-center gap-2">
                          <input
                            ref={labelInputRef}
                            type="text"
                            value={labelDraft}
                            disabled={labelBusy}
                            maxLength={80}
                            onChange={(ev) => setLabelDraft(ev.target.value)}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') {
                                ev.preventDefault();
                                void commitEditLabel();
                              } else if (ev.key === 'Escape') {
                                ev.preventDefault();
                                cancelEditLabel();
                              }
                            }}
                            onBlur={() => {
                              if (labelBusy) return;
                              void commitEditLabel();
                            }}
                            placeholder="Label (leave empty to clear)"
                            spellCheck={false}
                            className="flex-1 rounded border border-edge bg-canvas px-2 py-0.5 text-[11px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                          />
                          {labelBusy && (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-fg-subtle" />
                          )}
                        </div>
                      ) : (
                        e.label && (
                          <span className="mb-0.5 inline-block rounded bg-accent-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-accent">
                            {e.label}
                          </span>
                        )
                      )}
                      <button
                        type="button"
                        onClick={pick}
                        disabled={editing}
                        title="Open this statement in the editor"
                        className="block w-full cursor-pointer text-left disabled:cursor-default"
                      >
                        {hoveredId === e.id ? (
                          <div className="overflow-hidden text-[12px] text-fg">
                            <SqlHighlight value={e.sql} />
                          </div>
                        ) : (
                          <div className="truncate font-mono text-[12px] text-fg">
                            {previewSql(e.sql)}
                          </div>
                        )}
                      </button>
                      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-fg-subtle">
                        <span>{formatTimestamp(e.executedAt)}</span>
                        <span className="font-mono">{e.durationMs.toLocaleString()} ms</span>
                        {e.status === 'ok' && e.rowCount !== null && e.rowCount !== undefined && (
                          <span className="font-mono">
                            {e.rowCount.toLocaleString()} row{e.rowCount === 1 ? '' : 's'}
                          </span>
                        )}
                        {e.status === 'err' && e.error && (
                          <span className="truncate text-danger">{e.error}</span>
                        )}
                      </div>
                    </div>
                    {onSetLabel && !editing && (
                      <button
                        type="button"
                        onClick={() => beginEditLabel(e)}
                        aria-label={e.label ? 'Rename label' : 'Add label'}
                        title={e.label ? 'Rename label' : 'Add label'}
                        className="mt-0.5 shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-canvas hover:text-fg"
                        style={{
                          opacity: hoveredId === e.id ? 1 : 0,
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {onDeleteEntry && !editing && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteRow(e)}
                        aria-label="Delete entry"
                        title="Delete entry"
                        className="mt-0.5 shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                        style={{
                          opacity: hoveredId === e.id ? 1 : 0,
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function previewSql(sql: string): string {
  const trimmed = sql.trim();
  const first = trimmed.split(/\r?\n/)[0] ?? trimmed;
  return first.length > 200 ? `${first.slice(0, 200)}…` : first;
}

function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return new Date(ts).toLocaleString();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}
