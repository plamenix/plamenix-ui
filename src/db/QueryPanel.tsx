import type { ReactNode } from 'react';
import {
  BarChart3,
  CircleAlert,
  Database,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CryptBadge } from './CryptBadge';
import { SqlEditor, type BookmarkMap } from './SqlEditor';
import { ToolbarSlot } from '../toolbar/ToolbarSlot';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pickSqlFormatter,
  type SqlFormatterContributionPayload,
} from '../formatters/sql-formatter-contract';
import type { CryptState, Schema } from './types';

/** Per-button shape the `tab` toolbar slot hands plugins. */
interface TabToolbarCtx {
  sessionId: string | null;
  busy: boolean;
}

/** Health states the QueryPanel can render. Mirrors `TabState['health']`. */
export type SessionHealth = 'unknown' | 'healthy' | 'reconnecting' | 'dead';

/** Small pill that surfaces the Firebird engine version reported by
 *  `rdb$get_context('SYSTEM', 'ENGINE_VERSION')`. Shows nothing while
 *  the value is unknown so we don't flash a placeholder during the
 *  half-second between attach and first ping. */
function EngineBadge({ version }: { version: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-edge bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
      title={`Firebird engine ${version}`}
    >
      <Database className="h-3 w-3" />
      FB {version}
    </span>
  );
}

/** Small status pill that mirrors the tab-strip status dot. */
function HealthBadge({ health }: { health: SessionHealth }) {
  if (health === 'healthy') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-success-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success ring-1 ring-success/20"
        title="Last health check succeeded"
      >
        <ShieldCheck className="h-3 w-3" />
        Healthy
      </span>
    );
  }
  if (health === 'reconnecting') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-warning-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning ring-1 ring-warning/20"
        title="Reconnecting to the server"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Reconnecting
      </span>
    );
  }
  if (health === 'dead') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-danger-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger ring-1 ring-danger/20"
        title="Last health check failed — attachment may be gone"
      >
        <CircleAlert className="h-3 w-3" />
        Lost
      </span>
    );
  }
  return null;
}

export interface QueryPanelProps {
  /** Active session identifier (UUID string). */
  sessionId: string;
  /** Current SQL text. Controlled component. */
  sql: string;
  /** Disables controls while a request is in flight. */
  busy: boolean;
  /** Encryption state of the attached database, or `null` while it is
   *  being fetched. Pass `undefined` to suppress the badge entirely. */
  cryptState?: CryptState | null;
  /** Schema feed for SQL editor identifier completion. */
  schema?: Schema | null;
  /** Transaction controls for this session, rendered at the left of the
   *  action cluster. A slot rather than a prop bundle: the host owns the
   *  session and performs the commit, so it supplies a configured
   *  `TransactionBar`. Omit to hide transaction controls entirely. */
  transactionBar?: ReactNode;
  /** Persisted bookmark slots for this tab (passed straight through to
   *  the SQL editor). */
  bookmarks?: BookmarkMap | undefined;
  onSqlChange: (value: string) => void;
  onExecute: () => void;
  onClose: () => void;
  onBookmarksChange?: ((next: BookmarkMap) => void) | undefined;
  /** Opens the {@link StatsDashboard}. When omitted, the dashboard
   *  button is hidden — used by hosts that have not wired the
   *  `db_database_stats` command yet. */
  onOpenStats?: () => void;
  /** Liveness state of the underlying attachment. `'healthy'` renders
   *  a subtle pill, `'reconnecting'` shows a pulsing badge, `'dead'`
   *  surfaces the {@link onReconnect} CTA. */
  health?: SessionHealth;
  /** Firebird engine version (e.g. `'5.0.1'`). Rendered as a small
   *  pill next to the crypt/health badges. Pass `null` or omit to hide
   *  the badge (e.g. during the brief gap between attach and the first
   *  ping). */
  engineVersion?: string | null | undefined;
  /** `true` when the active session was opened with an
   *  `encryption_key` supplied. Used to flag the mismatch between a
   *  user-supplied key and an unencrypted attach — currently a no-op
   *  on the driver side because rsfbclient lacks
   *  `fb_database_crypt_callback`. */
  encryptionKeySupplied?: boolean;
  /** Triggers a manual reconnect attempt. The Reconnect button is
   *  rendered when `health === 'dead'` and this handler is supplied. */
  onReconnect?: () => void;
  /** Forwarded to the inner {@link SqlEditor}. Shell uses this to emit
   *  `editor/focused` events (I6.11). */
  onEditorFocus?: (() => void) | undefined;
  /** Forwarded to the inner {@link SqlEditor}. Shell uses this to emit
   *  `editor/selection-changed` events (I6.11). */
  onEditorSelectionChange?: ((sel: { anchor: number; head: number }) => void) | undefined;
  /** Aggregated stats from the most recent execute — used to render a
   *  small footer below the SQL editor with total duration + row count
   *  across every emitted result. `null` when no query has been run on
   *  this tab yet. */
  lastResultSummary?: {
    totalDurationMs: number;
    totalRows: number;
    statementCount: number;
  } | null;
}

