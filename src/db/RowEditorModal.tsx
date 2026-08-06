/**
 * Modal that drives an `INSERT INTO <table>` round-trip.
 *
 * Layout: one form row per column of the editable table. Each form
 * row carries:
 *
 *   - The column label + type badge (BOLDED when `NOT NULL` and no
 *     declared default — those are the rows the user must fill).
 *   - A type-appropriate input widget (date / time / datetime-local
 *     / checkbox / number / text), matching the A1 inline-edit
 *     dispatcher.
 *   - `NULL` and `DEFAULT` toggle buttons that short-circuit to the
 *     parse sentinels (see `inline-edit.ts`).
 *
 * Submission strategy: columns left **untouched** (empty draft, no
 * sentinel) are **omitted** from the INSERT entirely so the engine
 * applies the declared default. Columns with a draft or sentinel run
 * through `parseEditedValue`; failures are collected and surfaced as
 * inline errors. The modal stays open on parse failure.
 *
 * Post-success: the host's `onCommit(sql)` resolves; the modal closes
 * and the caller is responsible for refetching the active query —
 * we cannot inject the new row into the existing result set because
 * the row's primary key is not known until the engine assigns it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import {
  DEFAULT_SENTINEL,
  NULL_SENTINEL,
  buildInsertSql,
  isDateType,
  isFloatType,
  isIntegerType,
  isTimeType,
  isTimestampType,
  numericStepFor,
  parseEditedValue,
} from './inline-edit';
import type { ColumnInfo, TableInfo } from './types';
import { emitRowInserted } from '../events/data-events.js';
import { rowInsertingChain } from '../interceptors/row-inserting.js';

export interface RowEditorModalProps {
  /** Tab that opened the modal. Threaded through `row.inserting`
   *  interceptor + `row/inserted` event emit. */
  tabId: string;
  /** Session backing the INSERT. `null` is invalid in practice (the
   *  open-modal action requires a live session); kept nullable for
   *  uniformity with the other table-surface components. */
  sessionId: string | null;
  /** Target table for the INSERT. Owns the column list and PK info. */
  table: TableInfo;
  /** Fires the host-supplied SQL executor with the composed INSERT
   *  statement. Resolves on success, rejects to surface inline. */
  onCommit: (sql: string) => Promise<void>;
  /** Closes the modal without inserting. */
  onCancel: () => void;
}

/** Per-column draft state held by the modal. */
interface FieldState {
  /** Raw widget value. Sentinels (NULL, DEFAULT) replace the string
   *  outright. Empty string + no sentinel = "use engine default". */
  draft: string;
  /** `true` once the user has touched the widget or toggled a sentinel.
   *  Untouched fields are omitted from the INSERT. */
  touched: boolean;
}

const FIELD_LABEL = 'flex items-baseline justify-between gap-2 text-[11px] font-medium uppercase tracking-wide';
const FIELD_INPUT =
  'w-full min-w-[8rem] rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50';
const PILL =
  'rounded border border-edge px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:bg-fg-subtle/15 hover:text-fg';

/** Renders the typed widget for a single column. Mirrors the
 *  TypedEditingInput dispatcher in ResultTable but without blur-commit
 *  semantics (modal commits on the explicit "Insert" button). */
function FieldWidget({
  column,
  state,
  onDraft,
}: {
  column: ColumnInfo;
  state: FieldState;
  onDraft: (next: FieldState) => void;
}) {
  const sql = column.sqlType.toUpperCase();
  const draft = state.draft;
  if (draft === NULL_SENTINEL || draft === DEFAULT_SENTINEL) {
    return (
      <input
        value={draft === NULL_SENTINEL ? 'NULL' : 'DEFAULT'}
        readOnly
        className={`${FIELD_INPUT} italic text-fg-subtle`}
      />
    );
  }
  const setText = (v: string) => onDraft({ draft: v, touched: v.length > 0 });
  if (sql === 'BOOLEAN') {
    const checked = draft.toLowerCase() === 'true' || draft === '1';
    return (
      <label className="inline-flex items-center gap-2 text-xs text-fg-muted">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) =>
            onDraft({ draft: e.target.checked ? 'true' : 'false', touched: true })
          }
          className="h-4 w-4 cursor-pointer accent-accent"
        />
        <span className="font-mono text-fg">{checked ? 'true' : 'false'}</span>
      </label>
    );
  }
  if (isDateType(sql)) {
    return (
      <input
        type="date"
        value={draft}
        onChange={(e) => setText(e.target.value)}
        className={FIELD_INPUT}
      />
    );
  }
  if (isTimeType(sql)) {
    return (
      <input
        type="time"
        step="1"
        value={draft}
        onChange={(e) => setText(e.target.value)}
        className={FIELD_INPUT}
      />
    );
  }
  if (isTimestampType(sql)) {
    return (
      <input
        type="datetime-local"
        step="1"
        value={draft}
        onChange={(e) => setText(e.target.value)}
        className={FIELD_INPUT}
      />
    );
  }
  if (isIntegerType(sql) || isFloatType(sql)) {
    const step = isIntegerType(sql) ? '1' : numericStepFor(sql);
    return (
      <input
        type="number"
        step={step}
        value={draft}
        onChange={(e) => setText(e.target.value)}
        className={`${FIELD_INPUT} text-right tabular-nums`}
        placeholder={column.defaultExpr ?? ''}
      />
    );
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setText(e.target.value)}
      className={FIELD_INPUT}
      placeholder={column.defaultExpr ?? ''}
    />
  );
}

