import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
} from '@tanstack/react-table';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Asterisk,
  ChevronDown,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Database,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  ListFilter,
  Inbox,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { BlobViewer } from './BlobViewer';
import { RowEditorModal } from './RowEditorModal';
import { emitCellCommitted, emitRowDeleted } from '../events/data-events.js';
import { cellCommittingChain } from '../interceptors/cell-committing.js';
import { rowDeletingChain } from '../interceptors/row-deleting.js';
import { useDisplayStore, type ExportFormat } from './display-store';
import { formatDateCell } from './date-format';
import {
  cellToCsv,
  cellToJson,
  cellToPlainText,
  cellToSqlLiteral,
  cellToXlsx,
  cellToXmlText,
  escapeXml,
  quoteCsvField,
  quoteIdentForExport,
  timestampFilename,
  triggerDownload,
  type XlsxCell,
} from './cell-format';
import type { BlobRef } from './types';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pickCellRenderer,
  type CellRendererContext,
  type CellRendererPayload,
} from './cell-renderer-contract';
import { registerBuiltinBlobRenderer } from './builtins/blob-cell-renderer';
import { registerBuiltinCsvExport } from './builtins/csv-export';
import { registerBuiltinJsonExport } from './builtins/json-export';
import { registerBuiltinSqlExport } from './builtins/sql-export';
import { registerBuiltinXmlExport } from './builtins/xml-export';
import { registerBuiltinXlsxExport } from './builtins/xlsx-export';
import {
  pluginContributionsToExportButtons,
  type ExportFormatArgs,
  type ExportFormatPayload,
  type ExportFormatResult,
} from './export-format-contract';
import {
  FILTER_OPERATORS,
  buildFilterPredicate,
  findFilter,
  operatorIsUnary,
  setFilter as setColumnFilter,
  type ColumnFilter,
  type FilterOperator,
} from './filters';
import { FilterBuilderModal } from './FilterBuilderModal';
import { PAGE_SIZE_OPTIONS, nextOrderBy, type OrderBy, type Pagination } from './pagination';
import {
  buildAllRowsDeleteSql,
  buildAllRowsUpdateSql,
  buildBulkDeleteSql,
  buildBulkUpdateSql,
  buildUpdateSql,
  cellToLiteral,
  isDateType,
  isFloatType,
  isIntegerType,
  isTimeType,
  isTimestampType,
  numericStepFor,
  parseEditedValue,
  DEFAULT_SENTINEL,
  NULL_SENTINEL,
  type EditableContext,
} from './inline-edit';
import type { ColumnInfo, ColumnValue, QueryResult } from './types';

export interface ResultTableProps {
  /** Tab the table renders for. Threaded through event emits +
   *  interceptor chains so cell-commit / row-insert / row-delete
   *  events + policy gates carry the originating tab id. */
  tabId: string;
  /** Session backing the result. `null` when the tab is between
   *  sessions (e.g. immediately after disconnect — the table can
   *  still render a stale result snapshot). */
  sessionId: string | null;
  /** Outcome of the most recent `db.execute` call. */
  result: QueryResult;
  /** Pixel height of the scroll viewport. Defaults to 480; pass a
   *  smaller value when embedding inside a tighter container. */
  height?: number;
  /** When true, drops the outer rounded border so the table can sit
   *  cleanly inside a parent card (e.g. {@link MultiResultView}). */
  embedded?: boolean;
  /** When provided, cells become double-click editable subject to the
   *  rules in {@link EditableContext}. Pass `null` to keep the table
   *  read-only (the default). The same context unlocks bulk row
   *  selection + DELETE/UPDATE through the selection toolbar. */
  editable?: EditableContext | null | undefined;
  /** Host-side SQL executor. Resolves when the host has confirmed the
   *  round-trip; rejects to revert the optimistic state. Used for both
   *  single-cell edits and bulk DELETE/UPDATE on selected rows. */
  onCommit?: ((sql: string) => Promise<void>) | undefined;
  /** Active per-column filters. Controlled by the host (typically
   *  {@link MultiResultView}) so re-renders do not lose state. */
  filters?: ColumnFilter[] | undefined;
  /** Notifies the host when the user adjusts a column filter. The
   *  callback receives the next filter list; the host re-runs the
   *  SELECT with the updated predicate. Omit to keep the table
   *  read-only with respect to filtering. */
  onFiltersChange?: ((next: ColumnFilter[]) => void) | undefined;
  /** Per-column pixel widths keyed by column name. Persisted across
   *  queries so a resized `ID` column stays the same width on rerun. */
  columnWidths?: Record<string, number> | undefined;
  /** Notifies the host when the user finishes dragging a resize
   *  handle. The callback receives the full next map; the host
   *  typically writes it back to the tab store. */
  onColumnWidthsChange?: ((next: Record<string, number>) => void) | undefined;
  /** Host-side BLOB body fetcher. Resolves with hex-encoded bytes for
   *  `blobId`; rejects when the cache no longer holds the id. Required
   *  for the inline BLOB viewer to render anything more than the peek. */
  onFetchBlob?: ((blobId: string) => Promise<string>) | undefined;
  /** Current sort key + direction, or `null` for natural order. */
  orderBy?: OrderBy | null | undefined;
  /** Notifies the host when the user clicks a column header. The
   *  callback fires `null` to clear the sort. Omit to keep header
   *  clicks inert. */
  onOrderByChange?: ((next: OrderBy | null) => void) | undefined;
  /** Current page window. When set the footer renders pagination
   *  controls; when omitted (or `null`) the table renders as one big
   *  scrollable list. */
  pagination?: Pagination | null | undefined;
  /** Notifies the host when the user changes page or page size. */
  onPaginationChange?: ((next: Pagination) => void) | undefined;
  /** Host-side row counter for the "select all in database" scope.
   *  Receives the WHERE predicate built from the active filters
   *  (`null` when none are active) and resolves with the total row
   *  count. When omitted, the expand-scope action is hidden and the
   *  user is limited to per-page bulk operations. */
  onCountAllRows?: ((predicate: string | null) => Promise<number>) | undefined;
  /** Host-side row fetcher for the db-scope export path. Runs
   *  `SELECT * FROM <table> [WHERE predicate]` and returns the rows.
   *  When omitted, the toolbar export buttons fall back to the loaded
   *  result rows even while db-scope is active. */
  onFetchScopedRows?:
    | ((args: { table: string; predicate: string | null }) => Promise<RowArg>)
    | undefined;
}

/** Estimated row height fed to TanStack Virtual. Real measurement
 *  happens through `measureElement`; this only seeds the layout so the
 *  scrollbar lands close to the right place on first render. */
const ROW_HEIGHT_ESTIMATE = 32;
/** Renders this many rows above/below the viewport so quick scrolls
 *  do not flash empty space. */
const OVERSCAN = 12;
/** Default width assumed by the resize handle when the column has
 *  never been resized. The browser computes the actual rendered width
 *  from content; we only need a baseline for delta math. */
const DEFAULT_COL_WIDTH = 160;
/** Floor enforced by the resize handle so columns cannot collapse
 *  to zero and become un-clickable. */
const MIN_COL_WIDTH = 40;

function isNumeric(cell: ColumnValue): boolean {
  // `decimal` counts: NUMERIC/DECIMAL are numbers carried as exact text,
  // so they right-align and format like the other numeric kinds.
  return cell.type === 'integer' || cell.type === 'decimal' || cell.type === 'float';
}

/** String form used to seed the inline editor when a cell is opened.
 *  When `column` is supplied the seed is normalised for the type-aware
 *  HTML widget (e.g. `YYYY-MM-DDTHH:MM:SS` for `<input type="datetime-local">`). */
function cellToDraft(cell: ColumnValue, column: ColumnInfo | null): string {
  switch (cell.type) {
    case 'null':
      return '';
    case 'text': {
      if (!column) return cell.value;
      const sql = column.sqlType.toUpperCase();
      if (isTimestampType(sql)) {
        // NaiveDateTime stringifies as `YYYY-MM-DD HH:MM:SS[.ns]`;
        // `<input type="datetime-local">` wants the ISO-8601 `T`
        // separator. Trim fractional precision past seconds — the
        // input does not accept nanoseconds and silently rejects it.
        return cell.value.replace(' ', 'T').replace(/(\.\d{0,3})\d*$/, '$1');
      }
      if (isTimeType(sql)) {
        // `<input type="time">` only accepts HH:MM[:SS]; strip any
        // fractional seconds Firebird returned.
        return cell.value.replace(/(\.\d+)$/, '');
      }
      return cell.value;
    }
    case 'integer':
    case 'decimal':
    case 'float':
      return String(cell.value);
    case 'bool':
      return cell.value ? 'true' : 'false';
    case 'blob':
      return '';
  }
}

interface CellContext {
  /** Header column name for the BLOB-viewer modal title. */
  columnName: string;
  /** Full column metadata when available — surfaced to plugin cell
   *  renderers via the `cell_renderers` contribution-point context. */
  columnInfo: ColumnInfo | null;
  /** Zero-based row index within the current result page. */
  rowIndex: number;
  /** Zero-based column index within the current result row. */
  colIndex: number;
  /** Fired when a BLOB cell is clicked; the host opens the viewer.
   *  Kept on the legacy default-switch fallback path; the built-in
   *  BLOB renderer (I4.1) reads `openBlobViewer` from a shell-scoped
   *  callback registered with the registry at ResultTable mount. */
  onBlobClick: (ref: BlobRef, columnName: string) => void;
}

/** Auto-focusing typed input rendered in place of a cell while it is
 *  being edited. Picks the appropriate HTML widget for the column's
 *  declared SQL type and surfaces NULL / DEFAULT toggle buttons when
 *  the column allows them.
 *
 *  Keybindings (single-line widgets): Enter commits, Escape cancels,
 *  blur commits — letting the user click another cell to save. The
 *  BOOLEAN checkbox skips keyboard handling and commits via the
 *  parent state machine when the user blurs the surrounding row.
 *
 *  When `column` is `null` (projection that does not match a base
 *  table column), falls back to a plain text input. */
