import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Plus, Table as TableIcon, Trash2, X } from 'lucide-react';
import {
  buildCreateTableSql,
  freshColumnDraft,
  STOCK_TYPES,
  validateDraft,
  type ColumnDraft,
} from './schema-editor';
import type { DomainInfo } from './types';

export interface SchemaEditorModalProps {
  open: boolean;
  /** User-defined domains, appended to the type autocomplete so the
   *  user can pick `D_EMAIL` etc. without typing the full type. */
  domains?: DomainInfo[];
  onClose: () => void;
  /** Fired with the generated CREATE TABLE SQL on Apply. The host
   *  typically drops it into the editor for review before execute. */
  onApply: (sql: string) => void;
}

/**
 * Visual CREATE TABLE builder. One column per row with a free-form
 * type expression backed by a datalist of common Firebird types
 * plus user-defined domains. Apply hands the generated SQL to the
 * host; nothing executes from inside the modal.
 */
export function SchemaEditorModal({
  open,
  domains = [],
  onClose,
  onApply,
}: SchemaEditorModalProps) {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnDraft[]>(() => [freshColumnDraft()]);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Reset when the modal closes so the next open starts from scratch.
  useEffect(() => {
    if (!open) {
      setTableName('');
      setColumns([freshColumnDraft()]);
      setError(null);
    }
  }, [open]);

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

  const typeOptions = useMemo(() => {
    const set = new Set<string>(STOCK_TYPES);
    for (const d of domains) set.add(d.name);
    return [...set];
  }, [domains]);

  if (!open) return null;

  const patchColumn = (id: string, patch: Partial<ColumnDraft>) =>
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeColumn = (id: string) =>
    setColumns((prev) => prev.filter((c) => c.id !== id));
  const addColumn = () => setColumns((prev) => [...prev, freshColumnDraft()]);

  const handleApply = () => {
    const v = validateDraft(tableName, columns);
    if (!v.ok) {
      setError(v.reason);
      return;
    }
    onApply(buildCreateTableSql(tableName, columns));
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="Schema editor"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="mt-[6vh] flex max-h-[88vh] w-[min(60rem,95vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <TableIcon className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[13px] font-semibold text-fg">Create table</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Table name
            <input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              autoFocus
              placeholder="PMX_USERS"
              className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-sm text-fg"
            />
          </label>

          <div className="rounded-lg border border-edge bg-canvas">
            <div className="grid grid-cols-[1fr_1fr_1fr_4rem_4rem_2rem] items-center gap-2 border-b border-edge bg-elevated px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
              <span>Name</span>
              <span>Type</span>
              <span>Default</span>
              <span className="text-center">PK</span>
              <span className="text-center">Null</span>
              <span />
            </div>
            <datalist id="plamenix-schema-types">
              {typeOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {columns.map((col) => (
              <div
                key={col.id}
                className="grid grid-cols-[1fr_1fr_1fr_4rem_4rem_2rem] items-center gap-2 border-b border-edge-subtle px-2 py-1.5 last:border-b-0"
              >
                <input
                  value={col.name}
                  onChange={(e) => patchColumn(col.id, { name: e.target.value })}
                  placeholder="column_name"
                  className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg"
                />
                <input
                  list="plamenix-schema-types"
                  value={col.sqlType}
                  onChange={(e) => patchColumn(col.id, { sqlType: e.target.value })}
                  placeholder="INTEGER"
                  className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg"
                />
                <input
                  value={col.defaultValue}
                  onChange={(e) => patchColumn(col.id, { defaultValue: e.target.value })}
                  placeholder="—"
                  className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg"
                />
                <label
                  className="flex items-center justify-center"
                  title="Include in PRIMARY KEY"
                >
                  <input
                    type="checkbox"
                    checked={col.isPrimaryKey}
                    onChange={(e) => {
                      const isPk = e.target.checked;
                      patchColumn(col.id, {
                        isPrimaryKey: isPk,
                        nullable: isPk ? false : col.nullable,
                      });
                    }}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  {col.isPrimaryKey && (
                    <KeyRound className="ml-1 h-3 w-3 text-accent" aria-hidden />
                  )}
                </label>
                <label
                  className="flex items-center justify-center"
                  title="Allow NULL"
                >
                  <input
                    type="checkbox"
                    checked={col.nullable}
                    disabled={col.isPrimaryKey}
                    onChange={(e) => patchColumn(col.id, { nullable: e.target.checked })}
                    className="h-3.5 w-3.5 accent-accent disabled:opacity-40"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeColumn(col.id)}
                  disabled={columns.length === 1}
                  aria-label="Remove column"
                  title="Remove column"
                  className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <div className="border-t border-edge bg-elevated px-2 py-1.5">
              <button
                type="button"
                onClick={addColumn}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-panel hover:text-fg"
              >
                <Plus className="h-3 w-3" />
                Add column
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-canvas px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1 text-xs text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover"
          >
            Apply to editor
          </button>
        </footer>
      </div>
    </div>
  );
}