export function RowEditorModal({
  tabId,
  sessionId,
  table,
  onCommit,
  onCancel,
}: RowEditorModalProps) {
  const editable = useMemo(
    () => table.columns.filter((c) => !c.sqlType.toUpperCase().startsWith('BLOB')),
    [table.columns],
  );
  const [fields, setFields] = useState<Record<string, FieldState>>(() => {
    const out: Record<string, FieldState> = {};
    for (const c of editable) out[c.name] = { draft: '', touched: false };
    return out;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Focus first text-shaped widget for keyboard-driven entry.
    const input = firstInputRef.current?.querySelector<
      HTMLInputElement | HTMLSelectElement
    >('input, select');
    input?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const setField = (name: string, next: FieldState) => {
    setFields((prev) => ({ ...prev, [name]: next }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
  };

  const submit = async () => {
    if (busy) return;
    if (sessionId === null) {
      setGlobalError('No active session — cannot insert.');
      return;
    }
    setGlobalError(null);
    const collected: {
      name: string;
      literal: string;
      value: import('./generated').ColumnValue | null;
    }[] = [];
    const nextErrors: Record<string, string> = {};
    for (const column of editable) {
      const state = fields[column.name] ?? { draft: '', touched: false };
      if (!state.touched) continue;
      const parsed = parseEditedValue(state.draft, column);
      if (!parsed.ok) {
        nextErrors[column.name] = parsed.reason;
        continue;
      }
      collected.push({
        name: column.name,
        literal: parsed.literal,
        value: parsed.value,
      });
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (collected.length === 0) {
      setGlobalError('Fill at least one column before inserting.');
      return;
    }
    const builtSql = buildInsertSql({ table: table.name, values: collected });
    const decision = await rowInsertingChain.run({
      tabId,
      sessionId,
      table: table.name,
      values: collected.map((c) => ({ column: c.name, value: c.value ?? null })),
      sql: builtSql,
    });
    if (decision.action === 'cancel') {
      setGlobalError(decision.reason);
      return;
    }
    const sql =
      decision.action === 'replace' ? decision.ctx.sql : builtSql;
    setBusy(true);
    try {
      await onCommit(sql);
      emitRowInserted({
        tabId,
        sessionId,
        table: table.name,
        sql,
        insertedAt: Date.now(),
      });
      onCancel();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`Insert row into ${table.name}`}
      onClick={onCancel}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[10vh] flex max-h-[80vh] w-[min(40rem,94vw)] flex-col rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-fg">
              Insert row into{' '}
              <span className="font-mono text-accent">{table.name}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          ref={firstInputRef}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {editable.length === 0 ? (
            <p className="text-xs text-fg-subtle">
              No editable columns on this table.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {editable.map((column) => {
                const state =
                  fields[column.name] ?? { draft: '', touched: false };
                const error = errors[column.name] ?? null;
                const isPk = (table.primaryKey ?? []).some(
                  (p) => p.toUpperCase() === column.name.toUpperCase(),
                );
                const isRequired = !column.nullable && !column.defaultExpr;
                return (
                  <div key={column.name} className="flex flex-col gap-1">
                    <label className={FIELD_LABEL}>
                      <span className="text-fg">
                        {column.name}
                        {isPk && (
                          <span
                            className="ml-1 text-accent"
                            title="Primary key"
                          >
                            *
                          </span>
                        )}
                        {isRequired && (
                          <span
                            className="ml-1 text-danger"
                            title="NOT NULL with no DEFAULT"
                          >
                            !
                          </span>
                        )}
                      </span>
                      <span className="font-mono normal-case text-fg-subtle">
                        {column.sqlType}
                        {!column.nullable ? ' NOT NULL' : ''}
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1">
                        <FieldWidget
                          column={column}
                          state={state}
                          onDraft={(next) => setField(column.name, next)}
                        />
                      </div>
                      {column.nullable && (
                        <button
                          type="button"
                          onClick={() =>
                            setField(column.name, {
                              draft: NULL_SENTINEL,
                              touched: true,
                            })
                          }
                          title="Set to NULL"
                          className={PILL}
                        >
                          NULL
                        </button>
                      )}
                      {column.defaultExpr && (
                        <button
                          type="button"
                          onClick={() =>
                            setField(column.name, {
                              draft: DEFAULT_SENTINEL,
                              touched: true,
                            })
                          }
                          title={`Use declared DEFAULT (${column.defaultExpr})`}
                          className={PILL}
                        >
                          DEFAULT
                        </button>
                      )}
                      {state.touched && (
                        <button
                          type="button"
                          onClick={() =>
                            setField(column.name, { draft: '', touched: false })
                          }
                          title="Omit from INSERT (engine applies its own default)"
                          className={`${PILL} text-fg-subtle`}
                        >
                          ⨯
                        </button>
                      )}
                    </div>
                    {error && (
                      <p className="text-[11px] text-danger">{error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {globalError && (
          <div className="border-t border-edge bg-danger-subtle px-4 py-2 text-[11px] text-danger">
            {globalError}
          </div>
        )}

        <footer className="flex items-center justify-between gap-2 border-t border-edge bg-canvas px-4 py-3">
          <p className="text-[11px] text-fg-subtle">
            <span className="text-accent">*</span> primary key
            {' · '}
            <span className="text-danger">!</span> required (NOT NULL, no DEFAULT)
            {' · '}
            <span className="text-fg-subtle">empty fields omitted from INSERT</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Insert
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
