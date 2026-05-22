import { useMemo, useState } from 'react';
import { Database, FileCode, ListTree, RefreshCcw, X, type LucideIcon } from 'lucide-react';
import { MultiResultView } from './MultiResultView';
import { SqlHighlight } from './SqlHighlight';
import type {
  ColumnInfo,
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

type TabKey = 'data' | 'schema' | 'ddl';

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
}: TableObjectViewProps) {
  const [tab, setTab] = useState<TabKey>('data');

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
          <TabButton id="data" current={tab} onPick={setTab} icon={Database} label="Data" />
          <TabButton id="schema" current={tab} onPick={setTab} icon={ListTree} label="Schema" />
          <TabButton id="ddl" current={tab} onPick={setTab} icon={FileCode} label="DDL" />
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
        {tab === 'data' &&
          (results && results.length > 0 ? (
            <div className="h-full overflow-auto p-4">
              <MultiResultView
                outcomes={results}
                schema={schema}
                onCommitCellEdit={onCommitCellEdit}
                onApplyFilter={onApplyFilter}
                columnWidths={columnWidths}
                onColumnWidthsChange={onColumnWidthsChange}
                onFetchBlob={onFetchBlob}
                onCountAllRows={onCountAllRows}
                onFetchScopedRows={onFetchScopedRows}
                {...(onStreamedExport ? { onStreamedExport } : {})}
                {...(sessionId !== null ? { sessionId } : {})}
              />
            </div>
          ) : (
            <EmptyTabState label="Loading rows…" />
          ))}
        {tab === 'schema' && <SchemaTab columns={table.columns} primaryKey={table.primaryKey ?? []} />}
        {tab === 'ddl' && <DdlTab table={table} />}
      </div>
    </div>
  );
}

function TabButton({
  id,
  current,
  onPick,
  icon: Icon,
  label,
}: {
  id: TabKey;
  current: TabKey;
  onPick: (next: TabKey) => void;
  icon: LucideIcon;
  label: string;
}) {
  const active = current === id;
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
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SchemaTab({
  columns,
  primaryKey,
}: {
  columns: ColumnInfo[];
  primaryKey: string[];
}) {
  const pkSet = useMemo(() => new Set(primaryKey), [primaryKey]);
  return (
    <div className="h-full overflow-auto p-4">
      <div className="overflow-hidden rounded-lg border border-edge">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-inset text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Column</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Nullable</th>
              <th className="px-3 py-2">Default</th>
              <th className="px-3 py-2">PK</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.name} className="border-t border-edge text-fg">
                <td className="px-3 py-1.5 text-fg-subtle">{c.position}</td>
                <td className="px-3 py-1.5 font-mono">{c.name}</td>
                <td className="px-3 py-1.5 font-mono text-fg-muted">{c.sqlType}</td>
                <td className="px-3 py-1.5 text-fg-muted">{c.nullable ? 'YES' : 'NO'}</td>
                <td className="px-3 py-1.5 font-mono text-fg-muted">
                  {c.defaultExpr ?? <span className="text-fg-subtle">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  {pkSet.has(c.name) && (
                    <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                      PK
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {columns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center italic text-fg-subtle">
                  No columns reported.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DdlTab({ table }: { table: TableInfo }) {
  const ddl = useMemo(() => buildCreateTableDdl(table), [table]);
  return (
    <div className="h-full overflow-auto p-4">
      <div className="overflow-hidden rounded-lg border border-edge bg-inset">
        <SqlHighlight value={ddl} className="p-4 text-xs leading-relaxed" />
      </div>
    </div>
  );
}

function EmptyTabState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-6 text-xs italic text-fg-subtle">
      {label}
    </div>
  );
}
