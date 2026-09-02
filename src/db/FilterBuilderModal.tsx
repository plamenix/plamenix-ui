/**
 * Multi-column filter builder.
 *
 * Lets the user compose every active filter on the table in one
 * surface — distinct from the per-column header popover, which only
 * exposes one column's filter at a time. The builder operates on a
 * staged copy of the active filter list; the user clicks Apply (or
 * Cancel) to commit / discard.
 *
 * SQL predicate preview re-runs `buildFilterPredicate` whenever the
 * staged list changes so the user sees the exact WHERE body the host
 * will inject.
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import {
  FILTER_OPERATORS,
  buildFilterPredicate,
  operatorIsBetween,
  operatorIsInList,
  operatorIsUnary,
  type ColumnFilter,
  type FilterOperator,
} from './filters.js';
import type { ColumnInfo } from './types.js';

export interface FilterBuilderModalProps {
  open: boolean;
  /** Active filter list as it stands on the table; the modal starts
   *  from this snapshot + commits a successor via `onApply`. */
  filters: ColumnFilter[];
  /** Every column in the result + its info. The builder picks
   *  filterable ones (those with `ColumnInfo`) for the column
   *  dropdown. */
  columns: ReadonlyArray<{ name: string; info: ColumnInfo | null }>;
  onApply: (next: ColumnFilter[]) => void;
  onClose: () => void;
}

export function FilterBuilderModal({
  open,
  filters,
  columns,
  onApply,
  onClose,
}: FilterBuilderModalProps) {
  const [staged, setStaged] = useState<ColumnFilter[]>(filters);

  useEffect(() => {
    if (open) setStaged(filters);
  }, [open, filters]);

  const filterableColumns = useMemo(
    () => columns.filter((c) => c.info !== null),
    [columns],
  );
  const infoByName = useMemo(() => {
    const m = new Map<string, ColumnInfo>();
    for (const c of columns) if (c.info) m.set(c.name, c.info);
    return m;
  }, [columns]);

  const predicate = useMemo(
    () => buildFilterPredicate(staged, infoByName),
    [staged, infoByName],
  );

  if (!open) return null;

  const addRow = () => {
    const firstUnused = filterableColumns.find(
      (c) => !staged.some((f) => f.columnName === c.name),
    );
    const col = firstUnused ?? filterableColumns[0];
    if (!col) return;
    setStaged([...staged, { columnName: col.name, operator: '=', value: '' }]);
  };

  const update = (idx: number, patch: Partial<ColumnFilter>) => {
    setStaged(staged.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const remove = (idx: number) => {
    setStaged(staged.filter((_, i) => i !== idx));
  };

  const apply = () => {
    // Drop filters that won't render (empty value on a binary operator)
    // so the table only sees actionable predicates.
    const cleaned = staged.filter((f) => {
      if (operatorIsUnary(f.operator)) return true;
      return f.value.trim().length > 0;
    });
    onApply(cleaned);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Combine column filters"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-elevated px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Filter builder</h2>
          <span className="text-[11px] text-fg-subtle">
            {staged.length} active · combines as AND
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filter builder"
            className="rounded p-1 text-fg-subtle transition-colors hover:bg-canvas hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-4 py-4">
          {staged.length === 0 ? (
            <p className="rounded-md border border-dashed border-edge px-4 py-6 text-center text-xs italic text-fg-subtle">
              No filters yet. Click + Add filter to start.
            </p>
          ) : (
            <ul className="grid gap-2">
              {staged.map((row, idx) => (
                <FilterRow
                  key={idx}
                  row={row}
                  columns={filterableColumns}
                  onChange={(patch) => update(idx, patch)}
                  onRemove={() => remove(idx)}
                />
              ))}
            </ul>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={addRow}
              disabled={filterableColumns.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-canvas px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add filter
            </button>
          </div>

          <section className="mt-5 rounded-md border border-edge bg-canvas">
            <h3 className="border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              WHERE preview
            </h3>
            <pre className="overflow-auto px-3 py-2 font-mono text-[11px] text-fg-muted">
{predicate ?? '— no clause (every filter empty or no rows added) —'}
            </pre>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-edge bg-elevated px-4 py-3">
          <button
            type="button"
            onClick={() => setStaged([])}
            disabled={staged.length === 0}
            className="rounded px-2 py-1 text-[11px] text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear all
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-edge bg-canvas px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-panel hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent/90"
            >
              Apply
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FilterRow({
  row,
  columns,
  onChange,
  onRemove,
}: {
  row: ColumnFilter;
  columns: ReadonlyArray<{ name: string; info: ColumnInfo | null }>;
  onChange: (patch: Partial<ColumnFilter>) => void;
  onRemove: () => void;
}) {
  const unary = operatorIsUnary(row.operator);
  const placeholder = placeholderForOperator(row.operator);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2 rounded-md border border-edge bg-canvas px-2 py-1.5">
      <select
        value={row.columnName}
        onChange={(e) => onChange({ columnName: e.target.value })}
        className="rounded border border-edge bg-panel px-2 py-1 font-mono text-xs text-fg"
      >
        {columns.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
            {c.info?.sqlType ? ` (${c.info.sqlType})` : ''}
          </option>
        ))}
      </select>
      <select
        value={row.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator })}
        className="rounded border border-edge bg-panel px-2 py-1 font-mono text-xs text-fg"
      >
        {FILTER_OPERATORS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      <input
        value={row.value}
        onChange={(e) => onChange({ value: e.target.value })}
        disabled={unary}
        placeholder={unary ? '— no value —' : placeholder}
        className="rounded border border-edge bg-panel px-2 py-1 font-mono text-xs text-fg disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="rounded p-1 text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function placeholderForOperator(op: FilterOperator): string {
  if (op === 'LIKE' || op === 'NOT LIKE') return '%value%';
  if (op === 'CONTAINING' || op === 'NOT CONTAINING') return 'substring';
  if (op === 'STARTING WITH' || op === 'NOT STARTING WITH') return 'prefix';
  if (op === 'SIMILAR TO' || op === 'NOT SIMILAR TO') return '[a-z]+ regex';
  if (operatorIsBetween(op)) return 'low,high';
  if (operatorIsInList(op)) return 'a,b,c';
  return 'value';
}
