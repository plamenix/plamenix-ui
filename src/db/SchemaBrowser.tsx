import {
  useState,
  type ComponentType,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  Cog,
  Database,
  DatabaseBackup,
  Eye,
  Hash,
  List as ListIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shapes,
  Table2,
  X,
  Zap,
} from 'lucide-react';
import {
  Gauge,
  KeyRound,
  Pencil,
  Play,
  Power,
  RefreshCcw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { TableContextMenu, type SchemaMenuItem } from './TableContextMenu';
import type { NewObjectKind } from './NewObjectModal';
import type { ObjectListKind } from './ObjectListPage';
import { getModKeyLabel, getShiftKeyLabel } from '../platform';
import type {
  DomainInfo,
  GeneratorInfo,
  ProcedureInfo,
  Schema,
  SchemaAction,
  TableInfo,
  TriggerInfo,
} from './types';

export interface SchemaBrowserExtra {
  /** Optional handler invoked by the "+ New table…" button in the
   *  tables section header. When omitted the button is hidden. */
  onNewTable?: () => void;
}

export interface SchemaBrowserProps extends SchemaBrowserExtra {
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
  /** Fired when the user picks a DDL action from any object's
   *  right-click menu. The browser never executes SQL itself; the
   *  host translates the action into a statement and routes it
   *  through the usual execute path. Omit to suppress all menus. */
  onAction?: (action: SchemaAction) => void;
  /** Fired when the user clicks the "open list" icon next to a
   *  section header. The host swaps the main content area for an
   *  `ObjectListPage` of the requested entity kind. Omit to hide
   *  the icons. */
  onPickObjectList?: ((kind: ObjectListKind) => void) | undefined;
  /** Fired when the user clicks the "+ New" icon next to a
   *  non-table section header (views, procedures, triggers,
   *  generators, domains). The host typically opens a
   *  `NewObjectModal` of the requested kind. Tables have their own
   *  dedicated builder via `onNewTable`. Omit to hide the icons. */
  onNewObject?: ((kind: NewObjectKind) => void) | undefined;
  /** Fired when the user clicks the "export database" icon in the
   *  Schema header. Host typically opens a `DatabaseExportModal`. */
  onExportDatabase?: (() => void) | undefined;
  /** Active Firebird engine version (e.g. `'3.0.7'`). Forwarded to the
   *  generator inline editor so it can pick the right dialect for
   *  RESTART WITH vs SET GENERATOR. `null` when probing is not done
   *  yet — defaults to the modern dialect. */
  engineVersion?: string | null | undefined;
  /** Fired when the user clicks the "View DDL" eye icon on a view,
   *  procedure, or trigger row. The host fetches the source text and
   *  surfaces a `DdlViewerModal`. */
  onShowDdl?: ((kind: 'view' | 'procedure' | 'trigger', name: string) => void) | undefined;
  /** Fired when the user wants to open the deep cross-schema search
   *  palette (Mod+Shift+F). Renders a small affordance to the right of
   *  the local filter input. Omit to hide. */
  onOpenDeepSearch?: () => void;
  /** Fired when the user clicks a table, view, procedure, or trigger
   *  name. The host typically:
   *   - **table**     → runs `SELECT * FROM <name>` and renders the result
   *   - **view**      → opens the DDL viewer
   *   - **procedure** → opens the DDL viewer
   *   - **trigger**   → opens the DDL viewer
   *
   *  Mirrors DBeaver / DataGrip / TablePlus click semantics. When
   *  omitted, the legacy `onSelect` (paste-into-editor) handler runs
   *  instead so older hosts keep working. */
  onOpenObject?: (
    target:
      | { kind: 'table'; name: string }
      | { kind: 'view'; name: string }
      | { kind: 'procedure'; name: string }
      | { kind: 'trigger'; name: string },
  ) => void;
}

type MenuTarget =
  | { kind: 'table'; target: TableInfo }
  | { kind: 'view'; target: TableInfo }
  | { kind: 'procedure'; target: ProcedureInfo }
  | { kind: 'trigger'; target: TriggerInfo }
  | { kind: 'generator'; target: GeneratorInfo }
  | { kind: 'domain'; target: DomainInfo };

interface MenuState {
  target: MenuTarget;
  x: number;
  y: number;
}

const TABLE_MENU: SchemaMenuItem<
  'alter' | 'create-index' | 'recompute-statistics' | 'recreate' | 'drop'
>[] = [
  { action: 'alter', label: 'ALTER TABLE…', hint: 'Edit columns or constraints', icon: Pencil },
  {
    action: 'create-index',
    label: 'CREATE INDEX…',
    hint: 'Add a new index',
    icon: KeyRound,
  },
  {
    action: 'recompute-statistics',
    label: 'Recompute statistics',
    hint: 'SET STATISTICS INDEX for every index on this table',
    icon: Gauge,
  },
  {
    action: 'recreate',
    label: 'RECREATE TABLE…',
    hint: 'DROP + CREATE template — loses all rows',
    icon: RefreshCcw,
    tone: 'danger',
  },
  { action: 'drop', label: 'DROP', hint: 'Permanently delete this table', icon: Trash2, tone: 'danger' },
];

const VIEW_MENU: SchemaMenuItem<'alter' | 'show-source' | 'drop'>[] = [
  { action: 'alter', label: 'ALTER VIEW…', hint: 'Edit the view definition', icon: Pencil },
  {
    action: 'show-source',
    label: 'Show source',
    hint: 'Insert SELECT against RDB$VIEW_SOURCE',
    icon: KeyRound,
  },
  { action: 'drop', label: 'DROP', hint: 'Permanently delete this view', icon: Trash2, tone: 'danger' },
];

const PROC_MENU: SchemaMenuItem<'execute' | 'alter' | 'show-source' | 'drop'>[] = [
  { action: 'execute', label: 'EXECUTE…', hint: 'Insert an EXECUTE PROCEDURE template', icon: Play },
  { action: 'alter', label: 'ALTER PROCEDURE…', hint: 'Edit the procedure body', icon: Pencil },
  {
    action: 'show-source',
    label: 'Show source',
    hint: 'Insert SELECT against RDB$PROCEDURE_SOURCE',
    icon: KeyRound,
  },
  { action: 'drop', label: 'DROP', hint: 'Permanently delete this procedure', icon: Trash2, tone: 'danger' },
];

const TRIGGER_MENU: SchemaMenuItem<'toggle-active' | 'show-source' | 'drop'>[] = [
  {
    action: 'toggle-active',
    label: 'ALTER ACTIVE / INACTIVE',
    hint: 'Toggle the trigger state',
    icon: Power,
  },
  {
    action: 'show-source',
    label: 'Show source',
    hint: 'Insert SELECT against RDB$TRIGGER_SOURCE',
    icon: KeyRound,
  },
  { action: 'drop', label: 'DROP', hint: 'Permanently delete this trigger', icon: Trash2, tone: 'danger' },
];

const GEN_MENU: SchemaMenuItem<'next-value' | 'reset' | 'drop'>[] = [
  {
    action: 'next-value',
    label: 'NEXT VALUE FOR',
    hint: 'Insert SELECT NEXT VALUE FOR',
    icon: Play,
  },
  {
    action: 'reset',
    label: 'Reset to 0',
    hint: 'Insert SET GENERATOR ... TO 0',
    icon: RotateCcw,
  },
  { action: 'drop', label: 'DROP', hint: 'Permanently delete this generator', icon: Trash2, tone: 'danger' },
];

const DOMAIN_MENU: SchemaMenuItem<'alter-type' | 'drop'>[] = [
  {
    action: 'alter-type',
    label: 'ALTER DOMAIN … TYPE',
    hint: 'Change the underlying SQL type',
    icon: Pencil,
  },
  { action: 'drop', label: 'DROP', hint: 'Permanently delete this domain', icon: Trash2, tone: 'danger' },
];

/** Builds the `draggable` + `onDragStart` props that publish `id` as
 *  `text/plain`. Listeners in `SqlEditor` insert that string at the
 *  caret position when the drag lands inside the editor. */
function dragProps(id: string): {
  draggable: true;
  onDragStart: (e: ReactDragEvent<HTMLElement>) => void;
} {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
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
  onNewTable,
  onPickObjectList,
  onNewObject,
  onExportDatabase,
  engineVersion,
  onShowDdl,
  onOpenObject,
  onOpenDeepSearch,
}: SchemaBrowserProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [openTables, setOpenTables] = useState(true);
  const [openViews, setOpenViews] = useState(true);
  const [openProcs, setOpenProcs] = useState(false);
  const [openTriggers, setOpenTriggers] = useState(false);
  const [openGens, setOpenGens] = useState(false);
  const [openDomains, setOpenDomains] = useState(false);

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
  const allProcs = schema?.procedures ?? [];
  const allTriggers = schema?.triggers ?? [];
  const allGens = schema?.generators ?? [];
  const allDomains = schema?.domains ?? [];
  const matchesFilter = (name: string) =>
    !isSearching || name.toLowerCase().includes(lower);
  // Tables/views: keep the table when its name matches OR any of its
  // columns match. `columnHits` carries the matching column names so we
  // can auto-expand the row and the renderer can highlight them.
  const buildTableMatch = (t: TableInfo) => {
    if (!isSearching) return { table: t, columnHits: [] as string[] };
    const nameHit = t.name.toLowerCase().includes(lower);
    const columnHits = t.columns
      .filter((c) => c.name.toLowerCase().includes(lower))
      .map((c) => c.name);
    if (!nameHit && columnHits.length === 0) return null;
    return { table: t, columnHits };
  };
  const tableMatches = allTables
    .filter((t) => t.kind === 'table')
    .map(buildTableMatch)
    .filter((m): m is { table: TableInfo; columnHits: string[] } => m !== null);
  const viewMatches = allTables
    .filter((t) => t.kind === 'view')
    .map(buildTableMatch)
    .filter((m): m is { table: TableInfo; columnHits: string[] } => m !== null);
  const tables = tableMatches.map((m) => m.table);
  const views = viewMatches.map((m) => m.table);
  const procs = allProcs.filter((p) => matchesFilter(p.name));
  const triggers = allTriggers.filter(
    (t) => matchesFilter(t.name) || matchesFilter(t.relation),
  );
  const gens = allGens.filter((g) => matchesFilter(g.name));
  const domains = allDomains.filter((d) => matchesFilter(d.name));
  const showTables = isSearching || openTables;
  const showViews = isSearching || openViews;
  const showProcs = isSearching || openProcs;
  const showTriggers = isSearching || openTriggers;
  const showGens = isSearching || openGens;
  const showDomains = isSearching || openDomains;

  const openMenu = (target: MenuTarget) => (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setMenu({ target, x: event.clientX, y: event.clientY });
  };

  const renderTableNode = (entry: { table: TableInfo; columnHits: string[] }) => {
    const tableKind = entry.table.kind === 'view' ? 'view' : 'table';
    const onOpen = onOpenObject
      ? () => onOpenObject({ kind: tableKind, name: entry.table.name })
      : undefined;
    return (
      <TableNode
        key={entry.table.name}
        table={entry.table}
        filter={filter}
        // Force-expand tables that only matched via a column so the user
        // immediately sees the hit. Otherwise honour the manual toggle.
        expanded={expanded.has(entry.table.name) || entry.columnHits.length > 0}
        onToggle={() => toggle(entry.table.name)}
        onSelect={onSelect}
        onOpen={onOpen}
        onContextMenu={
          onAction
            ? openMenu({ kind: tableKind, target: entry.table })
            : undefined
        }
        onShowDdl={
          onShowDdl && entry.table.kind === 'view'
            ? () => onShowDdl('view', entry.table.name)
            : undefined
        }
      />
    );
  };

  return (
    <aside className="flex h-full flex-col bg-panel text-xs">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-accent" />
          <h2 className="text-[13px] font-semibold text-fg">Schema</h2>
        </div>
        <div className="flex items-center gap-1">
          {onExportDatabase && (
            <button
              type="button"
              onClick={onExportDatabase}
              disabled={busy}
              aria-label="Export database"
              title="Export database…"
              className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
            >
              <DatabaseBackup className="h-3.5 w-3.5" />
            </button>
          )}
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
      </div>

      <div className="border-b border-edge px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            placeholder="Filter objects + columns…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg border border-edge bg-inset py-1.5 pl-8 pr-8 text-xs text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            aria-label="Filter schema objects and columns"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              aria-label="Clear filter"
              title="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {onOpenDeepSearch && !filter && (
          <button
            type="button"
            onClick={onOpenDeepSearch}
            title="Deep search across the schema (tables, columns, procedures…)"
            className="mt-1.5 flex w-full items-center justify-between rounded-md px-1.5 py-0.5 text-[10px] text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <span>Deep search across schema</span>
            <kbd className="rounded border border-edge bg-inset px-1 py-px font-mono text-[9px] tracking-tight text-fg-muted">
              {getModKeyLabel()}+{getShiftKeyLabel()}+F
            </kbd>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {schema === null ? (
          <p className="px-3 py-2 italic text-fg-subtle">No schema loaded.</p>
        ) : allTables.length === 0 &&
          allProcs.length === 0 &&
          allTriggers.length === 0 &&
          allGens.length === 0 &&
          allDomains.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
            <Database className="mb-3 h-8 w-8 text-fg-subtle opacity-40" />
            <p className="text-xs font-medium text-fg-muted">Empty schema</p>
          </div>
        ) : tables.length === 0 &&
          views.length === 0 &&
          procs.length === 0 &&
          triggers.length === 0 &&
          gens.length === 0 &&
          domains.length === 0 ? (
          <p className="px-3 py-2 italic text-fg-subtle">No matches.</p>
        ) : (
          <>
            {(onNewTable ||
              tables.length > 0 ||
              (!isSearching && allTables.some((t) => t.kind === 'table'))) && (
              <>
                <SectionHeader
                  label="Tables"
                  icon={Table2}
                  open={showTables}
                  count={tables.length}
                  locked={isSearching}
                  onToggle={() => setOpenTables((v) => !v)}
                  onRefresh={onRefresh}
                  busy={busy}
                  action={
                    onNewTable
                      ? { icon: Plus, label: 'New table…', onClick: onNewTable }
                      : undefined
                  }
                  onOpenList={
                    onPickObjectList ? () => onPickObjectList('tables') : undefined
                  }
                />
                {showTables && tableMatches.map(renderTableNode)}
              </>
            )}

            {(views.length > 0 || (!isSearching && allTables.some((t) => t.kind === 'view'))) && (
              <>
                <SectionHeader
                  label="Views"
                  icon={Eye}
                  open={showViews}
                  count={views.length}
                  locked={isSearching}
                  onToggle={() => setOpenViews((v) => !v)}
                  onRefresh={onRefresh}
                  busy={busy}
                  onOpenList={
                    onPickObjectList ? () => onPickObjectList('views') : undefined
                  }
                  action={
                    onNewObject
                      ? { icon: Plus, label: 'New view…', onClick: () => onNewObject('view') }
                      : undefined
                  }
                />
                {showViews && viewMatches.map(renderTableNode)}
              </>
            )}

            {(procs.length > 0 || (!isSearching && allProcs.length > 0)) && (
              <>
                <SectionHeader
                  label="Procedures"
                  icon={Cog}
                  open={showProcs}
                  count={procs.length}
                  locked={isSearching}
                  onToggle={() => setOpenProcs((v) => !v)}
                  onRefresh={onRefresh}
                  busy={busy}
                  onOpenList={
                    onPickObjectList ? () => onPickObjectList('procedures') : undefined
                  }
                  action={
                    onNewObject
                      ? {
                          icon: Plus,
                          label: 'New procedure…',
                          onClick: () => onNewObject('procedure'),
                        }
                      : undefined
                  }
                />
                {showProcs &&
                  procs.map((p) => (
                    <ProcedureNode
                      key={p.name}
                      proc={p}
                      filter={filter}
                      onSelect={onSelect}
                      onOpen={
                        onOpenObject
                          ? () => onOpenObject({ kind: 'procedure', name: p.name })
                          : undefined
                      }
                      onContextMenu={
                        onAction ? openMenu({ kind: 'procedure', target: p }) : undefined
                      }
                      onShowDdl={
                        onShowDdl ? () => onShowDdl('procedure', p.name) : undefined
                      }
                    />
                  ))}
              </>
            )}

            {(triggers.length > 0 || (!isSearching && allTriggers.length > 0)) && (
              <>
                <SectionHeader
                  label="Triggers"
                  icon={Zap}
                  open={showTriggers}
                  count={triggers.length}
                  locked={isSearching}
                  onToggle={() => setOpenTriggers((v) => !v)}
                  onRefresh={onRefresh}
                  busy={busy}
                  onOpenList={
                    onPickObjectList ? () => onPickObjectList('triggers') : undefined
                  }
                  action={
                    onNewObject
                      ? {
                          icon: Plus,
                          label: 'New trigger…',
                          onClick: () => onNewObject('trigger'),
                        }
                      : undefined
                  }
                />
                {showTriggers &&
                  triggers.map((t) => (
                    <TriggerNode
                      key={t.name}
                      trigger={t}
                      filter={filter}
                      onSelect={onSelect}
                      onOpen={
                        onOpenObject
                          ? () => onOpenObject({ kind: 'trigger', name: t.name })
                          : undefined
                      }
                      onContextMenu={
                        onAction ? openMenu({ kind: 'trigger', target: t }) : undefined
                      }
                      onToggleActive={
                        onAction
                          ? () =>
                              onAction({
                                kind: 'trigger',
                                action: 'toggle-active',
                                target: t,
                              })
                          : undefined
                      }
                      onShowDdl={
                        onShowDdl ? () => onShowDdl('trigger', t.name) : undefined
                      }
                    />
                  ))}
              </>
            )}

            {(gens.length > 0 || (!isSearching && allGens.length > 0)) && (
              <>
                <SectionHeader
                  label="Generators"
                  icon={Hash}
                  open={showGens}
                  count={gens.length}
                  locked={isSearching}
                  onToggle={() => setOpenGens((v) => !v)}
                  onRefresh={onRefresh}
                  busy={busy}
                  onOpenList={
                    onPickObjectList ? () => onPickObjectList('generators') : undefined
                  }
                  action={
                    onNewObject
                      ? {
                          icon: Plus,
                          label: 'New generator…',
                          onClick: () => onNewObject('generator'),
                        }
                      : undefined
                  }
                />
                {showGens &&
                  gens.map((g) => (
                    <GeneratorNode
                      key={g.name}
                      gen={g}
                      filter={filter}
                      onSelect={onSelect}
                      onContextMenu={
                        onAction ? openMenu({ kind: 'generator', target: g }) : undefined
                      }
                      onSetValue={
                        onAction
                          ? (next) =>
                              onAction({
                                kind: 'generator',
                                action: 'set-value',
                                target: g,
                                value: next,
                                engineVersion: engineVersion ?? null,
                              })
                          : undefined
                      }
                    />
                  ))}
              </>
            )}

            {(domains.length > 0 || (!isSearching && allDomains.length > 0)) && (
              <>
                <SectionHeader
                  label="Domains"
                  icon={Shapes}
                  open={showDomains}
                  count={domains.length}
                  locked={isSearching}
                  onToggle={() => setOpenDomains((v) => !v)}
                  onRefresh={onRefresh}
                  busy={busy}
                  onOpenList={
                    onPickObjectList ? () => onPickObjectList('domains') : undefined
                  }
                  action={
                    onNewObject
                      ? {
                          icon: Plus,
                          label: 'New domain…',
                          onClick: () => onNewObject('domain'),
                        }
                      : undefined
                  }
                />
                {showDomains &&
                  domains.map((d) => (
                    <DomainNode
                      key={d.name}
                      domain={d}
                      filter={filter}
                      onSelect={onSelect}
                      onContextMenu={
                        onAction ? openMenu({ kind: 'domain', target: d }) : undefined
                      }
                    />
                  ))}
              </>
            )}
          </>
        )}
      </div>

      {menu && onAction && renderMenu(menu, onAction, () => setMenu(null))}
    </aside>
  );
}