/**
 * SQL editor and execute/disconnect buttons. Used inside the main shell
 * once a session is open. The CodeMirror 6 editor lives in
 * {@link SqlEditor}; this panel only owns the surrounding chrome.
 */
export function QueryPanel({
  sessionId,
  sql,
  busy,
  cryptState,
  schema = null,
  transactionBar,
  bookmarks,
  onSqlChange,
  onExecute,
  onClose,
  onBookmarksChange,
  onOpenStats,
  health = 'unknown',
  engineVersion = null,
  encryptionKeySupplied = false,
  onReconnect,
  onEditorFocus,
  onEditorSelectionChange,
  lastResultSummary = null,
}: QueryPanelProps) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  // I5.6 — read the active SQL-formatter contributions (basic
  // built-in registered by DdlViewerModal mount; third-party
  // formatters install through the registry). The Format button only
  // surfaces when at least one applicable formatter is registered.
  const formatterContributions =
    usePluginContributions<SqlFormatterContributionPayload>('sql_formatters');
  const formatter = pickSqlFormatter(formatterContributions, 'firebird');
  const handleFormatBuffer = () => {
    if (!formatter || sql.length === 0) return;
    const next = formatter.format(sql);
    if (next !== sql) onSqlChange(next);
  };

  return (
    <section className="flex flex-col overflow-hidden rounded-lg bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-edge bg-canvas px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="truncate font-mono text-[10px] text-fg-subtle"
            title={`Session ${sessionId}`}
          >
            session <span className="text-fg-muted">{sessionId.slice(0, 8)}</span>
          </span>
          {cryptState !== undefined && (
            <>
              <span aria-hidden className="h-3 w-px bg-edge" />
              <CryptBadge state={cryptState} />
            </>
          )}
          {health !== 'unknown' && (
            <>
              <span aria-hidden className="h-3 w-px bg-edge" />
              <HealthBadge health={health} />
            </>
          )}
          {engineVersion && (
            <>
              <span aria-hidden className="h-3 w-px bg-edge" />
              <EngineBadge version={engineVersion} />
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {transactionBar}
          {/* I5.3 — plugin-contributed tab-toolbar buttons sit ahead
              of the shell-owned action cluster. Each button receives
              the live {sessionId, busy} ctx through its `when` + `run`
              callbacks. */}
          <ToolbarSlot<TabToolbarCtx> location="tab" ctx={{ sessionId, busy }} />
          {/* I5.6 — Format buffer button. Surfaces when at least one
              `sql_formatters` contribution applies to the Firebird
              dialect (the basic built-in always does once
              DdlViewerModal mounts). Runs in-place via the existing
              onSqlChange pipe; no shell state changes beyond the
              editor buffer. */}
          {formatter && (
            <button
              type="button"
              onClick={handleFormatBuffer}
              disabled={busy || sql.length === 0}
              title={`Format buffer via ${formatter.label}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Format
            </button>
          )}
          {health === 'dead' && onReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              title="Reconnect this session"
              className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning-subtle px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning hover:text-fg-inverted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconnect
            </button>
          )}
          {onOpenStats && (
            <button
              type="button"
              onClick={onOpenStats}
              title="Database statistics"
              className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Stats
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title="Disconnect this session"
            className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
          <button
            type="button"
            onClick={onExecute}
            disabled={busy}
            title={`Execute (${mod}+Return)`}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Executing
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Execute
                <kbd className="ml-1 rounded border border-fg-inverted/20 bg-fg-inverted/10 px-1 py-px text-[9px] font-mono leading-none">
                  {mod}↵
                </kbd>
              </>
            )}
          </button>
        </div>
      </header>

      {encryptionKeySupplied && cryptState === 'unencrypted' && (
        <div className="flex items-start gap-2 border-b border-edge bg-warning-subtle px-3 py-2 text-[11px] text-warning">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Encryption key supplied but the database attached as
            <span className="px-1 font-mono">unencrypted</span>. The current driver cannot forward
            keys to fbclient; install a KeyHolder plugin (e.g. IBSurgeon EPF) in the fbclient plugin
            path if you expect this database to be encrypted at rest.
          </span>
        </div>
      )}

      <SqlEditor
        value={sql}
        onChange={onSqlChange}
        busy={busy}
        onSubmit={onExecute}
        schema={schema}
        bookmarks={bookmarks}
        onBookmarksChange={onBookmarksChange}
        onFocus={onEditorFocus}
        onSelectionChange={onEditorSelectionChange}
      />
      {lastResultSummary && (
        <footer
          className="flex items-center gap-3 border-t border-edge bg-elevated px-3 py-1 font-mono text-[10px] text-fg-subtle"
          aria-label="Last query stats"
        >
          <span>{lastResultSummary.totalDurationMs.toLocaleString()} ms</span>
          <span aria-hidden className="h-3 w-px bg-edge" />
          <span>
            {lastResultSummary.totalRows.toLocaleString()} row
            {lastResultSummary.totalRows === 1 ? '' : 's'}
          </span>
          {lastResultSummary.statementCount > 1 && (
            <>
              <span aria-hidden className="h-3 w-px bg-edge" />
              <span>{lastResultSummary.statementCount} statements</span>
            </>
          )}
        </footer>
      )}
    </section>
  );
}
