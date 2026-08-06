import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Database, RefreshCcw, X } from 'lucide-react';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pluginContributionsToInspectorTabs,
  type ObjectInspectorContext,
  type ObjectInspectorContributionPayload,
  type ObjectInspectorHostHelpers,
} from '../inspectors/object-inspector-contract';
import { registerBuiltinTableInspectorTabs } from '../inspectors/builtins/table-inspector-tabs';
import type {
  ColumnValue,
  Schema,
  StatementOutcome,
  TableInfo,
} from './types';
import type { StreamedExportRunner } from './streamed-export';

/**
 * Quotes a Firebird identifier when it would not parse unquoted. The
 * Firebird-side rule is the inverse of the dialect-3 unquoted-identifier
 * grammar: upper-case letters, digits, and underscore, starting with a
 * letter or underscore.
 */
function quoteIdent(name: string): string {
  if (/^[A-Z_][A-Z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Synthesises `CREATE TABLE` DDL for a relation. TS port of
 * `plamenix-db::export::build_create_table` — kept client-side so the
 * DDL tab swap is instant (no backend round-trip).
 *
 * Output is `CREATE VIEW <name> AS …` for views isn't possible from the
 * column list alone (the view body lives in `RDB$VIEW_SOURCE`), so views
 * route through the existing DDL viewer modal instead and never reach
 * this helper.
 */
export function buildCreateTableDdl(table: TableInfo): string {
  const lines = table.columns.map((c) => {
    const nullable = c.nullable ? '' : ' NOT NULL';
    const def = c.defaultExpr ? ` DEFAULT ${c.defaultExpr}` : '';
    return `    ${quoteIdent(c.name)} ${c.sqlType}${def}${nullable}`;
  });
  const pkSegments = table.primaryKey ?? [];
  if (pkSegments.length > 0) {
    const pk = pkSegments.map(quoteIdent).join(', ');
    lines.push(`    PRIMARY KEY (${pk})`);
  }
  return `CREATE TABLE ${quoteIdent(table.name)} (\n${lines.join(',\n')}\n);`;
}

export interface TableObjectViewProps {
  /** Table-or-view metadata for the focused relation. Drives the
   *  Schema column list and DDL synthesis. */
  table: TableInfo;
  /** Statement outcomes from the `SELECT *` that the schema browser
   *  ran. Routed verbatim into the Data tab's `MultiResultView`. */
  results: StatementOutcome[] | null;
  /** Whole-database schema, used by `MultiResultView` for cross-table
   *  features (e.g. foreign-key navigation). */
  schema: Schema | null;
  /** Closes the focused view, returning the content pane to its
   *  query-editor + ad-hoc results default. */
  onClose: () => void;
  /** Re-runs `SELECT *` against the focused relation. Triggered from
   *  the view's header refresh button. */
  onRefreshData: () => void;
  /** Persisted per-column widths for the Data tab's result table. */
  columnWidths: Record<string, number>;
  onColumnWidthsChange: (next: Record<string, number>) => void;
  /** Result-table callbacks forwarded to `MultiResultView`. */
  onCommitCellEdit: (sql: string) => Promise<void>;
  onApplyFilter: (sql: string) => Promise<void>;
  onFetchBlob: (blobId: string) => Promise<string>;
  onCountAllRows: (args: { table: string; predicate: string | null }) => Promise<number>;
  onFetchScopedRows: (args: {
    table: string;
    predicate: string | null;
  }) => Promise<{ cells: ColumnValue[] }[]>;
  onStreamedExport?: StreamedExportRunner | undefined;
  sessionId: string | null;
  /** Tab the view renders for. Threaded into the inspector context
   *  so the built-in Data tab's `MultiResultView` carries the
   *  originating tab id for event emit + interceptor context. */
  tabId: string;
}

/**
 * Tabbed object inspector mirroring the legacy Firebird-web-client
 * TableView. Three tabs: Data (paginated `SELECT *`), Schema (column
 * list), DDL (synthesised `CREATE TABLE`). Sits in the content pane
 * when the user clicks a table in the schema browser; replaced by the
 * regular query results when the user runs anything else in the editor.
 */
export function TableObjectView({
  table,
  results,
  schema,
  onClose,
  onRefreshData,
  columnWidths,
  onColumnWidthsChange,
  onCommitCellEdit,
  onApplyFilter,
  onFetchBlob,
  onCountAllRows,
  onFetchScopedRows,
  onStreamedExport,
  sessionId,
  tabId,
}: TableObjectViewProps) {
  // I5.4 — register the built-in Data / Schema / DDL tabs once per
  // TableObjectView mount. Single mount per session in both shells
  // today; double-mount would throw at the registry, but the host
  // never renders two TableObjectViews simultaneously.
  useEffect(() => registerBuiltinTableInspectorTabs(), []);

  const inspectorContributions =
    usePluginContributions<ObjectInspectorContributionPayload>('object_inspectors');
  const descriptors = useMemo(
    () => pluginContributionsToInspectorTabs(inspectorContributions, 'table'),
    [inspectorContributions],
  );

  // Track the active tab by descriptor id. When the registered tab
  // set changes (plugin install/uninstall) and the previously active
  // tab disappears, fall back to the first one.
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const resolvedActiveId =
    activeTabId && descriptors.some((d) => d.id === activeTabId)
      ? activeTabId
      : descriptors[0]?.id ?? null;
  const activeDescriptor = descriptors.find((d) => d.id === resolvedActiveId) ?? null;

  // Compose the host helpers handed to every inspector contribution.
  // Built-in tabs (Data) consume every field; pure tabs (Schema, DDL)
  // ignore them. Plugin authors read what they need.
  const ctx: ObjectInspectorContext<TableInfo> = useMemo(() => {
    const host: ObjectInspectorHostHelpers = {
      results,
      schema,
      sessionId,
      tabId,
      columnWidths,
      onRefreshData,
      onCommitCellEdit,
      onApplyFilter,
      onFetchBlob,
      onCountAllRows,
      onFetchScopedRows,
      onColumnWidthsChange,
    };
    if (onStreamedExport !== undefined) host.onStreamedExport = onStreamedExport;
    return { kind: 'table', target: table, host };
  }, [
    table,
    results,
    schema,
    sessionId,
    tabId,
    columnWidths,
    onRefreshData,
    onCommitCellEdit,
    onApplyFilter,
    onFetchBlob,
    onCountAllRows,
    onFetchScopedRows,
    onColumnWidthsChange,
    onStreamedExport,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-edge bg-inset px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Database className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono">{table.name}</span>
          <span className="rounded-md border border-edge bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            {table.kind}
          </span>
        </div>
        <div className="flex flex-1 items-center gap-0.5">
          {descriptors.map((d) => (
            <InspectorTabButton
              key={d.id}
              id={d.id}
              currentId={resolvedActiveId}
              onPick={setActiveTabId}
              icon={d.icon}
              label={d.label}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onRefreshData}
          className="inline-flex items-center gap-1 rounded-md border border-edge bg-canvas px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          title="Re-run SELECT *"
        >
          <RefreshCcw className="h-3 w-3" />
          Refresh
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close object view"
          className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 overflow-hidden">
        {activeDescriptor ? (
          <activeDescriptor.Component ctx={ctx} />
        ) : (
          <EmptyTabState label="No inspector tabs registered." />
        )}
      </div>
    </div>
  );
}

function InspectorTabButton({
  id,
  currentId,
  onPick,
  icon: Icon,
  label,
}: {
  id: string;
  currentId: string | null;
  onPick: (next: string) => void;
  icon: ComponentType<{ className?: string }> | undefined;
  label: string;
}) {
  const active = currentId === id;
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-canvas text-fg ring-1 ring-edge'
          : 'text-fg-muted hover:bg-elevated hover:text-fg'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function EmptyTabState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-6 text-xs italic text-fg-subtle">
      {label}
    </div>
  );
}
