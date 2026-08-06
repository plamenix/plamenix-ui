import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ErrorBanner } from './ErrorBanner';
import { ResultTable } from './ResultTable';
import { useDisplayStore } from './display-store';
import { inferEditableTable } from './inline-edit';
import {
  buildFilterPredicate,
  injectWhereClause,
  type ColumnFilter,
} from './filters';
import {
  wrapWithSortAndLimit,
  type OrderBy,
  type Pagination,
} from './pagination';
import type { ColumnInfo, Schema, StatementOutcome } from './types';

export interface MultiResultViewProps {
  /** Tab the view renders for. Threaded through to inner
   *  {@link ResultTable} instances for event emit + interceptor
   *  context (cell-commit, row-insert, row-delete). */
  tabId: string;
  /** Session backing the outcomes. `null` when between sessions. */
  sessionId: string | null;
  /** Per-statement outcomes from the most recent batch execute. */
  outcomes: StatementOutcome[];
  /** Pixel height for each result viewport. Defaults to 360 so several
   *  outcomes fit on one screen without thrashing the scrollbar. */
  height?: number;
  /** Active session's schema. When provided alongside `onCommitCellEdit`
   *  the result tables turn into inline editors (and bulk-action
   *  surfaces) for single-table SELECT outcomes whose projection
   *  includes the PK. */
  schema?: Schema | null | undefined;
  /** Host-side SQL round-trip used by both inline cell edits and the
   *  bulk DELETE/UPDATE toolbar. Resolve to confirm, reject (with a
   *  useful message) to revert the affected cells / rows. */
  onCommitCellEdit?: ((sql: string) => Promise<void>) | undefined;
  /** Host-side re-run hook for the per-column filter bar. The new
   *  SQL has the filter predicate spliced into the original `SELECT`;
   *  the host typically pipes it through the same execute path as a
   *  manual run so `tab.results` is replaced. */
  onApplyFilter?: ((sql: string) => Promise<void>) | undefined;
  /** Persisted per-column pixel widths for the result tables. Same
   *  map applies to every outcome card in this view; column names
   *  collide rarely enough that one shared map keeps the UX simple. */
  columnWidths?: Record<string, number> | undefined;
  onColumnWidthsChange?: ((next: Record<string, number>) => void) | undefined;
  /** Host-side BLOB fetcher; resolves with hex bytes for `blobId`. */
  onFetchBlob?: ((blobId: string) => Promise<string>) | undefined;
  /** Host-side row counter used by the "select all in database"
   *  bulk-scope flow. Receives the WHERE predicate built from the
   *  active filters (`null` when none active) plus the table name,
   *  resolves with the total row count. */
  onCountAllRows?:
    | ((args: { table: string; predicate: string | null }) => Promise<number>)
    | undefined;
  /** Host-side row fetcher for the G5 db-scope export path. Receives
   *  the scoped table + the active WHERE predicate, returns the rows. */
  onFetchScopedRows?:
    | ((args: { table: string; predicate: string | null }) =>
        Promise<{ cells: import('./types').ColumnValue[] }[]>)
    | undefined;
}

/**
 * Renders one card per statement outcome from a multi-statement batch.
 *
 * Successful outcomes show a {@link ResultTable}; failed outcomes show
 * the error inline. Each card carries the statement preview (first
 * non-empty line) and a duration badge so users can correlate the
 * result with the SQL they ran.
 */
export function MultiResultView({
  tabId,
  sessionId,
  outcomes,
  height = 360,
  schema = null,
  onCommitCellEdit,
  onApplyFilter,
  columnWidths,
  onColumnWidthsChange,
  onFetchBlob,
  onCountAllRows,
  onFetchScopedRows,
}: MultiResultViewProps) {
  if (outcomes.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {outcomes.map((o, i) => (
        <StatementCard
          key={i}
          tabId={tabId}
          sessionId={sessionId}
          index={i + 1}
          total={outcomes.length}
          outcome={o}
          height={height}
          schema={schema}
          onCommitCellEdit={onCommitCellEdit}
          onApplyFilter={onApplyFilter}
          columnWidths={columnWidths}
          onColumnWidthsChange={onColumnWidthsChange}
          onFetchBlob={onFetchBlob}
          onCountAllRows={onCountAllRows}
          onFetchScopedRows={onFetchScopedRows}
        />
      ))}
    </div>
  );
}

interface StatementCardProps {
  tabId: string;
  sessionId: string | null;
  index: number;
  total: number;
  outcome: StatementOutcome;
  height: number;
  schema: Schema | null;
  onCommitCellEdit?: ((sql: string) => Promise<void>) | undefined;
  onApplyFilter?: ((sql: string) => Promise<void>) | undefined;
  columnWidths?: Record<string, number> | undefined;
  onColumnWidthsChange?: ((next: Record<string, number>) => void) | undefined;
  onFetchBlob?: ((blobId: string) => Promise<string>) | undefined;
  onCountAllRows?:
    | ((args: { table: string; predicate: string | null }) => Promise<number>)
    | undefined;
  onFetchScopedRows?:
    | ((args: { table: string; predicate: string | null }) =>
        Promise<{ cells: import('./types').ColumnValue[] }[]>)
    | undefined;
}