function TypedEditingInput({
  draft,
  column,
  onDraft,
  onCommit,
  onCancel,
}: {
  draft: string;
  column: ColumnInfo | null;
  onDraft: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current?.type === 'text' || inputRef.current?.type === 'number') {
      inputRef.current.select();
    }
  }, []);

  const sql = column?.sqlType.toUpperCase() ?? '';
  const isSentinel = draft === NULL_SENTINEL || draft === DEFAULT_SENTINEL;
  const showNullToggle = !!column?.nullable;
  const showDefaultToggle = !!column?.defaultExpr;

  const commitWithToggle = (sentinel: string) => {
    onDraft(sentinel);
    // Defer to flush React state before the commit reads it.
    queueMicrotask(onCommit);
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // The sentinel previews show what the commit will emit without
  // letting the user type into the widget any further.
  const sentinelPill = isSentinel ? (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${
        draft === NULL_SENTINEL
          ? 'bg-fg-subtle/20 italic text-fg-subtle'
          : 'bg-accent-subtle text-accent'
      }`}
    >
      {draft === NULL_SENTINEL ? 'NULL' : 'DEFAULT'}
    </span>
  ) : null;

  const widget = (() => {
    if (isSentinel) {
      // Hidden text input so keyboard commit/escape still work.
      return (
        <input
          ref={inputRef}
          value={draft === NULL_SENTINEL ? 'NULL' : 'DEFAULT'}
          readOnly
          onKeyDown={onKey}
          onBlur={onCommit}
          className="w-full min-w-[5rem] rounded border border-accent bg-canvas px-1 py-0.5 font-mono text-xs italic text-fg-subtle outline-none ring-2 ring-accent/30"
        />
      );
    }
    if (column && sql === 'BOOLEAN') {
      const checked = draft.toLowerCase() === 'true' || draft === '1';
      return (
        <input
          ref={inputRef}
          type="checkbox"
          checked={checked}
          onChange={(e) => onDraft(e.target.checked ? 'true' : 'false')}
          onKeyDown={onKey}
          onBlur={onCommit}
          className="h-4 w-4 cursor-pointer accent-accent"
          aria-label={`${column.name} boolean toggle`}
        />
      );
    }
    if (column && isDateType(sql)) {
      return (
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={onCommit}
          className="w-full min-w-[8rem] rounded border border-accent bg-canvas px-1 py-0.5 font-mono text-xs text-fg outline-none ring-2 ring-accent/30"
        />
      );
    }
    if (column && isTimeType(sql)) {
      return (
        <input
          ref={inputRef}
          type="time"
          step="1"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={onCommit}
          className="w-full min-w-[7rem] rounded border border-accent bg-canvas px-1 py-0.5 font-mono text-xs text-fg outline-none ring-2 ring-accent/30"
        />
      );
    }
    if (column && isTimestampType(sql)) {
      return (
        <input
          ref={inputRef}
          type="datetime-local"
          step="1"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={onCommit}
          className="w-full min-w-[12rem] rounded border border-accent bg-canvas px-1 py-0.5 font-mono text-xs text-fg outline-none ring-2 ring-accent/30"
        />
      );
    }
    if (column && (isIntegerType(sql) || isFloatType(sql))) {
      const step = isIntegerType(sql) ? '1' : numericStepFor(sql);
      return (
        <input
          ref={inputRef}
          type="number"
          step={step}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={onCommit}
          className="w-full min-w-[6rem] rounded border border-accent bg-canvas px-1 py-0.5 text-right font-mono text-xs tabular-nums text-fg outline-none ring-2 ring-accent/30"
        />
      );
    }
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={onCommit}
        className="w-full min-w-[6rem] rounded border border-accent bg-canvas px-1 py-0.5 font-mono text-xs text-fg outline-none ring-2 ring-accent/30"
      />
    );
  })();

  if (!showNullToggle && !showDefaultToggle) {
    return widget;
  }

  return (
    <span className="inline-flex items-center gap-1">
      {sentinelPill ?? widget}
      {showNullToggle && (
        <button
          type="button"
          // `onMouseDown` instead of `onClick` so the widget's `onBlur`
          // does not fire first and commit the wrong draft.
          onMouseDown={(e) => {
            e.preventDefault();
            commitWithToggle(NULL_SENTINEL);
          }}
          title="Set to NULL"
          className="rounded border border-edge px-1 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:bg-fg-subtle/15 hover:text-fg"
        >
          NULL
        </button>
      )}
      {showDefaultToggle && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            commitWithToggle(DEFAULT_SENTINEL);
          }}
          title={`Set to declared DEFAULT (${column?.defaultExpr})`}
          className="rounded border border-edge px-1 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:bg-fg-subtle/15 hover:text-fg"
        >
          DEFAULT
        </button>
      )}
    </span>
  );
}

/** Per-type cell rendering: nulls italic-subtle, numbers right-aligned
 *  tabular, booleans pill-coded, blobs warning-tinted hex preview.
 *
 *  Plugin cell-renderer dispatch (I3.4 / contribution point
 *  `cell_renderers`): contributions are consulted before the built-in
 *  per-type switch. First contribution whose `matches(ctx)` returns
 *  true wins (priority order, lower-first). When none claims the
 *  cell the default switch runs — built-in renderers extracted via
 *  the internal-server pattern (BLOB viewer, image thumb, JSON tree,
 *  etc.) land in I4 and register through the same registry, at which
 *  point the default switch becomes a no-op fallback. */
function CellContent({ cell, ctx }: { cell: ColumnValue; ctx: CellContext }) {
  const nullDisplay = useDisplayStore((s) => s.nullDisplay);
  const dateFormat = useDisplayStore((s) => s.dateFormat);
  const renderers = usePluginContributions<CellRendererPayload>('cell_renderers');
  const rendererCtx: CellRendererContext = {
    cell,
    columnName: ctx.columnName,
    columnInfo: ctx.columnInfo,
    rowIndex: ctx.rowIndex,
    colIndex: ctx.colIndex,
  };
  const claimed = pickCellRenderer(renderers, rendererCtx);
  if (claimed) {
    const Component = claimed.Component;
    return <Component ctx={rendererCtx} />;
  }
  switch (cell.type) {
    case 'null':
      return (
        <span className="italic text-fg-subtle">{nullDisplay === '' ? ' ' : nullDisplay}</span>
      );
    case 'text':
      return <>{formatDateCell(cell.value, dateFormat)}</>;
    case 'integer':
    case 'decimal':
    case 'float':
      return <span className="tabular-nums">{cell.value}</span>;
    case 'bool':
      return (
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            cell.value ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
          }`}
        >
          {cell.value ? 'true' : 'false'}
        </span>
      );
    case 'blob': {
      const preview = cell.value.peekHex.slice(0, 16);
      const truncated = cell.value.sizeBytes * 2 > preview.length;
      return (
        <button
          type="button"
          onClick={() => ctx.onBlobClick(cell.value, ctx.columnName)}
          title="Open BLOB viewer"
          className="inline-flex items-center gap-1 rounded bg-warning-subtle px-1.5 py-0.5 font-mono text-[10px] text-warning transition-colors hover:bg-warning hover:text-warning-subtle"
        >
          <span className="font-semibold">BLOB</span>
          <span>
            0x{preview}
            {truncated ? '…' : ''}
          </span>
        </button>
      );
    }
  }
}

/** Per-cell copy icon. Lives inside the cell's render span and
 *  appears on cell hover via the `group/cell` ancestor. Emits the
 *  type-aware plain-text rendering (see `cellToPlainText`) to the
 *  clipboard. BLOB cells copy the leading hex preview only — the
 *  full body needs an explicit fetch via the BLOB viewer. */
