import {
  BarChart3,
  CircleAlert,
  Database,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { CryptBadge } from './CryptBadge';
import { SqlEditor, type BookmarkMap } from './SqlEditor';
import type { CryptState, Schema } from './types';

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
}: QueryPanelProps) {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-edge bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-edge bg-canvas px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="truncate font-mono text-[10px] text-fg-subtle"
            title={`Session ${sessionId}`}
          >
            session{' '}
            <span className="text-fg-muted">{sessionId.slice(0, 8)}</span>
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
            <span className="px-1 font-mono">unencrypted</span>. The current
            driver cannot forward keys to fbclient; install a KeyHolder
            plugin (e.g. IBSurgeon EPF) in the fbclient plugin path if you
            expect this database to be encrypted at rest.
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
      />
    </section>
  );
}
