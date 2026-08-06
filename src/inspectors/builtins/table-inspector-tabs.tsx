/**
 * Built-in table inspector tabs (I5.4) — extracts the three legacy
 * tabs (Data, Schema, DDL) that used to live inline in `TableObjectView`
 * into `object_inspectors` contributions registered under
 * `@plamenix-builtin/table-inspector-tabs`.
 *
 * Each tab is a separate contribution so a third-party plugin can
 * register additional tabs without forking the shell, and a future
 * Settings panel can selectively disable individual built-in tabs
 * (per the same pattern as I5.1's keybindings, etc.).
 *
 * Behaviour parity with the legacy inline tabs:
 *
 *   - **Data**: renders `MultiResultView` against `host.results`,
 *     forwarding every shell callback (commit/filter/blob/count/
 *     scoped-rows/column-widths/streamed-export). Empty state shows
 *     `'Loading rows…'` until results arrive.
 *   - **Schema**: column table with `#` / Column / Type / Nullable /
 *     Default / PK badges — identical markup to the legacy
 *     `SchemaTab` so the visual diff against the previous shell is
 *     zero.
 *   - **DDL**: synthesised `CREATE TABLE` rendered through
 *     `SqlHighlight`. Re-uses the existing `buildCreateTableDdl`
 *     helper exported from `TableObjectView`.
 *
 * The built-in registers all three at priority 100; future user-
 * supplied tabs at lower priority appear to their left (community
 * tabs surface ahead of shell defaults — same convention as I5.2's
 * menus).
 */

import { useMemo } from 'react';
import { Database, FileCode, ListTree } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import { MultiResultView } from '../../db/MultiResultView.js';
import { SqlHighlight } from '../../db/SqlHighlight.js';
import { buildCreateTableDdl } from '../../db/TableObjectView.js';
import type { ColumnInfo, TableInfo } from '../../db/types.js';
import type {
  ObjectInspectorContext,
  ObjectInspectorContributionPayload,
} from '../object-inspector-contract.js';

const BUILTIN_NAME = 'table-inspector-tabs';

/** Type-narrows the inspector context to the table case. */
function asTable(ctx: ObjectInspectorContext): TableInfo {
  return ctx.target as TableInfo;
}

/** Data tab — renders `MultiResultView` for the table's `SELECT *`. */
function BuiltinDataTab({ ctx }: { ctx: ObjectInspectorContext }) {
  const { host } = ctx;
  const results = host.results ?? null;
  if (results === null || results.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6 text-xs italic text-fg-subtle">
        Loading rows…
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto">
      <MultiResultView
        tabId={host.tabId ?? ''}
        sessionId={host.sessionId ?? null}
        outcomes={results}
        schema={host.schema ?? null}
        {...(host.onCommitCellEdit !== undefined ? { onCommitCellEdit: host.onCommitCellEdit } : {})}
        {...(host.onApplyFilter !== undefined ? { onApplyFilter: host.onApplyFilter } : {})}
        {...(host.columnWidths !== undefined ? { columnWidths: host.columnWidths } : {})}
        {...(host.onColumnWidthsChange !== undefined
          ? { onColumnWidthsChange: host.onColumnWidthsChange }
          : {})}
        {...(host.onFetchBlob !== undefined ? { onFetchBlob: host.onFetchBlob } : {})}
        {...(host.onCountAllRows !== undefined ? { onCountAllRows: host.onCountAllRows } : {})}
        {...(host.onFetchScopedRows !== undefined
          ? { onFetchScopedRows: host.onFetchScopedRows }
          : {})}
        {...(host.onStreamedExport !== undefined ? { onStreamedExport: host.onStreamedExport } : {})}
        {...(host.sessionId !== null && host.sessionId !== undefined
          ? { sessionId: host.sessionId }
          : {})}
      />
    </div>
  );
}

/** Schema tab — column table with PK badges. */
function BuiltinSchemaTab({ ctx }: { ctx: ObjectInspectorContext }) {
  const table = asTable(ctx);
  const columns: ColumnInfo[] = table.columns;
  const primaryKey = table.primaryKey ?? [];
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

/** DDL tab — synthesised CREATE TABLE rendered through SqlHighlight. */
function BuiltinDdlTab({ ctx }: { ctx: ObjectInspectorContext }) {
  const table = asTable(ctx);
  const ddl = useMemo(() => buildCreateTableDdl(table), [table]);
  return (
    <div className="h-full overflow-auto p-4">
      <div className="overflow-hidden rounded-lg border border-edge bg-inset">
        <SqlHighlight value={ddl} className="p-4 text-xs leading-relaxed" />
      </div>
    </div>
  );
}

const dataPayload: ObjectInspectorContributionPayload = {
  label: 'Data',
  icon: Database,
  applicableKinds: ['table'],
  Component: BuiltinDataTab,
};

const schemaPayload: ObjectInspectorContributionPayload = {
  label: 'Schema',
  icon: ListTree,
  applicableKinds: ['table'],
  Component: BuiltinSchemaTab,
};

const ddlPayload: ObjectInspectorContributionPayload = {
  label: 'DDL',
  icon: FileCode,
  applicableKinds: ['table'],
  Component: BuiltinDdlTab,
};

/**
 * Registers the three built-in table inspector tabs (Data, Schema,
 * DDL). Returns a teardown closure for `useEffect` pairing.
 *
 * Priority spacing: 200, 210, 220 — preserves the legacy Data-first /
 * DDL-last order. Registry default is 100, so user-installed tab
 * plugins (e.g. `@user/permissions-report`) sort to the left of the
 * built-ins by default; explicit higher priority pushes a plugin tab
 * to the right.
 */
export function registerBuiltinTableInspectorTabs(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    object_inspectors: [
      { id: 'data', priority: 200, payload: dataPayload },
      { id: 'schema', priority: 210, payload: schemaPayload },
      { id: 'ddl', priority: 220, payload: ddlPayload },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

/** Explicit teardown — alternative to the returned closure. */
export function unregisterBuiltinTableInspectorTabs(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