function renderMenu(
  menu: MenuState,
  onAction: (action: SchemaAction) => void,
  onClose: () => void,
) {
  const t = menu.target;
  switch (t.kind) {
    case 'table':
      return (
        <TableContextMenu
          x={menu.x}
          y={menu.y}
          headerIcon={Table2}
          kindLabel="table"
          title={t.target.name}
          items={TABLE_MENU}
          onAction={(action) => onAction({ kind: 'table', action, target: t.target })}
          onClose={onClose}
        />
      );
    case 'view':
      return (
        <TableContextMenu
          x={menu.x}
          y={menu.y}
          headerIcon={Eye}
          kindLabel="view"
          title={t.target.name}
          items={VIEW_MENU}
          onAction={(action) => onAction({ kind: 'view', action, target: t.target })}
          onClose={onClose}
        />
      );
    case 'procedure':
      return (
        <TableContextMenu
          x={menu.x}
          y={menu.y}
          headerIcon={Cog}
          kindLabel="procedure"
          title={t.target.name}
          items={PROC_MENU}
          onAction={(action) => onAction({ kind: 'procedure', action, target: t.target })}
          onClose={onClose}
        />
      );
    case 'trigger':
      return (
        <TableContextMenu
          x={menu.x}
          y={menu.y}
          headerIcon={Zap}
          kindLabel="trigger"
          title={t.target.name}
          items={TRIGGER_MENU}
          onAction={(action) => onAction({ kind: 'trigger', action, target: t.target })}
          onClose={onClose}
        />
      );
    case 'generator':
      return (
        <TableContextMenu
          x={menu.x}
          y={menu.y}
          headerIcon={Hash}
          kindLabel="generator"
          title={t.target.name}
          items={GEN_MENU}
          onAction={(action) => onAction({ kind: 'generator', action, target: t.target })}
          onClose={onClose}
        />
      );
    case 'domain':
      return (
        <TableContextMenu
          x={menu.x}
          y={menu.y}
          headerIcon={Shapes}
          kindLabel="domain"
          title={t.target.name}
          items={DOMAIN_MENU}
          onAction={(action) => onAction({ kind: 'domain', action, target: t.target })}
          onClose={onClose}
        />
      );
  }
}

