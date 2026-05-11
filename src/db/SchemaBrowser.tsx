import { useState, type ComponentType, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  Table2,
} from 'lucide-react';
import { TableContextMenu } from './TableContextMenu';
import type { Schema, TableAction, TableInfo } from './types';

export interface SchemaBrowserProps {
  /** The current schema, or `null` while it is being fetched / before
   *  a session is open. */
  schema: Schema | null;
  /** Disables the refresh button while a request is in flight. */
  busy?: boolean;
  /** Fired when the user clicks the refresh button. Omit to hide. */
  onRefresh?: () => void;
  /** Fired when the user clicks a table or column name, with the
   *  identifier the host should insert into the query editor. Omit to
   *  make node labels non-interactive. */
  onSelect?: (identifier: string) => void;
  /** Fired when the user picks a DDL action from a table's
   *  right-click menu. The browser never executes SQL itself; the
   *  host translates the action into a statement and routes it
   *  through the usual execute path. Omit to suppress the menu. */
  onAction?: (action: TableAction, table: TableInfo) => void;
}

interface MenuState {
  table: TableInfo;
  x: number;
  y: number;
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded-sm bg-warning-subtle px-0.5 text-warning">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * Sidebar tree of tables and views with their columns.
 *
 * The component is purely presentational: the host owns the schema
 * state, refresh handler, and any click-to-insert behaviour. Tables
 * and views render in two collapsible sections; columns expand
 * inline under each table.
 */
export function SchemaBrowser({
  schema,
  busy = false,
  onRefresh,
  onSelect,
  onAction,
}: SchemaBrowserProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [openTables, setOpenTables] = useState(true);
  const [openViews, setOpenViews] = useState(true);

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const lower = filter.trim().toLowerCase();
  const isSearching = lower !== '';
  const allTables = schema?.tables ?? [];
  const matchesFilter = (t: TableInfo) =>
    !isSearching || t.name.toLowerCase().includes(lower);
  const tables = allTables.filter((t) => t.kind === 'table' && matchesFilter(t));
  const views = allTables.filter((t) => t.kind === 'view' && matchesFilter(t));
  const showTables = isSearching || openTables;
  const showViews = isSearching || openViews;

  const renderTableNode = (t: TableInfo) => (
    <TableNode
      key={t.name}
      table={t}
      filter={filter}
      expanded={expanded.has(t.name)}
      onToggle={() => toggle(t.name)}
      onSelect={onSelect}
      onContextMenu={
        onAction
          ? (event) => {
              event.preventDefault();
              setMenu({ table: t, x: event.clientX, y: event.clientY });
            }
          : undefined
      }
    />
  );

  return (
    <aside className="flex h-full flex-col bg-panel text-xs">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-accent" />
          <h2 className="text-[13px] font-semibold text-fg">Schema</h2>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            aria-label="Refresh schema"
            title="Refresh schema"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="border-b border-edge px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            placeholder="Filter objects…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg border border-edge bg-inset py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            aria-label="Filter tables"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {schema === null ? (
          <p className="px-3 py-2 italic text-fg-subtle">No schema loaded.</p>
        ) : allTables.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
            <Database className="mb-3 h-8 w-8 text-fg-subtle opacity-40" />
            <p className="text-xs font-medium text-fg-muted">No user tables</p>
          </div>
        ) : tables.length === 0 && views.length === 0 ? (
          <p className="px-3 py-2 italic text-fg-subtle">No matches.</p>
        ) : (
          <>
            <SectionHeader
              label="Tables"
              icon={Table2}
              open={showTables}
              count={tables.length}
              locked={isSearching}
              onToggle={() => setOpenTables((v) => !v)}
            />
            {showTables && tables.map(renderTableNode)}

            <SectionHeader
              label="Views"
              icon={Eye}
              open={showViews}
              count={views.length}
              locked={isSearching}
              onToggle={() => setOpenViews((v) => !v)}
            />
            {showViews && views.map(renderTableNode)}
          </>
        )}
      </div>

      {menu && onAction && (
        <TableContextMenu
          x={menu.x}
          y={menu.y}
          title={menu.table.name}
          onAction={(action) => onAction(action, menu.table)}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
}

interface SectionHeaderProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  open: boolean;
  count: number;
  /** Search-driven force-open: clicking does nothing while locked. */
  locked: boolean;
  onToggle: () => void;
}

function SectionHeader({ label, icon: Icon, open, count, locked, onToggle }: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onToggle}
      disabled={locked}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:hover:bg-transparent disabled:hover:text-fg-muted"
    >
      {open ? (
        <ChevronDown className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0" />
      )}
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto text-[10px] tabular-nums text-fg-subtle">{count}</span>
    </button>
  );
}

interface TableNodeProps {
  table: TableInfo;
  filter: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: ((identifier: string) => void) | undefined;
  onContextMenu: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
}

function TableNode({
  table,
  filter,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
}: TableNodeProps) {
  return (
    <div onContextMenu={onContextMenu}>
      <div className="group flex items-center gap-1.5 pl-2 pr-2 transition-colors hover:bg-elevated">
        <button
          type="button"
          onClick={onToggle}
          className="text-fg-subtle hover:text-fg"
          aria-label={expanded ? 'Collapse columns' : 'Expand columns'}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(table.name)}
            className="flex-1 truncate py-1 text-left font-mono text-[12px] text-fg transition-colors hover:text-accent"
            title={table.name}
          >
            {highlightMatch(table.name, filter)}
          </button>
        ) : (
          <span
            className="flex-1 truncate py-1 font-mono text-[12px] text-fg"
            title={table.name}
          >
            {highlightMatch(table.name, filter)}
          </span>
        )}
      </div>
      {expanded && (
        <ul className="flex flex-col">
          {table.columns.map((c) => (
            <li
              key={c.name}
              className="group flex items-center gap-2 py-0.5 pl-9 pr-3 text-fg-muted transition-colors hover:bg-elevated"
            >
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(`${table.name}.${c.name}`)}
                  className="flex-1 truncate text-left font-mono text-[11px] hover:text-fg"
                  title={c.name}
                >
                  {c.name}
                  {!c.nullable && <span className="ml-0.5 text-danger">*</span>}
                </button>
              ) : (
                <span className="flex-1 truncate font-mono text-[11px]" title={c.name}>
                  {c.name}
                  {!c.nullable && <span className="ml-0.5 text-danger">*</span>}
                </span>
              )}
              <span className="shrink-0 font-mono text-[10px] uppercase text-fg-subtle">
                {c.sqlType}
              </span>
            </li>
          ))}
          {table.columns.length === 0 && (
            <li className="py-1 pl-9 italic text-fg-subtle">no columns</li>
          )}
        </ul>
      )}
    </div>
  );
}