function StatementCard({
  tabId,
  sessionId,
  index,
  total,
  outcome,
  height,
  schema,
  onCommitCellEdit,
  onApplyFilter,
  columnWidths,
  onColumnWidthsChange,
  onFetchBlob,
  onCountAllRows,
  onFetchScopedRows,
}: StatementCardProps) {
  const defaultPageSize = useDisplayStore((s) => s.defaultPageSize);
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [orderBy, setOrderBy] = useState<OrderBy | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  // First-ever SQL we observed for this card position — used as the
  // base when injecting filter predicates so successive filter edits
  // do not stack WHERE clauses on top of an already-filtered SELECT.
  const originalSqlRef = useRef<string>(outcome.sql);
  // Records the SQL we last fired through `onApplyFilter`. When the
  // host hands us back a *different* `outcome.sql` we know the user
  // ran a fresh query manually and we must reset the base.
  const lastFilteredSqlRef = useRef<string>(outcome.sql);
  useEffect(() => {
    if (outcome.sql !== lastFilteredSqlRef.current) {
      originalSqlRef.current = outcome.sql;
      lastFilteredSqlRef.current = outcome.sql;
      setFilters([]);
      setOrderBy(null);
      setPagination(null);
    }
  }, [outcome.sql]);
  const editable = editableForOutcome(outcome, schema);

  /** Composes the final SQL from the base + filters + sort + paging
   *  state. Used by every interactive change handler. */
  const composeAndRun = (
    nextFilters: ColumnFilter[],
    nextOrder: OrderBy | null,
    nextPage: Pagination | null,
  ) => {
    if (!onApplyFilter) return;
    const infoByName = new Map<string, ColumnInfo>();
    if (editable) {
      editable.columnInfoByIndex.forEach((info) => {
        if (info) infoByName.set(info.name, info);
      });
    }
    const predicate = editable ? buildFilterPredicate(nextFilters, infoByName) : null;
    const withFilter =
      predicate === null
        ? originalSqlRef.current
        : injectWhereClause(originalSqlRef.current, predicate);
    const sql = wrapWithSortAndLimit(withFilter, nextOrder, nextPage);
    lastFilteredSqlRef.current = sql;
    void onApplyFilter(sql);
  };

  const handleFiltersChange = (next: ColumnFilter[]) => {
    setFilters(next);
    // Re-filtering invalidates the current page — go back to first.
    const resetPage = pagination ? { offset: 0, limit: pagination.limit } : null;
    setPagination(resetPage);
    composeAndRun(next, orderBy, resetPage);
  };

  const handleOrderByChange = (next: OrderBy | null) => {
    setOrderBy(next);
    const resetPage = pagination ? { offset: 0, limit: pagination.limit } : null;
    setPagination(resetPage);
    composeAndRun(filters, next, resetPage);
  };

  const handlePaginationChange = (next: Pagination) => {
    setPagination(next);
    composeAndRun(filters, orderBy, next);
  };

  /** Pagination is server-driven. Enable it the first time the user
   *  asks (e.g. clicks Next or picks a page size). Until then the
   *  table renders as the unconstrained virtualised list it always
   *  did, so existing UX is unchanged for casual queries. */
  const effectivePagination =
    pagination ?? (onApplyFilter ? { offset: 0, limit: defaultPageSize } : null);
  const ok = outcome.status === 'ok';
  const preview = previewSql(outcome.sql);

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-panel">
      <header
        className={`flex items-center gap-2 border-b border-edge px-3 py-1.5 ${
          ok ? 'bg-canvas' : 'bg-danger-subtle'
        }`}
      >
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
        )}
        {total > 1 && (
          <span className="shrink-0 rounded bg-elevated px-1.5 py-px font-mono text-[10px] text-fg-subtle">
            {index}/{total}
          </span>
        )}
        <span className="flex-1" />
        <span
          className="shrink-0 font-mono text-[10px] text-fg-subtle"
          title={outcome.sql}
        >
          {outcome.durationMs.toLocaleString()} ms
        </span>
      </header>

      {ok ? (
        <ResultTable
          tabId={tabId}
          sessionId={sessionId}
          result={outcome.result}
          height={height}
          embedded
          editable={editable}
          onCommit={onCommitCellEdit}
          filters={filters}
          onFiltersChange={onApplyFilter ? handleFiltersChange : undefined}
          columnWidths={columnWidths}
          onColumnWidthsChange={onColumnWidthsChange}
          onFetchBlob={onFetchBlob}
          orderBy={orderBy}
          onOrderByChange={onApplyFilter ? handleOrderByChange : undefined}
          pagination={effectivePagination}
          onPaginationChange={onApplyFilter ? handlePaginationChange : undefined}
          onCountAllRows={
            onCountAllRows && editable
              ? (predicate) =>
                  onCountAllRows({ table: editable.table.name, predicate })
              : undefined
          }
          onFetchScopedRows={
            onFetchScopedRows && editable ? onFetchScopedRows : undefined
          }
        />
      ) : (
        <div className="bg-canvas p-3">
          <ErrorBanner error={outcome.error} compact />
        </div>
      )}
    </div>
  );
}

function editableForOutcome(outcome: StatementOutcome, schema: Schema | null) {
  if (outcome.status !== 'ok') return null;
  const r = outcome.result;
  if ('Rows' in r) {
    return inferEditableTable(outcome.sql, r.Rows.columns, schema);
  }
  return null;
}

function previewSql(sql: string): string {
  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('--')) return trimmed;
  }
  return sql.trim();
}
