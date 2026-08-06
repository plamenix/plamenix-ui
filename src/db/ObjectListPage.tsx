/**
 * Full-screen list view for a single schema entity kind.
 *
 * One component renders six different kinds — tables, views,
 * procedures, triggers, generators, domains — by dispatching on
 * `kind` and picking per-kind column descriptors. Common chrome
 * (header + back button + search + selection toolbar) is shared
 * across all kinds.
 *
 * Features (all six kinds):
 *   - Sortable columns (click header to toggle asc/desc, click again
 *     to clear).
 *   - Substring search across the primary identifier column.
 *   - Multi-row selection with bulk DROP.
 *   - Per-row Drop button with confirm dialog.
 *
 * The component never issues SQL directly — it composes the DROP
 * statement(s) and hands them to `onCommit`. After a successful
 * commit, `onRefresh` is invoked so the host can re-fetch the schema
 * and re-render the page with the surviving rows.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Eye,
  Loader2,
  Pencil,
  Power,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { quoteIdent } from './schema-actions';
import { compareExactInt, formatExactInt, parseExactInt } from './exact-int';
import type {
  DomainInfo,
  GeneratorInfo,
  ProcedureInfo,
  Schema,
  TableInfo,
  TriggerInfo,
} from './types';

/** Each entity kind the list page can render. */
export type ObjectListKind =
  | 'tables'
  | 'views'
  | 'procedures'
  | 'triggers'
  | 'generators'
  | 'domains';

export interface ObjectListPageProps {
  kind: ObjectListKind;
  schema: Schema;
  /** Closes the list and returns to the query view. */
  onClose: () => void;
  /** Runs the composed DROP SQL on the active session. Resolves on
   *  success, rejects with a useful message to surface inline. */
  onCommit: (sql: string) => Promise<void>;
  /** Asks the host to re-fetch the schema after a successful commit.
   *  Optional — the page still works without it, but the list won't
   *  reflect the dropped rows until the next manual refresh. */
  onRefresh?: () => void;
  /** Active Firebird engine version. Drives the generator-value
   *  dialect (ALTER SEQUENCE RESTART WITH vs SET GENERATOR TO). */
  engineVersion?: string | null | undefined;
  /** Fired when the user clicks the "View DDL" eye icon for a view,
   *  procedure, or trigger row. Surfaced only for those three kinds. */
  onShowDdl?: ((kind: 'view' | 'procedure' | 'trigger', name: string) => void) | undefined;
}

interface ColumnSpec<T> {
  key: string;
  label: string;
  /** How to render the cell. Defaults to the stringified primary
   *  identifier when omitted. */
  render?: (row: T) => React.ReactNode;
  /** Sort comparator. Defaults to a case-insensitive name compare. */
  compare?: (a: T, b: T) => number;
  /** Cell-level alignment. */
  align?: 'left' | 'right';
  /** Optional fixed/min width hint (CSS string). */
  width?: string;
}

interface KindSpec<T extends { name: string }> {
  title: string;
  singular: string;
  dropKeyword: string;
  pickItems: (schema: Schema) => readonly T[];
  columns: ColumnSpec<T>[];
}

/** Renders BEFORE/AFTER + INSERT/UPDATE/DELETE labels from
 *  `RDB$TRIGGERS.RDB$TRIGGER_TYPE`. Decoded inline because the
 *  encoding is small and stable. */
function decodeTriggerType(code: number): string {
  // Bit layout (Firebird 3+): bit 0 = AFTER (1) vs BEFORE (0); higher
  // bits encode the action (INSERT/UPDATE/DELETE) and combinations.
  // For the most common single-action triggers the LOW byte enumerates
  // ((kind - 1) << 1) | timing, where kind is 1=INSERT, 2=UPDATE,
  // 3=DELETE and timing is 0=BEFORE, 1=AFTER.
  const timing = code & 1 ? 'AFTER' : 'BEFORE';
  switch (code) {
    case 1:
      return 'BEFORE INSERT';
    case 2:
      return 'AFTER INSERT';
    case 3:
      return 'BEFORE UPDATE';
    case 4:
      return 'AFTER UPDATE';
    case 5:
      return 'BEFORE DELETE';
    case 6:
      return 'AFTER DELETE';
    case 8192:
      return 'ON CONNECT';
    case 8193:
      return 'ON DISCONNECT';
    case 8194:
      return 'ON TRANSACTION START';
    case 8195:
      return 'ON TRANSACTION COMMIT';
    case 8196:
      return 'ON TRANSACTION ROLLBACK';
    default:
      return `${timing} (#${code})`;
  }
}

