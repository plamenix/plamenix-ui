import { useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  Loader2,
  RefreshCw,
  TerminalSquare,
  Users,
  X,
} from 'lucide-react';
import type {
  AttachmentInfo,
  DatabaseStats,
  MonDatabase,
  StatementInfo,
} from './types';

export interface StatsDashboardProps {
  /** Whether the modal is visible. Host owns this so the editor and
   *  the stats panel can coexist without remounting the editor. */
  open: boolean;
  /** Most recent snapshot, or `null` while loading the first one. */
  stats: DatabaseStats | null;
  /** `true` while a refresh is in flight. */
  loading?: boolean;
  /** Last error emitted by `onRefresh`. Cleared on the next success. */
  error?: string | null;
  /** Wall-clock label for the most recent successful refresh; e.g.
   *  `"2 s ago"`. Host computes the string. */
  lastRefreshLabel?: string | null;
  /** Closes the panel. The host typically resets `error` here too. */
  onClose: () => void;
  /** Pulls a fresh `DatabaseStats` snapshot. */
  onRefresh: () => void;
}

/**
 * Database-level statistics overlay.
 *
 * Three stacked sections fed by `MON$DATABASE`, `MON$ATTACHMENTS`, and
 * `MON$STATEMENTS`. The panel never executes SQL itself; the host
 * fetches a fresh [`DatabaseStats`] and feeds it back.
 */