interface SectionHeaderProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  open: boolean;
  count: number;
  /** Search-driven force-open: clicking does nothing while locked. */
  locked: boolean;
  onToggle: () => void;
  /** Optional small action rendered on the right edge, e.g. "+ New". */
  action?:
    | {
        icon: ComponentType<{ className?: string }>;
        label: string;
        onClick: () => void;
      }
    | undefined;
  /** When supplied, renders an "open full-screen list" icon button
   *  on the right edge. Click fires the callback; the host typically
   *  swaps the main content area for an `ObjectListPage` of this
   *  entity kind. */
  onOpenList?: (() => void) | undefined;
  /** When supplied, renders a small refresh icon button next to the
   *  section header. The handler typically re-fetches the entire
   *  schema (Firebird describes everything in one call) but is placed
   *  per-section for proximity. */
  onRefresh?: (() => void) | undefined;
  /** Disables the refresh button + swaps the icon for a spinner. */
  busy?: boolean;
}

function SectionHeader({
  label,
  icon: Icon,
  open,
  count,
  locked,
  onToggle,
  action,
  onOpenList,
  onRefresh,
  busy = false,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        disabled={locked}
        className="flex flex-1 items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:hover:bg-transparent disabled:hover:text-fg-muted"
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
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          title={`Refresh ${label.toLowerCase()}`}
          aria-label={`Refresh ${label.toLowerCase()}`}
          className="mr-1 flex h-6 w-6 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </button>
      )}
      {onOpenList && (
        <button
          type="button"
          onClick={onOpenList}
          title={`Open full ${label.toLowerCase()} list`}
          aria-label={`Open full ${label.toLowerCase()} list`}
          className="mr-1 flex h-6 w-6 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
        >
          <ListIcon className="h-3 w-3" />
        </button>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          title={action.label}
          aria-label={action.label}
          className="mr-1 flex h-6 w-6 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
        >
          <action.icon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface TableNodeProps {
  table: TableInfo;
  filter: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: ((identifier: string) => void) | undefined;
  /** Primary click target. When set, overrides the legacy paste-on-click
   *  behaviour driven by `onSelect`. Tables wire this to "browse rows",
   *  views to "view DDL" — matches DBeaver/DataGrip semantics. */
  onOpen?: (() => void) | undefined;
  onContextMenu: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
  /** Hover-reveal "View DDL" button. Passed only for view rows; tables
   *  have no `RDB$VIEW_SOURCE` analogue. */
  onShowDdl?: (() => void) | undefined;
}

function TableNode({
  table,
  filter,
  expanded,
  onToggle,
  onSelect,
  onOpen,
  onContextMenu,
  onShowDdl,
}: TableNodeProps) {
  // When the host wires `onOpen`, name-click matches DBeaver/DataGrip
  // semantics: tables run a SELECT into the result panel, views/procs/
  // triggers raise the DDL viewer. The legacy `onSelect` paste path
  // stays as the fallback for hosts that haven't migrated yet.
  const handleNameClick = onOpen ?? (onSelect ? () => onSelect(table.name) : undefined);
  const nameTitle = onOpen
    ? table.kind === 'view'
      ? `${table.name} — click to view DDL, drag to insert`
      : `${table.name} — click to browse rows, drag to insert`
    : `${table.name} — click to insert, drag into the editor`;
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
        {handleNameClick ? (
          <button
            type="button"
            onClick={handleNameClick}
            className="flex-1 truncate py-1 text-left font-mono text-[12px] text-fg transition-colors hover:text-accent"
            title={nameTitle}
            {...dragProps(table.name)}
          >
            {highlightMatch(table.name, filter)}
          </button>
        ) : (
          <span
            className="flex-1 truncate py-1 font-mono text-[12px] text-fg"
            title={table.name}
            {...dragProps(table.name)}
          >
            {highlightMatch(table.name, filter)}
          </span>
        )}
        {onShowDdl && (
          <button
            type="button"
            onClick={onShowDdl}
            title="View DDL"
            aria-label="View DDL"
            className="shrink-0 rounded p-0.5 text-fg-subtle opacity-0 transition-all group-hover:opacity-100 hover:bg-elevated hover:text-fg"
          >
            <Eye className="h-3 w-3" />
          </button>
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
                  title={`${table.name}.${c.name}`}
                  {...dragProps(`${table.name}.${c.name}`)}
                >
                  {highlightMatch(c.name, filter)}
                  {!c.nullable && <span className="ml-0.5 text-danger">*</span>}
                </button>
              ) : (
                <span
                  className="flex-1 truncate font-mono text-[11px]"
                  title={c.name}
                  {...dragProps(`${table.name}.${c.name}`)}
                >
                  {highlightMatch(c.name, filter)}
                  {!c.nullable && <span className="ml-0.5 text-danger">*</span>}
                </span>
              )}
              <span
                className={`shrink-0 font-mono text-[10px] uppercase ${
                  c.sqlType.includes('[]')
                    ? 'text-warning'
                    : 'text-fg-subtle'
                }`}
                title={
                  c.sqlType.includes('[]')
                    ? `${c.sqlType} — ARRAY columns are not decodable by the current driver. SELECT-ing this column will fail; CAST or unnest it first.`
                    : c.sqlType
                }
              >
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

interface LeafNodeProps {
  name: string;
  filter: string;
  onSelect?: ((identifier: string) => void) | undefined;
  /** Optional right-aligned annotation, e.g. parameter counts or SQL type. */
  hint?: ReactNode;
  /** Optional tooltip for the row. Falls back to `name`. */
  title?: string;
  onContextMenu?: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
}

function LeafNode({ name, filter, onSelect, hint, title, onContextMenu }: LeafNodeProps) {
  const inner = (
    <span className="truncate font-mono text-[12px]" title={title ?? name}>
      {highlightMatch(name, filter)}
    </span>
  );
  return (
    <div
      onContextMenu={onContextMenu}
      className="group flex items-center gap-1.5 px-3 py-1 pl-7 transition-colors hover:bg-elevated"
    >
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(name)}
          className="flex-1 truncate text-left text-fg transition-colors hover:text-accent"
          {...dragProps(name)}
        >
          {inner}
        </button>
      ) : (
        <span className="flex-1 truncate text-fg" {...dragProps(name)}>
          {inner}
        </span>
      )}
      {hint && (
        <span className="shrink-0 font-mono text-[10px] uppercase text-fg-subtle">{hint}</span>
      )}
    </div>
  );
}