const TABLES_SPEC: KindSpec<TableInfo> = {
  title: 'Tables',
  singular: 'table',
  dropKeyword: 'TABLE',
  pickItems: (s) => s.tables.filter((t) => t.kind === 'table'),
  columns: [
    { key: 'name', label: 'Name', width: '40%' },
    {
      key: 'columns',
      label: 'Columns',
      align: 'right',
      width: '20%',
      render: (t) => t.columns.length,
      compare: (a, b) => a.columns.length - b.columns.length,
    },
    {
      key: 'pk',
      label: 'Primary key',
      width: '40%',
      render: (t) =>
        (t.primaryKey ?? []).length === 0 ? (
          <span className="italic text-fg-subtle">none</span>
        ) : (
          (t.primaryKey ?? []).join(', ')
        ),
      compare: (a, b) =>
        (a.primaryKey ?? []).join(',').localeCompare((b.primaryKey ?? []).join(',')),
    },
  ],
};

const VIEWS_SPEC: KindSpec<TableInfo> = {
  title: 'Views',
  singular: 'view',
  dropKeyword: 'VIEW',
  pickItems: (s) => s.tables.filter((t) => t.kind === 'view'),
  columns: [
    { key: 'name', label: 'Name', width: '60%' },
    {
      key: 'columns',
      label: 'Columns',
      align: 'right',
      width: '40%',
      render: (v) => v.columns.length,
      compare: (a, b) => a.columns.length - b.columns.length,
    },
  ],
};

const PROCEDURES_SPEC: KindSpec<ProcedureInfo> = {
  title: 'Procedures',
  singular: 'procedure',
  dropKeyword: 'PROCEDURE',
  pickItems: (s) => s.procedures ?? [],
  columns: [
    { key: 'name', label: 'Name', width: '50%' },
    {
      key: 'inputCount',
      label: 'In',
      align: 'right',
      width: '15%',
      render: (p) => p.inputCount,
      compare: (a, b) => a.inputCount - b.inputCount,
    },
    {
      key: 'outputCount',
      label: 'Out',
      align: 'right',
      width: '15%',
      render: (p) => p.outputCount,
      compare: (a, b) => a.outputCount - b.outputCount,
    },
    {
      key: 'kind',
      label: 'Kind',
      width: '20%',
      render: (p) => (p.outputCount > 0 ? 'Selectable' : 'Executable'),
      compare: (a, b) => Number(b.outputCount > 0) - Number(a.outputCount > 0),
    },
  ],
};

