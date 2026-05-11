import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { TableContextMenu } from './TableContextMenu';
import type { Schema, TableAction, TableInfo } from './types';

export interface SchemaBrowserProps {
  /** The current schema, or `null` while it is being fetched / before
   *  a session is open. */
  schema: Schema | null;
  /** Disables the refresh button while a request is in flight. */
  busy?: boolean;
  /** Fired when the user clicks the refresh chevron. Omit to hide. */
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

/**
 * Sidebar tree of tables and views with their columns.
 *
 * The component is purely presentational: the host owns the schema
 * state, refresh handler, and any click-to-insert behaviour. Two-level
 * (table → columns) only; nested relations would need a richer
 * `Schema` shape.
 */
interface MenuState {
  table: TableInfo;
  x: number;
  y: number;
}

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

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filterLower = filter.trim().toLowerCase();
  const tables =
    schema === null
      ? []
      : filterLower === ''
        ? schema.tables
        : schema.tables.filter((t) => t.name.toLowerCase().includes(filterLower));

  return (
    <aside className="flex h-full flex-col gap-2 border-r border-zinc-800 bg-zinc-950 p-3 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Schema</h2>
        {onRefresh && (
          <button
            type="button"
            className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={busy}
            onClick={onRefresh}
            aria-label="Refresh schema"
          >
            ↻
          </button>
        )}
      </div>
      <input
        className="input text-xs"
        placeholder="Filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter tables"
      />
      <div className="flex-1 overflow-y-auto">
        {schema === null ? (
          <p className="text-zinc-500">No schema loaded.</p>
        ) : tables.length === 0 ? (
          <p className="text-zinc-500">
            {schema.tables.length === 0 ? 'No user tables.' : 'No matches.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {tables.map((t) => (
              <TableNode
                key={t.name}
                table={t}
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
            ))}
          </ul>
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

interface TableNodeProps {
  table: TableInfo;
  expanded: boolean;
  onToggle: () => void;
  onSelect: ((identifier: string) => void) | undefined;
  onContextMenu: ((event: ReactMouseEvent<HTMLLIElement>) => void) | undefined;
}

function TableNode({ table, expanded, onToggle, onSelect, onContextMenu }: TableNodeProps) {
  return (
    <li onContextMenu={onContextMenu}>
      <div className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-900">
        <button
          type="button"
          onClick={onToggle}
          className="text-zinc-500"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(table.name)}
            className="flex-1 text-left text-zinc-200 hover:text-zinc-50"
          >
            {table.name}
          </button>
        ) : (
          <span className="flex-1 text-zinc-200">{table.name}</span>
        )}
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{table.kind}</span>
      </div>
      {expanded && (
        <ul className="ml-4 mt-0.5 flex flex-col gap-0.5">
          {table.columns.map((c) => (
            <li
              key={c.name}
              className="flex items-center gap-2 px-1 py-0.5 text-zinc-400 hover:bg-zinc-900"
            >
              {onSelect ? (
                <button
                  type="button"
                  className="flex-1 text-left hover:text-zinc-200"
                  onClick={() => onSelect(`${table.name}.${c.name}`)}
                >
                  {c.name}
                  {c.nullable ? '' : ' *'}
                </button>
              ) : (
                <span className="flex-1">
                  {c.name}
                  {c.nullable ? '' : ' *'}
                </span>
              )}
              <span className="text-[10px] text-zinc-500">{c.sqlType}</span>
            </li>
          ))}
          {table.columns.length === 0 && (
            <li className="px-1 py-0.5 text-zinc-600 italic">no columns</li>
          )}
        </ul>
      )}
    </li>
  );
}