function ProcedureNode({
  proc,
  filter,
  onSelect,
  onOpen,
  onContextMenu,
  onShowDdl,
}: {
  proc: ProcedureInfo;
  filter: string;
  onSelect?: ((identifier: string) => void) | undefined;
  onOpen?: (() => void) | undefined;
  onContextMenu?: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
  onShowDdl?: (() => void) | undefined;
}) {
  const hint = `${proc.inputCount}→${proc.outputCount}`;
  const handleNameClick = onOpen ?? (onSelect ? () => onSelect(proc.name) : undefined);
  const nameTitle = onOpen
    ? `${proc.name} — click to view DDL, drag to insert`
    : proc.name;
  return (
    <div
      onContextMenu={onContextMenu}
      className="group flex items-center gap-2 px-3 py-1 pl-7 transition-colors hover:bg-elevated"
    >
      {handleNameClick ? (
        <button
          type="button"
          onClick={handleNameClick}
          className="flex-1 truncate text-left font-mono text-[12px] text-fg transition-colors hover:text-accent"
          title={nameTitle}
          {...dragProps(proc.name)}
        >
          {highlightMatch(proc.name, filter)}
        </button>
      ) : (
        <span
          className="flex-1 truncate font-mono text-[12px] text-fg"
          title={proc.name}
          {...dragProps(proc.name)}
        >
          {highlightMatch(proc.name, filter)}
        </span>
      )}
      <span className="shrink-0 font-mono text-[10px] uppercase text-fg-subtle">
        {hint}
      </span>
      {onShowDdl && (
        <button
          type="button"
          onClick={onShowDdl}
          title="View DDL"
          aria-label="View DDL"
          className="shrink-0 rounded p-0.5 text-fg-subtle opacity-0 transition-all group-hover:opacity-100 hover:bg-elevated hover:text-fg"
        >
          <Eye className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function TriggerNode({
  trigger,
  filter,
  onSelect,
  onOpen,
  onContextMenu,
  onToggleActive,
  onShowDdl,
}: {
  trigger: TriggerInfo;
  filter: string;
  onSelect?: ((identifier: string) => void) | undefined;
  onOpen?: (() => void) | undefined;
  onContextMenu?: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
  onToggleActive?: (() => void) | undefined;
  onShowDdl?: (() => void) | undefined;
}) {
  const label = decodeTriggerType(trigger.triggerType);
  const nameClass = trigger.active
    ? 'text-fg'
    : 'text-fg-subtle line-through';
  const renderedName = (
    <>
      {highlightMatch(trigger.name, filter)}
      {!trigger.active && (
        <span className="ml-1 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
          (inactive)
        </span>
      )}
    </>
  );
  const handleNameClick = onOpen ?? (onSelect ? () => onSelect(trigger.name) : undefined);
  const nameTitle = `${trigger.name}${trigger.relation ? ` on ${trigger.relation}` : ''}${
    onOpen ? ' — click to view DDL, drag to insert' : ''
  }`;
  return (
    <div
      onContextMenu={onContextMenu}
      className="group flex items-center gap-1.5 px-3 py-1 pl-7 transition-colors hover:bg-elevated"
    >
      <div className="flex-1 truncate">
        {handleNameClick ? (
          <button
            type="button"
            onClick={handleNameClick}
            className={`block w-full truncate text-left font-mono text-[12px] transition-colors hover:text-accent ${nameClass}`}
            title={nameTitle}
            {...dragProps(trigger.name)}
          >
            {renderedName}
          </button>
        ) : (
          <span
            className={`block truncate font-mono text-[12px] ${nameClass}`}
            {...dragProps(trigger.name)}
          >
            {renderedName}
          </span>
        )}
        {trigger.relation && (
          <span className="block truncate font-mono text-[10px] text-fg-subtle">
            {label} · {trigger.relation}
          </span>
        )}
      </div>
      {onShowDdl && (
        <button
          type="button"
          onClick={onShowDdl}
          title="View DDL"
          aria-label="View DDL"
          className="shrink-0 rounded p-0.5 text-fg-subtle opacity-0 transition-all group-hover:opacity-100 hover:bg-elevated hover:text-fg"
        >
          <Eye className="h-3 w-3" />
        </button>
      )}
      {onToggleActive && (
        <button
          type="button"
          onClick={onToggleActive}
          title={trigger.active ? 'Deactivate trigger' : 'Activate trigger'}
          aria-label={trigger.active ? 'Deactivate trigger' : 'Activate trigger'}
          className={`shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-elevated ${
            trigger.active ? 'text-success hover:text-fg' : 'text-fg-subtle hover:text-success'
          }`}
        >
          <Power className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function GeneratorNode({
  gen,
  filter,
  onSelect,
  onContextMenu,
  onSetValue,
}: {
  gen: GeneratorInfo;
  filter: string;
  onSelect?: ((identifier: string) => void) | undefined;
  onContextMenu?: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
  onSetValue?: ((next: number) => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(gen.currentValue));

  const beginEdit = () => {
    setDraft(String(gen.currentValue));
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setEditing(false);
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next) || !Number.isSafeInteger(next)) {
      setEditing(false);
      return;
    }
    if (next === gen.currentValue) {
      setEditing(false);
      return;
    }
    if (next < gen.currentValue) {
      const ok = window.confirm(
        `Lower generator ${gen.name} from ${gen.currentValue.toLocaleString()} to ${next.toLocaleString()}? New rows may collide with existing values.`,
      );
      if (!ok) {
        setEditing(false);
        return;
      }
    }
    onSetValue?.(next);
    setEditing(false);
  };

  return (
    <div
      onContextMenu={onContextMenu}
      className="group flex items-center gap-1.5 px-3 py-1 pl-7 transition-colors hover:bg-elevated"
    >
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(gen.name)}
          className="flex-1 truncate text-left font-mono text-[12px] text-fg transition-colors hover:text-accent"
          title={gen.name}
          {...dragProps(gen.name)}
        >
          {highlightMatch(gen.name, filter)}
        </button>
      ) : (
        <span
          className="flex-1 truncate font-mono text-[12px] text-fg"
          {...dragProps(gen.name)}
        >
          {highlightMatch(gen.name, filter)}
        </span>
      )}
      {editing ? (
        <input
          type="number"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          onBlur={() => setEditing(false)}
          className="w-24 rounded border border-edge bg-canvas px-1 py-0.5 text-right font-mono text-[11px] text-fg focus:border-accent focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onSetValue ? beginEdit : undefined}
          disabled={!onSetValue}
          title={onSetValue ? 'Click to set generator value' : gen.currentValue.toLocaleString()}
          className={`shrink-0 rounded px-1 py-0.5 text-right font-mono text-[11px] tabular-nums text-fg-muted transition-colors ${
            onSetValue ? 'cursor-text hover:bg-elevated hover:text-fg' : ''
          }`}
        >
          {gen.currentValue.toLocaleString()}
        </button>
      )}
    </div>
  );
}

function DomainNode({
  domain,
  filter,
  onSelect,
  onContextMenu,
}: {
  domain: DomainInfo;
  filter: string;
  onSelect?: ((identifier: string) => void) | undefined;
  onContextMenu?: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
}) {
  const hint = (
    <>
      {domain.sqlType}
      {!domain.nullable && <span className="ml-0.5 text-danger">*</span>}
    </>
  );
  return (
    <LeafNode
      name={domain.name}
      filter={filter}
      onSelect={onSelect}
      hint={hint}
      title={`${domain.name} ${domain.sqlType}${domain.nullable ? '' : ' NOT NULL'}`}
      onContextMenu={onContextMenu}
    />
  );
}

/** Decodes `RDB$TRIGGERS.RDB$TRIGGER_TYPE` into a short BEFORE/AFTER
 *  + INSERT/UPDATE/DELETE label. Uses the bit-layout documented in the
 *  Firebird internal docs; the bit-coded form (multi-event triggers)
 *  is decoded by reading bits 1–6. Database-level triggers
 *  (DDL/CONNECT/DISCONNECT/TRANSACTION) fall back to the raw code. */
function decodeTriggerType(value: number): string {
  // Standard DML triggers: low byte encodes BEFORE/AFTER + action.
  const map: Record<number, string> = {
    1: 'BEFORE INSERT',
    2: 'AFTER INSERT',
    3: 'BEFORE UPDATE',
    4: 'AFTER UPDATE',
    5: 'BEFORE DELETE',
    6: 'AFTER DELETE',
    17: 'BEFORE INSERT or UPDATE',
    18: 'AFTER INSERT or UPDATE',
    25: 'BEFORE INSERT or DELETE',
    26: 'AFTER INSERT or DELETE',
    27: 'BEFORE UPDATE or DELETE',
    28: 'AFTER UPDATE or DELETE',
    113: 'BEFORE INSERT or UPDATE or DELETE',
    114: 'AFTER INSERT or UPDATE or DELETE',
  };
  if (map[value]) return map[value]!;
  // Database / DDL triggers carry larger codes; return a short tag.
  if (value >= 8192) return 'DDL';
  if (value >= 8189) return 'CONNECT/DISCONNECT';
  return `type ${value}`;
}