const TRIGGERS_SPEC: KindSpec<TriggerInfo> = {
  title: 'Triggers',
  singular: 'trigger',
  dropKeyword: 'TRIGGER',
  pickItems: (s) => s.triggers ?? [],
  columns: [
    { key: 'name', label: 'Name', width: '30%' },
    {
      key: 'relation',
      label: 'Relation',
      width: '25%',
      render: (t) =>
        t.relation.length === 0 ? (
          <span className="italic text-fg-subtle">database-level</span>
        ) : (
          t.relation
        ),
      compare: (a, b) => a.relation.localeCompare(b.relation),
    },
    {
      key: 'type',
      label: 'Type',
      width: '25%',
      render: (t) => decodeTriggerType(t.triggerType),
      compare: (a, b) => a.triggerType - b.triggerType,
    },
    {
      key: 'active',
      label: 'Active',
      width: '20%',
      render: (t) => (
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            t.active ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
          }`}
        >
          {t.active ? 'active' : 'inactive'}
        </span>
      ),
      compare: (a, b) => Number(b.active) - Number(a.active),
    },
  ],
};

const GENERATORS_SPEC: KindSpec<GeneratorInfo> = {
  title: 'Generators',
  singular: 'generator',
  dropKeyword: 'GENERATOR',
  pickItems: (s) => s.generators ?? [],
  columns: [
    { key: 'name', label: 'Name', width: '60%' },
    {
      key: 'value',
      label: 'Current value',
      width: '40%',
      align: 'right',
      render: (g) => (
        <span className="font-mono tabular-nums">{formatExactInt(g.currentValue)}</span>
      ),
      compare: (a, b) => compareExactInt(a.currentValue, b.currentValue),
    },
  ],
};

const DOMAINS_SPEC: KindSpec<DomainInfo> = {
  title: 'Domains',
  singular: 'domain',
  dropKeyword: 'DOMAIN',
  pickItems: (s) => s.domains ?? [],
  columns: [
    { key: 'name', label: 'Name', width: '45%' },
    {
      key: 'sqlType',
      label: 'Type',
      width: '40%',
      render: (d) => <span className="font-mono">{d.sqlType}</span>,
      compare: (a, b) => a.sqlType.localeCompare(b.sqlType),
    },
    {
      key: 'nullable',
      label: 'Nullable',
      width: '15%',
      render: (d) => (d.nullable ? 'yes' : 'no'),
      compare: (a, b) => Number(b.nullable) - Number(a.nullable),
    },
  ],
};

/** Width of the per-row action column. Triggers carry an extra Power
 *  button alongside the View-DDL eye and the Drop; views / procedures
 *  / generators carry one extra button next to Drop. */
function actionColWidth(kind: ObjectListKind): string {
  if (kind === 'triggers') return 'w-40';
  if (kind === 'generators' || kind === 'views' || kind === 'procedures') {
    return 'w-32';
  }
  return 'w-16';
}

/** Maps the list-page kind to the DDL-viewer kind. Returns `null` for
 *  kinds without a corresponding `RDB$*_SOURCE` column. */
function ddlKind(kind: ObjectListKind): 'view' | 'procedure' | 'trigger' | null {
  if (kind === 'views') return 'view';
  if (kind === 'procedures') return 'procedure';
  if (kind === 'triggers') return 'trigger';
  return null;
}

function pickSpec(kind: ObjectListKind): KindSpec<{ name: string }> {
  switch (kind) {
    case 'tables':
      return TABLES_SPEC as unknown as KindSpec<{ name: string }>;
    case 'views':
      return VIEWS_SPEC as unknown as KindSpec<{ name: string }>;
    case 'procedures':
      return PROCEDURES_SPEC as unknown as KindSpec<{ name: string }>;
    case 'triggers':
      return TRIGGERS_SPEC as unknown as KindSpec<{ name: string }>;
    case 'generators':
      return GENERATORS_SPEC as unknown as KindSpec<{ name: string }>;
    case 'domains':
      return DOMAINS_SPEC as unknown as KindSpec<{ name: string }>;
  }
}

interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export function ObjectListPage({
  kind,
  schema,
  onClose,
  onCommit,
  onRefresh,
  engineVersion,
  onShowDdl,
}: ObjectListPageProps) {
  const spec = pickSpec(kind);
  const items = spec.pickItems(schema);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Drop any stale selection when the underlying item list changes
  // (e.g. after a refresh deletes a row the user had ticked).
  useEffect(() => {
    setSelected((prev) => {
      const names = new Set(items.map((i) => i.name));
      const next = new Set<string>();
      for (const n of prev) if (names.has(n)) next.add(n);
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return items.slice();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = spec.columns.find((c) => c.key === sort.key);
    const cmp = col?.compare ?? ((a, b) => a.name.localeCompare(b.name));
    const out = filtered.slice().sort(cmp);
    if (sort.direction === 'desc') out.reverse();
    return out;
  }, [filtered, sort, spec.columns]);

  const toggleRow = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === sorted.length) return new Set();
      return new Set(sorted.map((i) => i.name));
    });
  };

  const onSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const dropSql = (names: string[]): string =>
    names.map((n) => `DROP ${spec.dropKeyword} ${quoteIdent(n)};`).join('\n');

  const [editingGenerator, setEditingGenerator] = useState<{ name: string; draft: string } | null>(
    null,
  );

  const beginEditGenerator = (gen: GeneratorInfo) => {
    if (busy) return;
    setEditingGenerator({ name: gen.name, draft: gen.currentValue });
  };

  const commitGeneratorEdit = async (gen: GeneratorInfo) => {
    if (busy || !editingGenerator || editingGenerator.name !== gen.name) return;
    const trimmed = editingGenerator.draft.trim();
    if (trimmed.length === 0) {
      setEditingGenerator(null);
      return;
    }
    const next = parseExactInt(trimmed);
    if (next === null) {
      setEditingGenerator(null);
      return;
    }
    if (compareExactInt(next, gen.currentValue) === 0) {
      setEditingGenerator(null);
      return;
    }
    if (compareExactInt(next, gen.currentValue) < 0) {
      const ok = window.confirm(
        `Lower generator ${gen.name} from ${formatExactInt(gen.currentValue)} to ${formatExactInt(next)}? New rows may collide with existing values.`,
      );
      if (!ok) {
        setEditingGenerator(null);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const ident = quoteIdent(gen.name);
      const major = engineVersion ? parseInt(engineVersion.split('.')[0] ?? '0', 10) : 0;
      const sql =
        major > 0 && major < 3
          ? `SET GENERATOR ${ident} TO ${next};`
          : `ALTER SEQUENCE ${ident} RESTART WITH ${next};`;
      await onCommit(sql);
      setEditingGenerator(null);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleTrigger = async (trigger: TriggerInfo) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ident = quoteIdent(trigger.name);
      const verb = trigger.active ? 'INACTIVE' : 'ACTIVE';
      await onCommit(`ALTER TRIGGER ${ident} ${verb};`);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const dropOne = async (name: string) => {
    if (busy) return;
    const confirmed = window.confirm(`Drop ${spec.singular} ${name}? This cannot be undone.`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await onCommit(dropSql([name]));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const dropSelected = async () => {
    if (busy || selected.size === 0) return;
    const names = Array.from(selected);
    const confirmed = window.confirm(
      `Drop ${names.length} ${spec.singular}${names.length === 1 ? '' : 's'}? ` +
        `This cannot be undone.\n\n${names.slice(0, 8).join(', ')}${
          names.length > 8 ? `, +${names.length - 8} more` : ''
        }`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await onCommit(dropSql(names));
      setSelected(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-edge bg-panel px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title="Back to query view"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h2 className="text-sm font-semibold text-fg">{spec.title}</h2>
          <span className="rounded bg-elevated px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            {sorted.length.toLocaleString()}
            {query && items.length !== sorted.length ? ` / ${items.length.toLocaleString()}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name"
              className="rounded-md border border-edge bg-canvas pl-7 pr-2 py-1 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>
          {selected.size > 0 && (
            <>
              <span className="rounded bg-accent-subtle px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-accent">
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={() => void dropSelected()}
                disabled={busy}
                title={`Drop ${selected.size} ${spec.singular}${selected.size === 1 ? '' : 's'}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Drop
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={busy}
                title="Clear selection"
                className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="border-b border-edge bg-danger-subtle px-4 py-1.5 text-[11px] text-danger">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
            <p className="text-sm font-medium text-fg-muted">
              {items.length === 0
                ? `No ${spec.title.toLowerCase()} in this database.`
                : `No ${spec.title.toLowerCase()} match "${query}".`}
            </p>
          </div>
        ) : (
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-panel text-left text-[11px] uppercase tracking-wide text-fg-muted shadow-[0_1px_0_0_var(--color-edge)]">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select all ${spec.title.toLowerCase()}`}
                    checked={selected.size > 0 && selected.size === sorted.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selected.size > 0 && selected.size < sorted.length;
                      }
                    }}
                    onChange={toggleAll}
                    disabled={busy}
                    className="h-3.5 w-3.5 cursor-pointer accent-accent"
                  />
                </th>
                {spec.columns.map((col) => {
                  const sortActive = sort?.key === col.key ? sort : null;
                  return (
                    <th
                      key={col.key}
                      style={col.width ? { width: col.width } : undefined}
                      className={`whitespace-nowrap px-3 py-2 font-mono font-semibold ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className="inline-flex cursor-pointer items-center gap-1 select-none"
                      >
                        {col.label}
                        {sortActive && (
                          <span className="text-accent" aria-hidden>
                            {sortActive.direction === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )}
                          </span>
                        )}
                      </button>
                    </th>
                  );
                })}
                <th className={`${actionColWidth(kind)} px-3 py-2`} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => {
                const isSelected = selected.has(row.name);
                return (
                  <tr
                    key={row.name}
                    className={`border-b border-edge-subtle transition-colors hover:bg-[var(--color-row-hover)] ${
                      idx % 2 === 0 ? 'bg-canvas' : 'bg-[var(--color-row-alt)]'
                    } ${isSelected ? '!bg-accent-subtle' : ''}`}
                  >
                    <td className="w-8 px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={isSelected}
                        disabled={busy}
                        onChange={() => toggleRow(row.name)}
                        className="h-3.5 w-3.5 cursor-pointer accent-accent"
                      />
                    </td>
                    {spec.columns.map((col) => {
                      const editingThis =
                        kind === 'generators' &&
                        col.key === 'value' &&
                        editingGenerator?.name === row.name;
                      return (
                        <td
                          key={col.key}
                          className={`whitespace-nowrap px-3 py-1.5 font-mono text-xs text-fg ${
                            col.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {editingThis ? (
                            <input
                              type="number"
                              autoFocus
                              value={editingGenerator?.draft ?? ''}
                              onChange={(e) =>
                                setEditingGenerator((prev) =>
                                  prev ? { ...prev, draft: e.target.value } : prev,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void commitGeneratorEdit(row as GeneratorInfo);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingGenerator(null);
                                }
                              }}
                              disabled={busy}
                              className="w-32 rounded border border-edge bg-canvas px-1.5 py-0.5 text-right font-mono text-xs text-fg focus:border-accent focus:outline-none"
                            />
                          ) : col.render ? (
                            col.render(row)
                          ) : (
                            (row as { name: string }).name
                          )}
                        </td>
                      );
                    })}
                    <td className={`${actionColWidth(kind)} px-3 py-1.5 text-right`}>
                      <div className="inline-flex items-center gap-1">
                        {(() => {
                          const dk = ddlKind(kind);
                          if (!dk || !onShowDdl) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => onShowDdl(dk, row.name)}
                              disabled={busy}
                              title="View DDL"
                              aria-label="View DDL"
                              className="inline-flex items-center rounded p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          );
                        })()}
                        {kind === 'triggers' &&
                          (() => {
                            const trigger = row as TriggerInfo;
                            return (
                              <button
                                type="button"
                                onClick={() => void toggleTrigger(trigger)}
                                disabled={busy}
                                title={trigger.active ? 'Deactivate trigger' : 'Activate trigger'}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors disabled:opacity-50 ${
                                  trigger.active
                                    ? 'text-success hover:bg-elevated'
                                    : 'text-fg-subtle hover:bg-elevated hover:text-success'
                                }`}
                              >
                                <Power className="h-3 w-3" />
                                {trigger.active ? 'On' : 'Off'}
                              </button>
                            );
                          })()}
                        {kind === 'generators' &&
                          (() => {
                            const gen = row as GeneratorInfo;
                            const isEditing = editingGenerator?.name === gen.name;
                            return isEditing ? (
                              <button
                                type="button"
                                onClick={() => void commitGeneratorEdit(gen)}
                                disabled={busy}
                                title="Save value"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success transition-colors hover:bg-elevated disabled:opacity-50"
                              >
                                <Check className="h-3 w-3" />
                                Save
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => beginEditGenerator(gen)}
                                disabled={busy}
                                title="Set generator value"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                            );
                          })()}
                        <button
                          type="button"
                          onClick={() => void dropOne(row.name)}
                          disabled={busy}
                          title={`Drop ${spec.singular}`}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Drop
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