export function StatsDashboard({
  open,
  stats,
  loading = false,
  error,
  lastRefreshLabel,
  onClose,
  onRefresh,
}: StatsDashboardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Database statistics"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="mt-[8vh] flex max-h-[84vh] w-[min(72rem,94vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <BarChart3 className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[13px] font-semibold text-fg">Database statistics</h2>
          {lastRefreshLabel && (
            <span className="font-mono text-[10px] text-fg-subtle" title="Last refresh">
              · {lastRefreshLabel}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : !stats && loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-subtle">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading stats…
            </div>
          ) : !stats ? (
            <p className="py-16 text-center text-sm text-fg-subtle">
              Press Refresh to load the current snapshot.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <DatabaseSection database={stats.database} />
              <AttachmentsSection rows={stats.attachments} />
              <StatementsSection rows={stats.statements} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DatabaseSection({ database }: { database: MonDatabase }) {
  const dialect = `Dialect ${database.sqlDialect}`;
  const ods = `ODS ${database.odsMajor}.${database.odsMinor}`;
  const fields = useMemo<Array<[string, string]>>(
    () => [
      ['Path', database.name || '—'],
      ['Owner', database.owner || '—'],
      ['Server', database.serverVersion || '—'],
      ['ODS', ods],
      ['Dialect', dialect],
      ['Page size', database.pageSize.toLocaleString()],
      ['Pages', database.pages.toLocaleString()],
      [
        'Size',
        `${((database.pages * database.pageSize) / (1024 * 1024)).toFixed(1)} MiB`,
      ],
      ['Sweep interval', database.sweepInterval.toLocaleString()],
      ['Forced writes', database.forcedWrites ? 'yes' : 'no'],
      ['Read only', database.readOnly ? 'yes' : 'no'],
      ['Backup state', backupStateLabel(database.backupState)],
      ['Shutdown mode', shutdownLabel(database.shutdownMode)],
      ['Created', database.creationDate || '—'],
    ],
    [database, dialect, ods],
  );
  const txnFields: Array<[string, string]> = [
    ['OIT', database.oldestTransaction.toLocaleString()],
    ['OAT', database.oldestActive.toLocaleString()],
    ['OST', database.oldestSnapshot.toLocaleString()],
    ['Next', database.nextTransaction.toLocaleString()],
  ];
  const gap = database.nextTransaction - database.oldestActive;
  const ioFields: Array<[string, string]> = [
    ['Reads', database.reads.toLocaleString()],
    ['Writes', database.writes.toLocaleString()],
    ['Fetches', database.fetches.toLocaleString()],
    ['Marks', database.marks.toLocaleString()],
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-edge bg-canvas">
      <header className="flex items-center gap-2 border-b border-edge bg-elevated px-3 py-2">
        <Database className="h-3.5 w-3.5 text-fg-subtle" />
        <h3 className="text-[12px] font-semibold text-fg">Database</h3>
      </header>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 p-3 md:grid-cols-3">
        {fields.map(([k, v]) => (
          <KeyValue key={k} k={k} v={v} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-edge-subtle bg-panel px-3 py-2 md:grid-cols-4">
        {txnFields.map(([k, v]) => (
          <KeyValue key={k} k={k} v={v} />
        ))}
        <KeyValue k="OAT→Next gap" v={gap.toLocaleString()} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-edge-subtle bg-panel px-3 py-2 md:grid-cols-4">
        {ioFields.map(([k, v]) => (
          <KeyValue key={k} k={k} v={v} />
        ))}
      </div>
    </section>
  );
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-fg-subtle">{k}</span>
      <span className="truncate font-mono text-fg" title={v}>
        {v}
      </span>
    </div>
  );
}

function AttachmentsSection({ rows }: { rows: AttachmentInfo[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-edge bg-canvas">
      <header className="flex items-center gap-2 border-b border-edge bg-elevated px-3 py-2">
        <Users className="h-3.5 w-3.5 text-fg-subtle" />
        <h3 className="text-[12px] font-semibold text-fg">Attachments</h3>
        <span className="font-mono text-[10px] text-fg-subtle">· {rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-fg-subtle">No live attachments.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-panel text-left text-[10px] uppercase tracking-wide text-fg-muted">
              <tr>
                <Th>Id</Th>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Address</Th>
                <Th>Process</Th>
                <Th>Charset</Th>
                <Th>State</Th>
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-edge-subtle hover:bg-[var(--color-row-hover)]"
                >
                  <Td className="font-mono text-fg-muted">
                    {row.id}
                    {row.isSelf && (
                      <span
                        className="ml-1 rounded bg-accent-subtle px-1 py-px text-[9px] font-medium uppercase tracking-wide text-accent"
                        title="This attachment"
                      >
                        self
                      </span>
                    )}
                  </Td>
                  <Td>{row.user || '—'}</Td>
                  <Td>{row.role || '—'}</Td>
                  <Td className="font-mono">{row.remoteAddress || '—'}</Td>
                  <Td>{row.remoteProcess || '—'}</Td>
                  <Td>{row.characterSet || '—'}</Td>
                  <Td>
                    <StateChip state={row.state} />
                  </Td>
                  <Td className="font-mono">{row.timestamp || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatementsSection({ rows }: { rows: StatementInfo[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-edge bg-canvas">
      <header className="flex items-center gap-2 border-b border-edge bg-elevated px-3 py-2">
        <TerminalSquare className="h-3.5 w-3.5 text-fg-subtle" />
        <h3 className="text-[12px] font-semibold text-fg">Statements</h3>
        <span className="font-mono text-[10px] text-fg-subtle">· {rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-fg-subtle">No live statements.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-panel text-left text-[10px] uppercase tracking-wide text-fg-muted">
              <tr>
                <Th>Id</Th>
                <Th>Attachment</Th>
                <Th>State</Th>
                <Th>Since</Th>
                <Th>SQL</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-edge-subtle align-top hover:bg-[var(--color-row-hover)]"
                >
                  <Td className="font-mono text-fg-muted">{row.id}</Td>
                  <Td className="font-mono text-fg-muted">{row.attachmentId}</Td>
                  <Td>
                    <StateChip state={row.state} />
                  </Td>
                  <Td className="font-mono">{row.timestamp || '—'}</Td>
                  <Td className="max-w-[40rem]">
                    <pre
                      className="whitespace-pre-wrap break-all font-mono text-[11px] text-fg"
                      title={row.sqlText}
                    >
                      {truncate(row.sqlText, 600)}
                    </pre>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-semibold">{children}</th>;
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-1.5 text-fg ${className}`}>{children}</td>;
}

function StateChip({ state }: { state: number }) {
  const { label, tone, Icon } = stateInfo(state);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function stateInfo(state: number): { label: string; tone: string; Icon: typeof Activity } {
  switch (state) {
    case 1:
      return {
        label: 'active',
        tone: 'bg-accent-subtle text-accent',
        Icon: Activity,
      };
    case 2:
      return {
        label: 'stalled',
        tone: 'bg-warning-subtle text-warning',
        Icon: Activity,
      };
    case 0:
    default:
      return {
        label: 'idle',
        tone: 'bg-elevated text-fg-subtle',
        Icon: Activity,
      };
  }
}

function backupStateLabel(state: number): string {
  switch (state) {
    case 1:
      return 'stalled';
    case 2:
      return 'merge';
    case 0:
    default:
      return 'normal';
  }
}

function shutdownLabel(mode: number): string {
  switch (mode) {
    case 1:
      return 'multi';
    case 2:
      return 'single';
    case 3:
      return 'full';
    case 0:
    default:
      return 'online';
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