function CellCopyButton({
  cell,
  rowIdx,
  colIdx,
  flash,
  onCopy,
}: {
  cell: ColumnValue;
  rowIdx: number;
  colIdx: number;
  flash: { rowIdx: number; colIdx: number } | null;
  onCopy: (rowIdx: number, colIdx: number, cell: ColumnValue) => void;
}) {
  const isFlashed = flash !== null && flash.rowIdx === rowIdx && flash.colIdx === colIdx;
  const titleBase =
    cell.type === 'blob'
      ? 'Copy hex preview (open BLOB viewer for full body)'
      : cell.type === 'null'
        ? 'Copy cell (empty for NULL)'
        : 'Copy cell value';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCopy(rowIdx, colIdx, cell);
      }}
      title={isFlashed ? 'Copied!' : titleBase}
      aria-label={titleBase}
      className="flex h-4 w-4 items-center justify-center rounded text-fg-subtle opacity-0 transition-opacity hover:bg-elevated hover:text-fg group-hover/cell:opacity-100"
    >
      {isFlashed ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/** Per-row hover toolbar — 4 small copy buttons that appear on row
 *  hover and emit one of `sql` / `json` / `csv` / `raw` to the
 *  clipboard. The clicked button briefly swaps its icon to a check
 *  via `flash` state from the parent. */
function RowCopyToolbar({
  rowIdx,
  flash,
  onCopy,
}: {
  rowIdx: number;
  flash: { rowIdx: number; kind: RowCopyKind } | null;
  onCopy: (rowIdx: number, kind: RowCopyKind) => void;
}) {
  const entries: { kind: RowCopyKind; icon: typeof Copy; title: string }[] = [
    { kind: 'sql', icon: FileCode, title: 'Copy as SQL INSERT' },
    { kind: 'json', icon: FileJson, title: 'Copy as JSON' },
    { kind: 'csv', icon: FileText, title: 'Copy as CSV line' },
    { kind: 'raw', icon: Type, title: 'Copy as tab-separated text' },
  ];
  return (
    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
      {entries.map((e) => {
        const Icon = e.icon;
        const isFlashed = flash !== null && flash.rowIdx === rowIdx && flash.kind === e.kind;
        return (
          <button
            key={e.kind}
            type="button"
            onClick={() => onCopy(rowIdx, e.kind)}
            title={isFlashed ? 'Copied!' : e.title}
            aria-label={e.title}
            className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            {isFlashed ? <Check className="h-3 w-3 text-success" /> : <Icon className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Virtualised render of a `QueryResult`.
 *
 * Affected-row results render inline; row results render through a
 * sticky-header table backed by `@tanstack/react-virtual`, so multi-
 * thousand-row result sets stay smooth without flooding the DOM.
 */
export function ResultTable({
  tabId,
  sessionId,
  result,
  height = 480,
  embedded = false,
  editable = null,
  onCommit,
  filters,
  onFiltersChange,
  columnWidths,
  onColumnWidthsChange,
  onFetchBlob,
  orderBy,
  onOrderByChange,
  pagination,
  onPaginationChange,
  onCountAllRows,
  onFetchScopedRows,
}: ResultTableProps) {
  if ('Affected' in result) {
    const n = result.Affected.rows;
    return (
      <div
        className={`flex items-center gap-3 bg-panel px-4 py-3 ${
          embedded ? '' : 'rounded-lg border border-edge'
        }`}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success-subtle">
          <CheckCircle2 className="h-4 w-4 text-success" />
        </div>
        <div className="text-sm text-fg-muted">
          <span className="font-mono font-semibold text-fg">{n.toLocaleString()}</span> row
          {n === 1 ? '' : 's'} affected
        </div>
      </div>
    );
  }

  const { columns, rows, truncated } = result.Rows;
  return (
    <VirtualRows
      tabId={tabId}
      sessionId={sessionId}
      columns={columns}
      rows={rows}
      height={height}
      embedded={embedded}
      truncated={truncated ?? false}
      editable={editable}
      onCommit={onCommit}
      filters={filters}
      onFiltersChange={onFiltersChange}
      columnWidths={columnWidths}
      onColumnWidthsChange={onColumnWidthsChange}
      onFetchBlob={onFetchBlob}
      orderBy={orderBy}
      onOrderByChange={onOrderByChange}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      onCountAllRows={onCountAllRows}
      onFetchScopedRows={onFetchScopedRows}
    />
  );
}

/** Format the row-hover copy toolbar emits. */
type RowCopyKind = 'sql' | 'json' | 'csv' | 'raw';

interface VirtualRowsProps {
  tabId: string;
  sessionId: string | null;
  columns: { name: string }[];
  rows: { cells: ColumnValue[] }[];
  height: number;
  embedded: boolean;
  truncated: boolean;
  editable: EditableContext | null;
  onCommit?: ((sql: string) => Promise<void>) | undefined;
  filters?: ColumnFilter[] | undefined;
  onFiltersChange?: ((next: ColumnFilter[]) => void) | undefined;
  columnWidths?: Record<string, number> | undefined;
  onColumnWidthsChange?: ((next: Record<string, number>) => void) | undefined;
  onFetchBlob?: ((blobId: string) => Promise<string>) | undefined;
  orderBy?: OrderBy | null | undefined;
  onOrderByChange?: ((next: OrderBy | null) => void) | undefined;
  pagination?: Pagination | null | undefined;
  onPaginationChange?: ((next: Pagination) => void) | undefined;
  onCountAllRows?: ((predicate: string | null) => Promise<number>) | undefined;
  onFetchScopedRows?:
    | ((args: { table: string; predicate: string | null }) => Promise<RowArg>)
    | undefined;
}

type RowsArg = { name: string }[];
type RowArg = { cells: ColumnValue[] }[];

interface ExportScope {
  /** Suffix appended to the export button labels (`" (3 selected)"`,
   *  `" (all 1,250)"`, or empty). */
  label: string;
}

/** Decides the export scope label based on selection + db-scope state.
 *  Empty when the user has no selection and db-scope is not active. */
function exportScope(
  dbScopeActive: boolean,
  dbScopeCount: number | null,
  selectedRows: Set<number>,
  totalLoaded: number,
): ExportScope {
  if (dbScopeActive) {
    const n = dbScopeCount;
    if (n !== null) return { label: ` (all ${n.toLocaleString()})` };
    return { label: ' (all)' };
  }
  if (selectedRows.size > 0 && selectedRows.size < totalLoaded) {
    return { label: ` (${selectedRows.size.toLocaleString()} selected)` };
  }
  if (selectedRows.size > 0 && selectedRows.size === totalLoaded) {
    return { label: ` (${selectedRows.size.toLocaleString()} selected)` };
  }
  return { label: '' };
}

/** Resolves the row set to feed into a download function. Three cases:
 *  - dbScope + fetcher → engine-side SELECT against the scoped table.
 *  - selectedRows non-empty → in-memory filter by original row index.
 *  - otherwise → the loaded result rows verbatim. */
async function resolveExportRows(args: {
  scope: ExportScope;
  rows: RowArg;
  selectedRows: Set<number>;
  dbScopeActive: boolean;
  onFetchScopedRows:
    | ((args: { table: string; predicate: string | null }) => Promise<RowArg>)
    | undefined;
  editable: EditableContext | null;
  predicate: string | null;
}): Promise<RowArg> {
  if (args.dbScopeActive && args.onFetchScopedRows && args.editable) {
    return args.onFetchScopedRows({
      table: args.editable.table.name,
      predicate: args.predicate,
    });
  }
  if (args.selectedRows.size > 0) {
    return args.rows.filter((_, idx) => args.selectedRows.has(idx));
  }
  return args.rows;
}

function toCsv(columns: RowsArg, rows: RowArg, delimiter: string): string {
  const header = columns.map((c) => quoteCsvField(c.name, delimiter)).join(delimiter);
  const body = rows
    .map((r) => r.cells.map((c) => cellToCsv(c, delimiter)).join(delimiter))
    .join('\r\n');
  return `${header}\r\n${body}\r\n`;
}

function toJson(columns: RowsArg, rows: RowArg): string {
  return JSON.stringify(
    rows.map((r) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((c, i) => {
        obj[c.name] = cellToJson(r.cells[i]);
      });
      return obj;
    }),
    null,
    2,
  );
}

function downloadCsv(columns: RowsArg, rows: RowArg, delimiter: string): void {
  triggerDownload(toCsv(columns, rows, delimiter), timestampFilename('csv'), 'text/csv');
}

function downloadJson(columns: RowsArg, rows: RowArg): void {
  triggerDownload(toJson(columns, rows), timestampFilename('json'), 'application/json');
}

/** Builds the SQL export body: optionally CREATE TABLE DDL, then one
 *  INSERT per row. When `editable` is null the source table is
 *  unknown, so DDL is skipped and the INSERT uses a `<TABLE>`
 *  placeholder the user can find-and-replace. */
function toSql(
  columns: RowsArg,
  rows: RowArg,
  editable: EditableContext | null,
  includeDdl: boolean,
): string {
  const tableName = editable?.table.name ?? '<TABLE>';
  const ident = editable ? quoteIdentForExport(editable.table.name) : '<TABLE>';
  const colList = columns.map((c) => quoteIdentForExport(c.name)).join(', ');
  const out: string[] = [];
  if (editable && includeDdl) {
    out.push(`-- DDL`);
    out.push(`CREATE TABLE ${ident} (`);
    editable.table.columns.forEach((c, i, arr) => {
      const tail = i === arr.length - 1 ? '' : ',';
      out.push(
        `    ${quoteIdentForExport(c.name)} ${c.sqlType}${c.nullable ? '' : ' NOT NULL'}${tail}`,
      );
    });
    const pk = editable.table.primaryKey ?? [];
    if (pk.length > 0) {
      out[out.length - 1] += ',';
      out.push(`    PRIMARY KEY (${pk.map(quoteIdentForExport).join(', ')})`);
    }
    out.push(`);`);
    out.push(``);
  }
  out.push(`-- Data for ${tableName}`);
  for (const row of rows) {
    const values = columns.map((_, i) => cellToSqlLiteral(row.cells[i])).join(', ');
    out.push(`INSERT INTO ${ident} (${colList}) VALUES (${values});`);
  }
  return out.join('\n') + '\n';
}

function downloadSql(
  columns: RowsArg,
  rows: RowArg,
  editable: EditableContext | null,
  includeDdl: boolean,
): void {
  triggerDownload(
    toSql(columns, rows, editable, includeDdl),
    timestampFilename('sql'),
    'application/sql',
  );
}

function toXml(columns: RowsArg, rows: RowArg): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<rows>');
  for (const row of rows) {
    lines.push('  <row>');
    columns.forEach((c, i) => {
      const cell = row.cells[i];
      const nullAttr = !cell || cell.type === 'null' ? ' null="true"' : '';
      const text = cell && cell.type !== 'null' ? escapeXml(cellToXmlText(cell)) : '';
      lines.push(`    <col name="${escapeXml(c.name)}"${nullAttr}>${text}</col>`);
    });
    lines.push('  </row>');
  }
  lines.push('</rows>');
  return lines.join('\n') + '\n';
}

function downloadXml(columns: RowsArg, rows: RowArg): void {
  triggerDownload(toXml(columns, rows), timestampFilename('xml'), 'application/xml');
}

/** Builds and downloads a single-sheet XLSX of the current result.
 *  Loads `write-excel-file` via dynamic import so the lib is only in
 *  the bundle when the user actually clicks the button. */
async function downloadXlsx(columns: RowsArg, rows: RowArg): Promise<void> {
  const mod = (await import('write-excel-file/browser')) as unknown as {
    default: (data: XlsxCell[][], opts: { fileName: string }) => Promise<unknown>;
  };
  const header: XlsxCell[] = columns.map((c) => ({ value: c.name }));
  const body: XlsxCell[][] = rows.map((r) => columns.map((_, i) => cellToXlsx(r.cells[i])));
  await mod.default([header, ...body], {
    fileName: timestampFilename('xlsx'),
  });
}

interface CellState {
  saving?: boolean | undefined;
  override?: ColumnValue | undefined;
  error?: string | undefined;
  /** `true` when the commit emitted `SET col = DEFAULT`. The post-
   *  update value depends on the server-side default expression, so
   *  the table cannot show a faithful optimistic value — instead the
   *  cell renders a "rerun to view" hint until the next query
   *  refreshes the row. */
  defaultApplied?: boolean | undefined;
}

interface EditingState {
  rowIdx: number;
  colIdx: number;
  draft: string;
}

function cellKey(rowIdx: number, colIdx: number): string {
  return `${rowIdx}:${colIdx}`;
}

/** Row shape fed into `@tanstack/react-table`. Cells stay in their
 *  original order; column defs use an index-based `accessorFn` so the
 *  table model owns column iteration without copying the data. */
type TableRow = { cells: ColumnValue[] };

/** Compiles the user's wildcard pattern into a case-insensitive regex.
 *
 *   - Regex metacharacters are escaped so the input behaves like a
 *     literal substring match by default.
 *   - The single supported wildcard is `*`, which after escaping becomes
 *     `\*` and is then rewritten to `.*` so a user-typed
 *     "FOO*BAR" matches any cell text where "FOO" precedes "BAR".
 *
 *  Returns `null` when the pattern is empty or compilation fails. */
function compileWildcardFilter(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (trimmed.length === 0) return null;
  // 1. Escape every regex meta-character, INCLUDING `*`. Skipping `*`
  //    in this list left `*foo*` parsed as a bare quantifier — the
  //    RegExp ctor threw, the catch swallowed, the filter became a
  //    silent no-op. The bug was older than the dual-line construction
  //    suggested.
  // 2. Promote escaped `\*` (which is what step 1 just produced for
  //    user `*`) back to `.*` so it acts as the "anything" wildcard
  //    users expect.
  const escaped = trimmed.replace(/[.+?^${}()|[\]\\*]/g, '\\$&').replace(/\\\*/g, '.*');
  try {
    return new RegExp(escaped, 'i');
  } catch {
    return null;
  }
}

function VirtualRows({
  tabId,
  sessionId,
  columns,
  rows,
  height,
  embedded,
  truncated,
  editable,
  onCommit,
  filters,
  onFiltersChange,
  columnWidths,
  onColumnWidthsChange,
  onFetchBlob,
  orderBy,
  onOrderByChange,
  pagination,
  onPaginationChange,
  onCountAllRows,
  onFetchScopedRows,
}: VirtualRowsProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const csvDelimiter = useDisplayStore((s) => s.csvDelimiter);
  const defaultExportFormat = useDisplayStore((s) => s.defaultExportFormat);
  const exportIncludeDdl = useDisplayStore((s) => s.exportIncludeDdl);
  const setExportIncludeDdl = useDisplayStore((s) => s.setExportIncludeDdl);
  const [copyFlash, setCopyFlash] = useState<{ rowIdx: number; kind: RowCopyKind } | null>(null);
  const [cellCopyFlash, setCellCopyFlash] = useState<{ rowIdx: number; colIdx: number } | null>(
    null,
  );
  const [wildcardOpen, setWildcardOpen] = useState(false);
  const [wildcardFilter, setWildcardFilter] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleCopyCell = (rowIdx: number, colIdx: number, cell: ColumnValue) => {
    const text = cellToPlainText(cell);
    void navigator.clipboard.writeText(text).catch(() => {});
    setCellCopyFlash({ rowIdx, colIdx });
    window.setTimeout(() => {
      setCellCopyFlash((prev) =>
        prev && prev.rowIdx === rowIdx && prev.colIdx === colIdx ? null : prev,
      );
    }, 1200);
  };

  const buildRowText = (rowIdx: number, kind: RowCopyKind): string => {
    const cells = rows[rowIdx]?.cells ?? [];
    switch (kind) {
      case 'sql': {
        const cols = columns.map((c) => quoteIdentForExport(c.name)).join(', ');
        const values = cells.map((c) => cellToSqlLiteral(c)).join(', ');
        const ident = editable ? quoteIdentForExport(editable.table.name) : '<TABLE>';
        return `INSERT INTO ${ident} (${cols}) VALUES (${values});`;
      }
      case 'json': {
        const obj: Record<string, unknown> = {};
        columns.forEach((c, i) => {
          obj[c.name] = cellToJson(cells[i]);
        });
        return JSON.stringify(obj);
      }
      case 'csv':
        return cells.map((c) => cellToCsv(c, csvDelimiter)).join(csvDelimiter);
      case 'raw':
        return cells.map((c) => cellToXmlText(c)).join('\t');
    }
  };

  const handleCopyRow = (rowIdx: number, kind: RowCopyKind) => {
    const text = buildRowText(rowIdx, kind);
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopyFlash({ rowIdx, kind });
    window.setTimeout(() => {
      setCopyFlash((prev) => (prev && prev.rowIdx === rowIdx && prev.kind === kind ? null : prev));
    }, 1200);
  };

  const [localWidths, setLocalWidths] = useState<ColumnSizingState>(() => ({
    ...(columnWidths ?? {}),
  }));

  useEffect(() => {
    setLocalWidths({ ...(columnWidths ?? {}) });
  }, [columnWidths]);

  const columnDefs = useMemo<ColumnDef<TableRow>[]>(
    () =>
      columns.map((col, idx) => ({
        id: col.name,
        accessorFn: (row: TableRow) => row.cells[idx],
        header: col.name,
        enableResizing: !!onColumnWidthsChange,
        minSize: MIN_COL_WIDTH,
        size: DEFAULT_COL_WIDTH,
      })),
    [columns, onColumnWidthsChange],
  );

  const wildcardRe = useMemo(() => compileWildcardFilter(wildcardFilter), [wildcardFilter]);
  // Pre-filter outside TanStack. The globalFilter wiring left every
  // row visible because the controlled state path was bypassed. We
  // also remember each filtered row's index into the ORIGINAL `rows`
  // array — every downstream cell-state / selection / edit-buffer
  // helper keys by that original index, so `tableRow.index` (which
  // would point into `filteredRows`) cannot be used directly.
  const filteredRowsWithIndex = useMemo<Array<{ row: TableRow; originalIndex: number }>>(() => {
    if (!wildcardRe) {
      return rows.map((row, i) => ({ row, originalIndex: i }));
    }
    const out: Array<{ row: TableRow; originalIndex: number }> = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i]!;
      if (r.cells.some((c) => wildcardRe.test(cellToPlainText(c)))) {
        out.push({ row: r, originalIndex: i });
      }
    }
    return out;
  }, [rows, wildcardRe]);
  const filteredRows = useMemo(
    () => filteredRowsWithIndex.map((x) => x.row),
    [filteredRowsWithIndex],
  );

  const table = useReactTable<TableRow>({
    data: filteredRows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: !!onColumnWidthsChange,
    state: {
      columnSizing: localWidths,
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(localWidths) : updater;
      setLocalWidths(next);
      onColumnWidthsChange?.(next);
    },
  });

  const tableRows = table.getRowModel().rows;
  const headerGroup = table.getHeaderGroups()[0];

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: OVERSCAN,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = totalSize - (items.at(-1)?.end ?? 0);

  const firstRow = rows[0];
  const columnIsNumeric = columns.map((_, i) => {
    if (!firstRow) return false;
    const cell = firstRow.cells[i];
    return cell ? isNumeric(cell) : false;
  });

  const [openBlob, setOpenBlob] = useState<{
    id: string;
    label: string;
    hex: string | null;
    error: string | null;
    /** Row + column where this BLOB lives. Used by the editor to
     *  build the UPDATE round-trip. `null` when the table is not
     *  editable, which suppresses the Edit button. */
    target: { rowIdx: number; colIdx: number } | null;
  } | null>(null);

  const openBlobViewer = (ref: BlobRef, label: string, rowIdx: number, colIdx: number) => {
    const target =
      editable && onCommit && editable.pkColIndices.length > 0 ? { rowIdx, colIdx } : null;
    setOpenBlob({ id: ref.id, label, hex: null, error: null, target });
    if (!onFetchBlob) {
      setOpenBlob({
        id: ref.id,
        label,
        hex: null,
        error: 'No BLOB fetch handler is wired — the host edition needs onFetchBlob.',
        target,
      });
      return;
    }
    const fetchedId = ref.id;
    void onFetchBlob(ref.id).then(
      (hex) => {
        setOpenBlob((prev) =>
          prev && prev.id === fetchedId ? { ...prev, hex, error: null } : prev,
        );
      },
      (err) => {
        setOpenBlob((prev) =>
          prev && prev.id === fetchedId
            ? {
                ...prev,
                hex: null,
                error: err instanceof Error ? err.message : String(err),
              }
            : prev,
        );
      },
    );
  };

  // I4.1 — register the built-in BLOB cell renderer with the
  // contribution registry on mount. Closure-captures
  // `openBlobViewer` via a ref so the registered Component always
  // calls the latest instance even though `openBlobViewer` itself is
  // re-created per render. The unregister is paired in the effect's
  // cleanup so the registration window matches the table's mount
  // window — multiple ResultTables mounting simultaneously would
  // double-register and throw at the registry level, but the desktop
  // and web shells render at most one ResultTable per session today.
  const openBlobViewerRef = useRef(openBlobViewer);
  openBlobViewerRef.current = openBlobViewer;
  useEffect(() => {
    return registerBuiltinBlobRenderer((ref, name, rowIdx, colIdx) => {
      openBlobViewerRef.current(ref, name, rowIdx, colIdx);
    });
  }, []);

  // I4.2-I4.6 — register the five built-in exporters through the
  // `export_formats` contribution point. Same mount-window discipline
  // as the BLOB renderer above: a single ResultTable instance per
  // session in both shells today, registration scoped to the table's
  // mount lifetime, double-mount would throw at the registry level.
  // One `useEffect` per built-in keeps the unregister teardowns
  // independent — a future remove-format toggle could disable any
  // single built-in by skipping its register call without affecting
  // the others.
  useEffect(() => registerBuiltinCsvExport(), []);
  useEffect(() => registerBuiltinJsonExport(), []);
  useEffect(() => registerBuiltinSqlExport(), []);
  useEffect(() => registerBuiltinXmlExport(), []);
  useEffect(() => registerBuiltinXlsxExport(), []);

  // Toolbar reads contributions live so registry changes (third-party
  // plugin install, settings reload) re-render the export button row
  // without a remount. Hardcoded entries that share a local id with a
  // registered contribution get filtered out in the IIFE below
  // (dedup-by-id, see `registeredLocalIds`).
  const exportContributions = usePluginContributions<ExportFormatPayload>('export_formats');

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [cellStates, setCellStates] = useState<Map<string, CellState>>(new Map());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [rowEditorOpen, setRowEditorOpen] = useState(false);
  const [insertNotice, setInsertNotice] = useState<string | null>(null);
  /** When `true`, bulk DELETE/UPDATE operate on every row in the
   *  underlying table (subject to the active filter predicate) rather
   *  than the rows present in the loaded result. */
  const [dbScopeActive, setDbScopeActive] = useState(false);
  /** Row count fetched by `onCountAllRows`. `null` until resolved. */
  const [dbScopeCount, setDbScopeCount] = useState<number | null>(null);
  /** Tracks the most recent count fetch so stale resolutions are
   *  discarded after the user re-selects, re-filters, or toggles
   *  scope. */
  const [dbScopeCounting, setDbScopeCounting] = useState(false);
  const [dbScopeCountError, setDbScopeCountError] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    // Use `click` (not `mousedown`) so menu-item React onClick handlers
    // dispatch fully before this outside-click handler runs. With
    // mousedown, closing the menu mid-press could orphan the action.
    const onDocClick = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

  const showSelection = editable !== null && onCommit !== undefined;
  const showFilters = editable !== null && onFiltersChange !== undefined;
  const activeFilters: ColumnFilter[] = filters ?? [];

  // Reset all row-level UI state whenever a fresh result lands. Same-
  // identity rows (cell edit success, no re-fetch) keep their overrides;
  // a new execute always replaces the array reference and wipes state.
  useEffect(() => {
    setSelectedRows(new Set());
    setDeletedRows(new Set());
    setCellStates(new Map());
    setEditing(null);
    setBulkError(null);
    setBulkUpdateOpen(false);
    setDbScopeActive(false);
    setDbScopeCount(null);
    setDbScopeCountError(null);
    setDbScopeCounting(false);
  }, [rows]);

  const pkSet = new Set(editable?.pkColIndices ?? []);
  const isColumnEditable = (colIdx: number): boolean => {
    if (!editable || !onCommit) return false;
    if (pkSet.has(colIdx)) return false;
    return editable.columnInfoByIndex[colIdx] != null;
  };

  /** WHERE-body predicate matching the active per-column filters. Used
   *  both to count rows in the "all in database" scope and to bound
   *  bulk DELETE/UPDATE statements that operate on the table directly
   *  (no PK IN-list). Returns `null` when no filters are active. */
  const activeFilterPredicate = (): string | null => {
    if (!editable || !filters || filters.length === 0) return null;
    const infoByName = new Map<string, ColumnInfo>();
    for (const info of editable.columnInfoByIndex) {
      if (info) infoByName.set(info.name, info);
    }
    return buildFilterPredicate(filters, infoByName);
  };

  /** `true` when the loaded result is a strict subset of the underlying
   *  rows: the response either hit the row-cap (`truncated`) or the
   *  host is paginating server-side. Used to decide whether the
   *  "Select all in database" affordance shows up. */
  const dbScopeAvailable = !!editable && !!onCountAllRows && (truncated || pagination !== null);

  const enterDbScope = () => {
    if (!editable || !onCountAllRows) return;
    setDbScopeActive(true);
    setSelectedRows(new Set());
    setBulkError(null);
    if (dbScopeCount !== null) return;
    const predicate = activeFilterPredicate();
    setDbScopeCounting(true);
    setDbScopeCountError(null);
    onCountAllRows(predicate)
      .then(
        (n) => {
          setDbScopeCount(n);
        },
        (err) => {
          setDbScopeCountError(err instanceof Error ? err.message : String(err));
        },
      )
      .finally(() => setDbScopeCounting(false));
  };

  const exitDbScope = () => {
    setDbScopeActive(false);
    setDbScopeCount(null);
    setDbScopeCountError(null);
    setDbScopeCounting(false);
  };

  const effectiveCell = (rowIdx: number, colIdx: number): ColumnValue => {
    const row = rows[rowIdx];
    const fallback: ColumnValue = { type: 'null' };
    const original = row?.cells[colIdx] ?? fallback;
    const state = cellStates.get(cellKey(rowIdx, colIdx));
    return state?.override ?? original;
  };

  const patchCellState = (key: string, patch: CellState | null) => {
    setCellStates((prev) => {
      const next = new Map(prev);
      if (patch === null) {
        next.delete(key);
      } else {
        next.set(key, { ...prev.get(key), ...patch });
      }
      return next;
    });
  };

  const startEdit = (rowIdx: number, colIdx: number) => {
    if (!isColumnEditable(colIdx)) return;
    const cell = effectiveCell(rowIdx, colIdx);
    if (cell.type === 'blob') return;
    const state = cellStates.get(cellKey(rowIdx, colIdx));
    if (state?.saving) return;
    const column = editable?.columnInfoByIndex[colIdx] ?? null;
    setEditing({ rowIdx, colIdx, draft: cellToDraft(cell, column) });
  };

  const cancelEdit = () => setEditing(null);

  const toggleRow = (rowIdx: number) => {
    if (deletedRows.has(rowIdx)) return;
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIdx)) next.delete(rowIdx);
      else next.add(rowIdx);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedRows((prev) => {
      const selectable = rows.map((_, i) => i).filter((i) => !deletedRows.has(i));
      if (prev.size === selectable.length) return new Set();
      return new Set(selectable);
    });
  };

  const clearSelection = () => setSelectedRows(new Set());

  /** Builds the PK literal payload for the currently-selected rows.
   *  Returns `null` when any selected row is missing a PK cell — the
   *  caller surfaces this through `setBulkError`. */
  const buildPkPayload = (): {
    rows: { idx: number; literals: string[] }[];
    pkColumns: string[];
  } | null => {
    if (!editable) return null;
    const pkColumns = editable.pkColIndices
      .map((i) => editable.columnInfoByIndex[i]?.name)
      .filter((n): n is string => typeof n === 'string');
    if (pkColumns.length !== editable.pkColIndices.length) return null;
    const out: { idx: number; literals: string[] }[] = [];
    for (const idx of selectedRows) {
      if (deletedRows.has(idx)) continue;
      const row = rows[idx];
      if (!row) return null;
      const literals: string[] = [];
      for (const pkColIdx of editable.pkColIndices) {
        const cell = row.cells[pkColIdx];
        if (!cell) return null;
        literals.push(cellToLiteral(cell));
      }
      out.push({ idx, literals });
    }
    return { rows: out, pkColumns };
  };

  const handleBulkDelete = async () => {
    if (!editable || !onCommit || bulkBusy) return;
    if (sessionId === null) return;
    if (dbScopeActive) {
      const predicate = activeFilterPredicate();
      const scope =
        dbScopeCount !== null
          ? `${dbScopeCount.toLocaleString()} row${dbScopeCount === 1 ? '' : 's'}`
          : 'every row';
      const detail = predicate
        ? `matching the active filter in ${editable.table.name}`
        : `in ${editable.table.name}`;
      const confirmed = window.confirm(`Delete ${scope} ${detail}? This cannot be undone.`);
      if (!confirmed) return;
      const builtSql = buildAllRowsDeleteSql({
        table: editable.table.name,
        predicate,
      });
      const decision = await rowDeletingChain.run({
        tabId,
        sessionId,
        table: editable.table.name,
        rowCount: null,
        predicate,
        sql: builtSql,
      });
      if (decision.action === 'cancel') {
        setBulkError(decision.reason);
        return;
      }
      const sql = decision.action === 'replace' ? decision.ctx.sql : builtSql;
      setBulkBusy(true);
      setBulkError(null);
      try {
        await onCommit(sql);
        // Optimistically mark every loaded row as deleted; host
        // re-fetch will sync the real state.
        setDeletedRows(new Set(rows.map((_, i) => i)));
        setSelectedRows(new Set());
        exitDbScope();
        emitRowDeleted({
          tabId,
          sessionId,
          table: editable.table.name,
          sql,
          rowCount: null,
          deletedAt: Date.now(),
        });
      } catch (err) {
        setBulkError(err instanceof Error ? err.message : String(err));
      } finally {
        setBulkBusy(false);
      }
      return;
    }
    const payload = buildPkPayload();
    if (!payload || payload.rows.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${payload.rows.length} row${payload.rows.length === 1 ? '' : 's'} from ${editable.table.name}? This cannot be undone.`,
    );
    if (!confirmed) return;
    const builtSql = buildBulkDeleteSql({
      table: editable.table.name,
      pkColumns: payload.pkColumns,
      rows: payload.rows.map((r) => ({ literals: r.literals })),
    });
    const bulkPredicate = builtSql.replace(/^.*?\bWHERE\b/i, '').trim();
    const decision = await rowDeletingChain.run({
      tabId,
      sessionId,
      table: editable.table.name,
      rowCount: payload.rows.length,
      predicate: bulkPredicate || null,
      sql: builtSql,
    });
    if (decision.action === 'cancel') {
      setBulkError(decision.reason);
      return;
    }
    const sql = decision.action === 'replace' ? decision.ctx.sql : builtSql;
    setBulkBusy(true);
    setBulkError(null);
    try {
      await onCommit(sql);
      setDeletedRows((prev) => {
        const next = new Set(prev);
        for (const r of payload.rows) next.add(r.idx);
        return next;
      });
      setSelectedRows(new Set());
      emitRowDeleted({
        tabId,
        sessionId,
        table: editable.table.name,
        sql,
        rowCount: payload.rows.length,
        deletedAt: Date.now(),
      });
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkUpdateSubmit = async (column: ColumnInfo, draft: string) => {
    if (!editable || !onCommit || bulkBusy) return;
    const parsed = parseEditedValue(draft, column);
    if (!parsed.ok) {
      setBulkError(parsed.reason);
      return;
    }
    if (dbScopeActive) {
      const predicate = activeFilterPredicate();
      const scope =
        dbScopeCount !== null
          ? `${dbScopeCount.toLocaleString()} row${dbScopeCount === 1 ? '' : 's'}`
          : 'every row';
      const detail = predicate
        ? `matching the active filter in ${editable.table.name}`
        : `in ${editable.table.name}`;
      const confirmed = window.confirm(
        `Set ${column.name} on ${scope} ${detail}? This cannot be undone.`,
      );
      if (!confirmed) return;
      const sql = buildAllRowsUpdateSql({
        table: editable.table.name,
        columnName: column.name,
        newLiteral: parsed.literal,
        predicate,
      });
      setBulkBusy(true);
      setBulkError(null);
      try {
        await onCommit(sql);
        // Apply optimistic override to every loaded row that
        // matches the column.
        const colIdx = editable.columnInfoByIndex.findIndex((c) => c?.name === column.name);
        if (colIdx >= 0) {
          const defaultApplied = parsed.literal === 'DEFAULT';
          setCellStates((prev) => {
            const next = new Map(prev);
            for (let i = 0; i < rows.length; i += 1) {
              const key = cellKey(i, colIdx);
              next.set(key, {
                ...prev.get(key),
                override: parsed.value,
                error: undefined,
                saving: false,
                defaultApplied,
              });
            }
            return next;
          });
        }
        setBulkUpdateOpen(false);
        setSelectedRows(new Set());
        exitDbScope();
      } catch (err) {
        setBulkError(err instanceof Error ? err.message : String(err));
      } finally {
        setBulkBusy(false);
      }
      return;
    }
    const payload = buildPkPayload();
    if (!payload || payload.rows.length === 0) return;
    const sql = buildBulkUpdateSql({
      table: editable.table.name,
      columnName: column.name,
      newLiteral: parsed.literal,
      pkColumns: payload.pkColumns,
      rows: payload.rows.map((r) => ({ literals: r.literals })),
    });
    setBulkBusy(true);
    setBulkError(null);
    try {
      await onCommit(sql);
      const colIdx = editable.columnInfoByIndex.findIndex((c) => c?.name === column.name);
      if (colIdx >= 0) {
        const defaultApplied = parsed.literal === 'DEFAULT';
        setCellStates((prev) => {
          const next = new Map(prev);
          for (const r of payload.rows) {
            const key = cellKey(r.idx, colIdx);
            next.set(key, {
              ...prev.get(key),
              override: parsed.value,
              error: undefined,
              saving: false,
              defaultApplied,
            });
          }
          return next;
        });
      }
      setBulkUpdateOpen(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const commitEdit = async () => {
    if (!editing || !editable || !onCommit) return;
    if (sessionId === null) return;
    const { rowIdx, colIdx, draft } = editing;
    const key = cellKey(rowIdx, colIdx);
    const columnInfo = editable.columnInfoByIndex[colIdx];
    if (!columnInfo) {
      setEditing(null);
      return;
    }
    const parsed = parseEditedValue(draft, columnInfo);
    if (!parsed.ok) {
      patchCellState(key, { error: parsed.reason });
      setEditing(null);
      return;
    }
    const row = rows[rowIdx];
    if (!row) {
      setEditing(null);
      return;
    }
    const pkValues: { name: string; literal: string }[] = [];
    for (const pkIdx of editable.pkColIndices) {
      const pkColumn = editable.columnInfoByIndex[pkIdx];
      const pkCell = row.cells[pkIdx];
      if (!pkColumn || !pkCell) {
        patchCellState(key, { error: 'Internal: missing PK metadata for this row.' });
        setEditing(null);
        return;
      }
      pkValues.push({ name: pkColumn.name, literal: cellToLiteral(pkCell) });
    }
    const builtSql = buildUpdateSql({
      table: editable.table.name,
      columnName: columnInfo.name,
      newLiteral: parsed.literal,
      pkValues,
    });
    const previousCell = row.cells[colIdx] ?? null;
    const decision = await cellCommittingChain.run({
      tabId,
      sessionId,
      table: editable.table.name,
      columnName: columnInfo.name,
      previousValue: previousCell,
      nextValue: parsed.value,
      newLiteral: parsed.literal,
      sql: builtSql,
    });
    if (decision.action === 'cancel') {
      patchCellState(key, { error: decision.reason });
      setEditing(null);
      return;
    }
    const sql = decision.action === 'replace' ? decision.ctx.sql : builtSql;
    setEditing(null);
    patchCellState(key, { saving: true, error: undefined });
    try {
      await onCommit(sql);
      const defaultApplied = parsed.literal === 'DEFAULT';
      patchCellState(key, {
        saving: false,
        override: parsed.value,
        error: undefined,
        defaultApplied,
      });
      emitCellCommitted({
        tabId,
        sessionId,
        table: editable.table.name,
        columnName: columnInfo.name,
        sql,
        committedAt: Date.now(),
      });
    } catch (err) {
      patchCellState(key, {
        saving: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className={`overflow-hidden bg-panel ${embedded ? '' : 'rounded-lg border border-edge'}`}>
      <div className="flex items-center justify-between border-b border-edge bg-panel px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <Database className="h-3.5 w-3.5 text-fg-subtle" />
          <span>
            <span className="font-mono font-semibold text-fg">{rows.length.toLocaleString()}</span>{' '}
            row{rows.length === 1 ? '' : 's'}
          </span>
          <span className="text-fg-subtle">·</span>
          <span>
            <span className="font-mono font-semibold text-fg">{columns.length}</span> column
            {columns.length === 1 ? '' : 's'}
          </span>
          {truncated && (
            <span
              className="inline-flex items-center gap-1 rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
              title={`Result capped at ${rows.length.toLocaleString()} rows. Rerun with a tighter WHERE / FIRST clause to see all matches.`}
            >
              Truncated
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setWildcardOpen((v) => !v);
              if (wildcardOpen) setWildcardFilter('');
            }}
            title="Toggle wildcard search (substring + '*' wildcard, client-side)"
            aria-label="Toggle wildcard search"
            aria-pressed={wildcardOpen}
            className={`inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
              wildcardOpen || wildcardFilter
                ? 'bg-accent-subtle text-accent'
                : 'text-fg-subtle hover:bg-elevated hover:text-fg'
            }`}
          >
            <Asterisk className="h-3 w-3" />
            Search
          </button>
          {showFilters && (
            <button
              type="button"
              onClick={() => setBuilderOpen(true)}
              title="Combine column filters in a builder dialog"
              aria-label="Open filter builder"
              className={`inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                activeFilters.length > 0
                  ? 'bg-accent-subtle text-accent'
                  : 'text-fg-subtle hover:bg-elevated hover:text-fg'
              }`}
            >
              <ListFilter className="h-3 w-3" />
              Builder
              {activeFilters.length > 0 && (
                <span className="font-mono">{activeFilters.length}</span>
              )}
            </button>
          )}
          {wildcardOpen && (
            <div className="inline-flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                placeholder="substring or pattern*"
                value={wildcardFilter}
                onChange={(e) => setWildcardFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setWildcardFilter('');
                    setWildcardOpen(false);
                  }
                }}
                className="w-44 rounded border border-edge bg-canvas px-2 py-0.5 font-mono text-[11px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              {wildcardFilter && (
                <span
                  className="font-mono text-[10px] text-fg-subtle"
                  title="Rows still visible after the wildcard filter"
                >
                  {tableRows.length.toLocaleString()}/{rows.length.toLocaleString()}
                </span>
              )}
              {wildcardFilter && (
                <button
                  type="button"
                  onClick={() => setWildcardFilter('')}
                  title="Clear filter"
                  aria-label="Clear wildcard filter"
                  className="rounded p-0.5 text-fg-subtle hover:bg-elevated hover:text-fg"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showSelection && (
            <button
              type="button"
              onClick={() => {
                setInsertNotice(null);
                setRowEditorOpen(true);
              }}
              disabled={bulkBusy}
              title={`Insert a new row into ${editable?.table.name ?? 'the table'}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-accent transition-colors hover:bg-accent-subtle disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              Insert row
            </button>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            {showSelection && dbScopeActive && (
              <>
                <span
                  className="inline-flex items-center gap-1 rounded bg-accent-subtle px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-accent"
                  title={`Bulk operations target every row${
                    filters && filters.length > 0 ? ' matching the active filter' : ''
                  } in ${editable?.table.name ?? 'the table'}.`}
                >
                  All{' '}
                  {dbScopeCounting
                    ? '…'
                    : dbScopeCount !== null
                      ? dbScopeCount.toLocaleString()
                      : '?'}{' '}
                  rows
                  {filters && filters.length > 0 ? ' (filtered)' : ''} in {editable?.table.name}
                </span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkBusy || dbScopeCounting}
                  title={`Delete every row${
                    filters && filters.length > 0 ? ' matching the active filter' : ''
                  } in ${editable?.table.name}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
                >
                  {bulkBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Delete all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkError(null);
                    setBulkUpdateOpen(true);
                  }}
                  disabled={bulkBusy || dbScopeCounting}
                  title="Apply the same UPDATE to every row in this scope"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" />
                  Update all…
                </button>
                <button
                  type="button"
                  onClick={exitDbScope}
                  disabled={bulkBusy}
                  title="Revert to per-page selection"
                  className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
                <span aria-hidden className="mx-1 h-3 w-px bg-edge" />
              </>
            )}
            {showSelection && !dbScopeActive && selectedRows.size > 0 && (
              <>
                <span className="rounded bg-accent-subtle px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-accent">
                  {selectedRows.size} selected
                </span>
                {dbScopeAvailable && selectedRows.size === rows.length - deletedRows.size && (
                  <button
                    type="button"
                    onClick={enterDbScope}
                    disabled={bulkBusy}
                    title={`Select every row${
                      filters && filters.length > 0 ? ' matching the active filter' : ''
                    } in ${editable?.table.name ?? 'the table'}`}
                    className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent-subtle/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-accent transition-colors hover:bg-accent-subtle"
                  >
                    Select all in {editable?.table.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkBusy}
                  title="Delete the selected rows"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
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
                  onClick={() => {
                    setBulkError(null);
                    setBulkUpdateOpen(true);
                  }}
                  disabled={bulkBusy}
                  title="Apply the same UPDATE to every selected row"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" />
                  Update…
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={bulkBusy}
                  title="Clear selection"
                  className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
                <span aria-hidden className="mx-1 h-3 w-px bg-edge" />
              </>
            )}
            {(() => {
              const scope = exportScope(dbScopeActive, dbScopeCount, selectedRows, rows.length);
              const handleExport = async (kind: ExportFormat) => {
                if (exportBusy) return;
                setExportBusy(true);
                setExportError(null);
                try {
                  const exportRows = await resolveExportRows({
                    scope,
                    rows,
                    selectedRows,
                    dbScopeActive,
                    onFetchScopedRows,
                    editable,
                    predicate: activeFilterPredicate(),
                  });
                  switch (kind) {
                    case 'csv':
                      downloadCsv(columns, exportRows, csvDelimiter);
                      break;
                    case 'json':
                      downloadJson(columns, exportRows);
                      break;
                    case 'xlsx':
                      await downloadXlsx(columns, exportRows);
                      break;
                    case 'sql':
                      downloadSql(columns, exportRows, editable, exportIncludeDdl);
                      break;
                    case 'xml':
                      downloadXml(columns, exportRows);
                      break;
                  }
                } catch (err) {
                  setExportError(err instanceof Error ? err.message : String(err));
                } finally {
                  setExportBusy(false);
                }
              };
              const suffix = scope.label;
              const csvDelimiterLabel = csvDelimiter === '\t' ? 'TAB' : csvDelimiter;
              // Widened from `ExportFormat` to `string` so third-party
              // contributions (e.g. `parquet`, `excel-tabs`) can land
              // alongside the five legacy hardcoded entries. The
              // default-format match below still works — `defaultExportFormat`
              // is one of the hardcoded `ExportFormat` values, so the
              // string-equality check picks it out unambiguously even
              // when extra registered ids are present.
              const definitions: {
                id: string;
                label: string;
                icon: ComponentType<{ className?: string }>;
                title: string;
                onClick: () => void;
              }[] = [
                {
                  id: 'csv',
                  label: `CSV${suffix}`,
                  icon: FileText,
                  title: `Download as CSV (delimiter: ${csvDelimiterLabel})`,
                  onClick: () => void handleExport('csv'),
                },
                {
                  id: 'json',
                  label: `JSON${suffix}`,
                  icon: FileJson,
                  title: 'Download as JSON',
                  onClick: () => void handleExport('json'),
                },
                {
                  id: 'xlsx',
                  label: `XLSX${suffix}`,
                  icon: FileSpreadsheet,
                  title: 'Download as XLSX',
                  onClick: () => void handleExport('xlsx'),
                },
                {
                  id: 'sql',
                  label: `SQL${suffix}`,
                  icon: FileCode,
                  title: editable
                    ? 'Download as SQL with CREATE TABLE + INSERTs'
                    : 'Download as SQL INSERTs (no DDL — table unknown)',
                  onClick: () => void handleExport('sql'),
                },
                {
                  id: 'xml',
                  label: `XML${suffix}`,
                  icon: FileCode,
                  title: 'Download as XML',
                  onClick: () => void handleExport('xml'),
                },
              ];

              // I4.2 — Bridge from `export_formats` contributions into
              // the toolbar's hardcoded `definitions` shape. Two rules:
              //
              // 1. **Dedup by local id**: when a registered contribution
              //    shares a hardcoded entry's id (e.g. the built-in
              //    `@plamenix-builtin/csv-export:csv` registers `id: 'csv'`),
              //    drop the hardcoded entry. The contribution becomes the
              //    sole CSV source. Same applies when a third-party
              //    plugin claims `id: 'csv'` — explicit opt-in to override.
              // 2. **Click handler runs the plugin's `exportRows`**: the
              //    plugin receives a rows snapshot (resolved through the
              //    same `resolveExportRows` path as the hardcoded buttons
              //    — selection / db-scope rules apply uniformly).
              //
              // Until I4.3-I4.6 extract the remaining four formats, the
              // hardcoded JSON / SQL / XML / XLSX entries continue to
              // serve as the implementation (safety-net pattern from I4.1).
              const registeredLocalIds = new Set(exportContributions.map((c) => c.contribution.id));
              for (const id of registeredLocalIds) {
                const idx = definitions.findIndex((d) => d.id === id);
                if (idx >= 0) definitions.splice(idx, 1);
              }

              const handlePluginExport = async (
                button: ReturnType<typeof pluginContributionsToExportButtons>[number],
              ) => {
                if (exportBusy) return;
                setExportBusy(true);
                setExportError(null);
                try {
                  const exportRows = await resolveExportRows({
                    scope,
                    rows,
                    selectedRows,
                    dbScopeActive,
                    onFetchScopedRows,
                    editable,
                    predicate: activeFilterPredicate(),
                  });
                  const formatArgs: ExportFormatArgs = {
                    columns,
                    rows: exportRows,
                    includeDdl: exportIncludeDdl,
                  };
                  if (editable) formatArgs.tableInfo = editable.table;
                  const result: ExportFormatResult = await button.onSelect(formatArgs);
                  const blob =
                    result.body instanceof Blob
                      ? result.body
                      : new Blob([result.body], {
                          type: `${result.mimeType};charset=utf-8`,
                        });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = result.filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  setExportError(err instanceof Error ? err.message : String(err));
                } finally {
                  setExportBusy(false);
                }
              };

              for (const button of pluginContributionsToExportButtons(exportContributions)) {
                definitions.push({
                  // Strip the plugin-id prefix from `<pluginId>:<contribId>`
                  // so the dedup key + default-format match continue to
                  // work against the original `ExportFormat` ids that
                  // shipped with the shell.
                  id: button.id.split(':').pop() ?? button.id,
                  label: `${button.label}${suffix}`,
                  icon: button.icon ?? FileText,
                  title: button.title,
                  onClick: () => void handlePluginExport(button),
                });
              }

              // Default format leads the toolbar with accent styling so
              // the user's preferred export is the obvious primary
              // action. Order of the rest is preserved.
              definitions.sort(
                (a, b) =>
                  Number(b.id === defaultExportFormat) - Number(a.id === defaultExportFormat),
              );
              const disabled = exportBusy || (dbScopeActive && !onFetchScopedRows);
              const primary = definitions[0];
              return (
                <div className="relative" ref={exportMenuRef}>
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    disabled={disabled || !primary}
                    title={
                      primary
                        ? `Export — default is ${primary.label.replace(/\s.*$/, '')}`
                        : 'Export'
                    }
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                    className="inline-flex items-center gap-1 rounded-md bg-accent-subtle px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
                  >
                    {exportBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    Export
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {exportMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Export format"
                      className="absolute right-0 top-full z-30 mt-1 flex w-56 flex-col rounded-md border border-edge bg-panel text-left shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
                    >
                      <ul className="py-1">
                        {definitions.map((d) => {
                          const isDefault = d.id === defaultExportFormat;
                          const Icon = d.icon;
                          return (
                            <li key={d.id}>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  d.onClick();
                                  setExportMenuOpen(false);
                                }}
                                disabled={disabled}
                                title={d.title}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
                              >
                                <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
                                <span className="flex-1 text-left">{d.label}</span>
                                {isDefault && (
                                  <span className="font-mono text-[9px] uppercase tracking-wide text-accent">
                                    default
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="border-t border-edge px-3 py-2">
                        <label
                          title="When checked, SQL exports prefix the INSERTs with CREATE TABLE"
                          className="inline-flex cursor-pointer select-none items-center gap-2 text-[11px] text-fg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={exportIncludeDdl}
                            onChange={(e) => setExportIncludeDdl(e.target.checked)}
                            className="h-3 w-3 cursor-pointer accent-accent"
                          />
                          Include DDL header (SQL)
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      {exportError && (
        <div className="border-b border-edge bg-danger-subtle px-3 py-1.5 text-[11px] text-danger">
          Export failed: {exportError}
        </div>
      )}
      {bulkError && (
        <div className="border-b border-edge bg-danger-subtle px-3 py-1.5 text-[11px] text-danger">
          {bulkError}
        </div>
      )}
      {insertNotice && (
        <div className="flex items-center justify-between gap-3 border-b border-edge bg-success-subtle px-3 py-1.5 text-[11px] text-success">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" />
            {insertNotice}
          </span>
          <button
            type="button"
            onClick={() => setInsertNotice(null)}
            aria-label="Dismiss"
            className="rounded p-0.5 text-success transition-colors hover:bg-success/15"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {dbScopeCountError && (
        <div className="border-b border-edge bg-danger-subtle px-3 py-1.5 text-[11px] text-danger">
          Could not count rows: {dbScopeCountError}
        </div>
      )}

      {
        <div
          ref={parentRef}
          className="overflow-auto bg-canvas"
          style={{ height: `${height}px`, contain: 'strict' }}
        >
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-panel text-left text-[11px] uppercase tracking-wide text-fg-muted shadow-[0_1px_0_0_var(--color-edge)]">
              <tr>
                {showSelection && (
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={
                        dbScopeActive ||
                        (selectedRows.size > 0 &&
                          selectedRows.size === rows.length - deletedRows.size)
                      }
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            !dbScopeActive &&
                            selectedRows.size > 0 &&
                            selectedRows.size < rows.length - deletedRows.size;
                        }
                      }}
                      onChange={toggleAll}
                      disabled={bulkBusy || dbScopeActive}
                      className="h-3.5 w-3.5 cursor-pointer accent-accent"
                    />
                  </th>
                )}
                {headerGroup?.headers.map((header, i) => {
                  const colName = header.column.id;
                  const filterable = showFilters && editable?.columnInfoByIndex[i] !== null;
                  const active = filterable ? findFilter(activeFilters, colName) : null;
                  const width = localWidths[colName];
                  const sortActive = orderBy?.columnName === colName ? orderBy : null;
                  const isResizing = header.column.getIsResizing();
                  return (
                    <th
                      key={header.id}
                      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
                      className={`relative whitespace-nowrap px-3 py-2 font-mono font-semibold ${
                        columnIsNumeric[i] ? 'text-right' : 'text-left'
                      }`}
                    >
                      <span
                        onClick={
                          onOrderByChange
                            ? () => onOrderByChange(nextOrderBy(orderBy ?? null, colName))
                            : undefined
                        }
                        className={`inline-flex items-center gap-1 ${
                          onOrderByChange ? 'cursor-pointer select-none' : ''
                        }`}
                      >
                        {pkSet.has(i) && (
                          <KeyRound className="h-3 w-3 text-accent" aria-label="Primary key" />
                        )}
                        {colName}
                        {sortActive && (
                          <span className="ml-0.5 text-accent" aria-hidden>
                            {sortActive.direction === 'ASC' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )}
                          </span>
                        )}
                        {filterable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenFilterCol(openFilterCol === colName ? null : colName);
                            }}
                            aria-label={`Filter ${colName}`}
                            className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-elevated ${
                              active ? 'text-accent' : 'text-fg-subtle opacity-60 hover:opacity-100'
                            }`}
                          >
                            <Filter className="h-3 w-3" fill={active ? 'currentColor' : 'none'} />
                          </button>
                        )}
                      </span>
                      {filterable && openFilterCol === colName && (
                        <FilterPopover
                          columnName={colName}
                          columnInfo={editable!.columnInfoByIndex[i]!}
                          current={active}
                          onApply={(next) => {
                            if (!onFiltersChange) return;
                            onFiltersChange(setColumnFilter(activeFilters, colName, next));
                            setOpenFilterCol(null);
                          }}
                          onClose={() => setOpenFilterCol(null)}
                        />
                      )}
                      {onColumnWidthsChange && header.column.getCanResize() && (
                        <span
                          aria-hidden
                          role="separator"
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            const next = { ...localWidths };
                            delete next[colName];
                            setLocalWidths(next);
                            onColumnWidthsChange(next);
                          }}
                          title="Drag to resize · double-click to auto-fit"
                          className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-accent/40 ${
                            isResizing ? 'bg-accent/60' : ''
                          }`}
                        />
                      )}
                    </th>
                  );
                })}
                <th aria-hidden className="sticky right-0 z-20 w-8 bg-panel px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + (showSelection ? 1 : 0) + 1}>
                    <div className="flex flex-col items-center justify-center bg-canvas px-6 py-12 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated">
                        <Inbox className="h-6 w-6 text-fg-subtle" />
                      </div>
                      <p className="mb-1 text-sm font-medium text-fg-muted">No rows returned</p>
                      <p className="text-xs text-fg-subtle">
                        Query succeeded but matched zero rows.
                        {activeFilters.length > 0
                          ? ' Adjust or clear the filters on the column headers above.'
                          : ''}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {paddingTop > 0 && (
                <tr aria-hidden style={{ height: `${paddingTop}px` }}>
                  <td colSpan={columns.length + (showSelection ? 1 : 0) + 1} />
                </tr>
              )}
              {items.map((virtualRow) => {
                const tableRow = tableRows[virtualRow.index];
                if (!tableRow) return null;
                // tableRow.index addresses `filteredRows`. Map it back
                // to the original `rows` index so cell-state / select
                // / edit lookups (keyed by the original row index)
                // match the row the user sees.
                const rowIdx =
                  filteredRowsWithIndex[tableRow.index]?.originalIndex ?? tableRow.index;
                const visibleCells = tableRow.getVisibleCells();
                const rowDeleted = deletedRows.has(rowIdx);
                const rowSelected = selectedRows.has(rowIdx);
                return (
                  <tr
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className={`group/row border-b border-edge-subtle transition-colors hover:bg-[var(--color-row-hover)] ${
                      rowIdx % 2 === 0 ? 'bg-canvas' : 'bg-[var(--color-row-alt)]'
                    } ${rowDeleted ? 'line-through opacity-50' : ''} ${
                      rowSelected ? '!bg-accent-subtle' : ''
                    }`}
                  >
                    {showSelection && (
                      <td className="w-8 px-2 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${rowIdx + 1}`}
                          checked={dbScopeActive || rowSelected}
                          disabled={rowDeleted || bulkBusy || dbScopeActive}
                          onChange={() => toggleRow(rowIdx)}
                          className="h-3.5 w-3.5 cursor-pointer accent-accent"
                        />
                      </td>
                    )}
                    {visibleCells.map((tableCell, j) => {
                      const columnName = tableCell.column.id;
                      const key = cellKey(rowIdx, j);
                      const state = cellStates.get(key);
                      const cell = effectiveCell(rowIdx, j);
                      const cellEditable = isColumnEditable(j) && !rowDeleted;
                      const isEditing =
                        editing !== null && editing.rowIdx === rowIdx && editing.colIdx === j;
                      const cellWidth = localWidths[columnName];
                      return (
                        <td
                          key={tableCell.id}
                          style={
                            cellWidth
                              ? {
                                  width: cellWidth,
                                  minWidth: cellWidth,
                                  maxWidth: cellWidth,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }
                              : undefined
                          }
                          onDoubleClick={cellEditable ? () => startEdit(rowIdx, j) : undefined}
                          title={
                            state?.error
                              ? state.error
                              : cellEditable
                                ? 'Double-click to edit'
                                : undefined
                          }
                          className={`group/cell whitespace-nowrap px-3 py-1.5 font-mono text-xs text-fg ${
                            isNumeric(cell) ? 'text-right' : 'text-left'
                          } ${
                            state?.error ? 'ring-1 ring-inset ring-danger/40' : ''
                          } ${state?.override ? 'bg-accent-subtle' : ''} ${
                            cellEditable && !isEditing ? 'cursor-text' : ''
                          }`}
                        >
                          {isEditing ? (
                            <TypedEditingInput
                              draft={editing.draft}
                              column={editable?.columnInfoByIndex[j] ?? null}
                              onDraft={(v) => setEditing(editing ? { ...editing, draft: v } : null)}
                              onCancel={cancelEdit}
                              onCommit={commitEdit}
                            />
                          ) : state?.defaultApplied ? (
                            <span
                              className="inline-flex items-center gap-1.5 italic text-fg-subtle"
                              title="DEFAULT applied server-side. Re-run the query to see the new value."
                            >
                              <Loader2 className="h-3 w-3 text-accent" aria-hidden />
                              DEFAULT applied — re-run
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {state?.saving && (
                                <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" />
                              )}
                              {state?.error && !state.saving && (
                                <AlertCircle className="h-3 w-3 text-danger" />
                              )}
                              <CellContent
                                cell={cell}
                                ctx={{
                                  columnName,
                                  columnInfo: editable?.columnInfoByIndex[j] ?? null,
                                  rowIndex: rowIdx,
                                  colIndex: j,
                                  onBlobClick: (ref, name) => openBlobViewer(ref, name, rowIdx, j),
                                }}
                              />
                              <CellCopyButton
                                cell={cell}
                                rowIdx={rowIdx}
                                colIdx={j}
                                flash={cellCopyFlash}
                                onCopy={handleCopyCell}
                              />
                              {cellEditable && (
                                <Pencil
                                  className="h-3 w-3 text-fg-subtle opacity-0 transition-opacity group-hover/cell:opacity-100"
                                  aria-hidden
                                />
                              )}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td
                      className={`sticky right-0 z-10 w-8 px-1 py-0 ${
                        rowSelected
                          ? 'bg-accent-subtle'
                          : rowIdx % 2 === 0
                            ? 'bg-canvas'
                            : 'bg-[var(--color-row-alt)]'
                      } group-hover:bg-[var(--color-row-hover)]`}
                    >
                      <RowCopyToolbar rowIdx={rowIdx} flash={copyFlash} onCopy={handleCopyRow} />
                    </td>
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden style={{ height: `${paddingBottom}px` }}>
                  <td colSpan={columns.length + (showSelection ? 1 : 0) + 1} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      }
      {/* end always-render table block */}
      {pagination && onPaginationChange && (
        <PaginationFooter
          pagination={pagination}
          rowsOnPage={rows.length}
          onChange={onPaginationChange}
        />
      )}
      {showFilters && onFiltersChange && (
        <FilterBuilderModal
          open={builderOpen}
          filters={activeFilters}
          columns={columns.map((c, i) => ({
            name: c.name,
            info: editable?.columnInfoByIndex[i] ?? null,
          }))}
          onApply={(next) => onFiltersChange(next)}
          onClose={() => setBuilderOpen(false)}
        />
      )}
      <BlobViewer
        open={openBlob !== null}
        hex={openBlob?.hex ?? null}
        error={openBlob?.error ?? null}
        label={openBlob?.label}
        onClose={() => setOpenBlob(null)}
        onCommit={
          openBlob?.target && editable && onCommit
            ? async (newHex) => {
                const { rowIdx, colIdx } = openBlob.target!;
                const columnInfo = editable.columnInfoByIndex[colIdx];
                const row = rows[rowIdx];
                if (!columnInfo || !row) {
                  throw new Error('Internal: lost column or row context.');
                }
                const pkValues: { name: string; literal: string }[] = [];
                for (const pkIdx of editable.pkColIndices) {
                  const pkCol = editable.columnInfoByIndex[pkIdx];
                  const pkCell = row.cells[pkIdx];
                  if (!pkCol || !pkCell) {
                    throw new Error('Internal: missing PK metadata for this row.');
                  }
                  pkValues.push({
                    name: pkCol.name,
                    literal: cellToLiteral(pkCell),
                  });
                }
                const sql = buildUpdateSql({
                  table: editable.table.name,
                  columnName: columnInfo.name,
                  // Firebird accepts `x'…'` byte literals for BLOB
                  // columns; the engine performs the implicit cast.
                  newLiteral: `x'${newHex}'`,
                  pkValues,
                });
                await onCommit(sql);
                setOpenBlob(null);
              }
            : undefined
        }
      />
      {bulkUpdateOpen && editable && (
        <BulkUpdateDialog
          editable={editable}
          pkSet={pkSet}
          rowCount={
            dbScopeActive ? (dbScopeCount ?? rows.length - deletedRows.size) : selectedRows.size
          }
          scopeLabel={
            dbScopeActive
              ? filters && filters.length > 0
                ? 'matching the active filter'
                : 'in the table'
              : null
          }
          busy={bulkBusy}
          onCancel={() => setBulkUpdateOpen(false)}
          onSubmit={(col, draft) => void handleBulkUpdateSubmit(col, draft)}
        />
      )}
      {rowEditorOpen && editable && onCommit && (
        <RowEditorModal
          tabId={tabId}
          sessionId={sessionId}
          table={editable.table}
          onCommit={async (sql) => {
            await onCommit(sql);
            setInsertNotice(
              `Row inserted into ${editable.table.name}. Re-run the query to see it.`,
            );
          }}
          onCancel={() => setRowEditorOpen(false)}
        />
      )}
    </div>
  );
}

/** Bottom-of-table pagination strip. Page size dropdown on the left,
 *  Prev/Next + row-range label + page-jump input on the right. No
 *  total-row count yet (would require an extra `SELECT COUNT(*)`
 *  round-trip per page); we rely on "next" being disabled when fewer
 *  rows than the page size arrived. When that hint fires we also know
 *  the total page count and can show it next to the jump input. */
function PaginationFooter({
  pagination,
  rowsOnPage,
  onChange,
}: {
  pagination: Pagination;
  rowsOnPage: number;
  onChange: (next: Pagination) => void;
}) {
  const defaultPageSize = useDisplayStore((s) => s.defaultPageSize);
  const from = rowsOnPage === 0 ? 0 : pagination.offset + 1;
  const to = pagination.offset + rowsOnPage;
  const atFirstPage = pagination.offset === 0;
  // The server returns fewer rows than the limit only on the final
  // page; treat that as a hint that next would be empty.
  const atLastPage = rowsOnPage < pagination.limit;
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  // When we hit the last page we know the total; otherwise the total
  // is unknown and the input is open-ended.
  const knownLastPage = atLastPage ? currentPage : null;

  const [pageDraft, setPageDraft] = useState<string>(String(currentPage));
  useEffect(() => {
    setPageDraft(String(currentPage));
  }, [currentPage]);

  const commitPage = () => {
    const raw = pageDraft.trim();
    if (raw.length === 0) {
      setPageDraft(String(currentPage));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      setPageDraft(String(currentPage));
      return;
    }
    const clamped = knownLastPage !== null ? Math.min(parsed, knownLastPage) : parsed;
    if (clamped === currentPage) {
      setPageDraft(String(currentPage));
      return;
    }
    onChange({
      offset: (clamped - 1) * pagination.limit,
      limit: pagination.limit,
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 border-t border-edge bg-panel px-3 py-1.5 text-[11px] text-fg-muted">
      <label className="inline-flex items-center gap-1">
        <span className="text-fg-subtle">Page size</span>
        <select
          value={pagination.limit}
          onChange={(e) =>
            onChange({ offset: 0, limit: Number(e.target.value) || defaultPageSize })
          }
          className="rounded border border-edge bg-canvas px-1.5 py-0.5 font-mono text-fg"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="inline-flex items-center gap-2">
        <span className="font-mono text-fg-subtle">
          rows {from.toLocaleString()}–{to.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() =>
            onChange({
              offset: Math.max(0, pagination.offset - pagination.limit),
              limit: pagination.limit,
            })
          }
          disabled={atFirstPage}
          title="Previous page"
          className="rounded p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              offset: pagination.offset + pagination.limit,
              limit: pagination.limit,
            })
          }
          disabled={atLastPage}
          title="Next page"
          className="rounded p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <span className="font-mono text-fg-subtle">Page</span>
        <input
          type="number"
          min={1}
          {...(knownLastPage !== null ? { max: knownLastPage } : {})}
          value={pageDraft}
          onChange={(e) => setPageDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setPageDraft(String(currentPage));
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onBlur={commitPage}
          aria-label="Go to page"
          title={
            knownLastPage !== null
              ? `Jump to a page between 1 and ${knownLastPage}`
              : 'Jump to a page'
          }
          className="w-12 rounded border border-edge bg-canvas px-1 py-0.5 text-center font-mono text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {knownLastPage !== null && (
          <span className="font-mono text-fg-subtle">of {knownLastPage.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

/** Per-operator placeholder + input-shape hint. Mirrors the literal
 *  shape `filters.ts:renderFilter` expects so the user sees the
 *  right form before the predicate fires. */
function placeholderForOperator(op: FilterOperator): string {
  switch (op) {
    case 'LIKE':
    case 'NOT LIKE':
      return '%value%';
    case 'CONTAINING':
    case 'NOT CONTAINING':
      return 'substring';
    case 'STARTING WITH':
    case 'NOT STARTING WITH':
      return 'prefix';
    case 'SIMILAR TO':
    case 'NOT SIMILAR TO':
      return '[a-z]+ regex';
    case 'BETWEEN':
    case 'NOT BETWEEN':
      return 'low,high';
    case 'IN':
    case 'NOT IN':
      return 'a,b,c';
    default:
      return 'value';
  }
}

/** Inline popover anchored to a column header that lets the user
 *  pick an operator and a value, then either apply or clear the
 *  column's filter. Anchored absolutely to the header `th`; closes
 *  when the user clicks outside or presses Escape. */
function FilterPopover({
  columnName,
  columnInfo,
  current,
  onApply,
  onClose,
}: {
  columnName: string;
  columnInfo: ColumnInfo;
  current: ColumnFilter | null;
  onApply: (next: ColumnFilter | null) => void;
  onClose: () => void;
}) {
  const [operator, setOperator] = useState<FilterOperator>(current?.operator ?? '=');
  const [value, setValue] = useState<string>(current?.value ?? '');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const unary = operatorIsUnary(operator);

  const apply = () => {
    if (unary) {
      onApply({ columnName, operator, value: '' });
      return;
    }
    if (value.length === 0) {
      onApply(null);
      return;
    }
    onApply({ columnName, operator, value });
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Filter ${columnName}`}
      className="absolute left-0 top-full z-30 mt-1 flex w-64 flex-col gap-2 rounded-md border border-edge bg-panel p-2 text-left shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
    >
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
        {columnName} <span className="text-fg-muted">({columnInfo.sqlType})</span>
      </div>
      <select
        value={operator}
        onChange={(e) => setOperator(e.target.value as FilterOperator)}
        className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg"
      >
        {FILTER_OPERATORS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      {!unary && (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          placeholder={placeholderForOperator(operator)}
          className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        {current ? (
          <button
            type="button"
            onClick={() => onApply(null)}
            className="rounded px-2 py-1 text-[11px] text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
          >
            Clear
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={apply}
          className="rounded bg-accent px-3 py-1 text-[11px] font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/** Small modal that lets the user pick one editable column and supply
 *  a new value to apply to every selected row. The value is parsed
 *  against the column's declared type before the host SQL runs, so
 *  validation errors stop the round-trip up-front. */
function BulkUpdateDialog({
  editable,
  pkSet,
  rowCount,
  scopeLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  editable: EditableContext;
  pkSet: Set<number>;
  rowCount: number;
  /** Optional suffix appended to the header (e.g. "matching the
   *  active filter") to disambiguate per-page bulk vs the
   *  "all rows in database" scope. */
  scopeLabel?: string | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (column: ColumnInfo, draft: string) => void;
}) {
  const eligible: { idx: number; info: ColumnInfo }[] = [];
  editable.columnInfoByIndex.forEach((info, idx) => {
    if (!info) return;
    if (pkSet.has(idx)) return;
    if (info.sqlType.toUpperCase().startsWith('BLOB')) return;
    eligible.push({ idx, info });
  });
  const [columnName, setColumnName] = useState(eligible[0]?.info.name ?? '');
  const [draft, setDraft] = useState('');
  const column = eligible.find((e) => e.info.name === columnName)?.info ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-label="Bulk update"
      onClick={onCancel}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[18vh] flex w-[min(28rem,92vw)] flex-col gap-3 rounded-xl border border-edge bg-panel p-4 shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[13px] font-semibold text-fg">
            Update {rowCount.toLocaleString()} row{rowCount === 1 ? '' : 's'}{' '}
            {scopeLabel ? `${scopeLabel} in ` : 'in '}
            {editable.table.name}
          </h2>
        </header>
        {eligible.length === 0 ? (
          <p className="text-xs text-fg-subtle">
            No editable non-PK columns available on this table.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              Column
              <select
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg"
              >
                {eligible.map((e) => (
                  <option key={e.info.name} value={e.info.name}>
                    {e.info.name} — {e.info.sqlType}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              New value (empty = NULL when nullable)
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && column && !busy) {
                    e.preventDefault();
                    onSubmit(column, draft);
                  }
                }}
                autoFocus
                className="rounded border border-edge bg-canvas px-2 py-1 font-mono text-xs text-fg"
              />
            </label>
          </>
        )}
        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1 text-xs text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => column && onSubmit(column, draft)}
            disabled={busy || !column}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
