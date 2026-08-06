/**
 * Built-in status-bar items (I5.11) — extracts the five legacy
 * left-aligned items from `StatusBar.tsx` (connection-health dot,
 * masked DSN + copy button, last-FROM table hint, row count, last
 * query duration) into `status_bar_items` contributions registered
 * under `@plamenix-builtin/status-bar-default-items`.
 *
 * Each Component reads from the shell-supplied `StatusBarContext` and
 * returns `null` when its data isn't applicable (no session, no last
 * SQL, no result rows, etc.) — the StatusBar consumer just renders
 * the descriptor list; null returns drop out naturally.
 *
 * Priority spacing 200/210/220/230/240 preserves the legacy left-to-
 * right order. Registry default 100 → third-party status-bar items
 * (Server timezone / Slow query badge / Replica lag / etc.) sort
 * ahead of the built-ins by default — community-extends-shell
 * convention.
 */

import { useState } from 'react';
import { Check, Circle, Clipboard, Database, Hash, Timer } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import {
  Separator,
  healthColorClass,
  rowCountFromResults,
  stemOf,
  tableFromSql,
} from '../../db/StatusBar.js';
import { selectRecent, useRecentQueries } from '../../db/recent-queries.js';
import type {
  StatusBarContext,
  StatusBarItemContributionPayload,
} from '../status-bar-item-contract.js';

const BUILTIN_NAME = 'status-bar-default-items';

/** Health dot — leftmost item, always renders (greyed when no session). */
function BuiltinHealthDot({ ctx }: { ctx: StatusBarContext }) {
  const sessionId = ctx.sessionId ?? null;
  const health = ctx.health ?? 'unknown';
  return (
    <span
      title={`Connection: ${sessionId ? health : 'disconnected'}`}
      className="inline-flex items-center"
    >
      <Circle
        className={`h-2 w-2 fill-current ${healthColorClass(sessionId, health)}`}
        strokeWidth={0}
      />
    </span>
  );
}

/** Masked DSN + copy button. Only renders when a session is open. */
function BuiltinDsnAndCopy({ ctx }: { ctx: StatusBarContext }) {
  const [copied, setCopied] = useState(false);
  if (!ctx.sessionId) return null;
  const display = `${ctx.user || '—'}@${ctx.host || '—'}:${ctx.port ?? '—'}/${stemOf(ctx.database ?? '')}`;
  const dsn = `firebird://${ctx.user ?? ''}@${ctx.host ?? ''}:${ctx.port ?? ''}/${ctx.database ?? ''}`;
  const handleCopy = () => {
    void navigator.clipboard.writeText(dsn).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <>
      <span className="font-mono text-fg" title={dsn}>
        {display}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy connection string'}
        aria-label="Copy connection string"
        className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Clipboard className="h-3 w-3" />
        )}
      </button>
    </>
  );
}

/** Last-FROM table hint. Parses the executed SQL for a leading
 *  `FROM <table>` clause. Renders `<Separator> + <Database> + name`
 *  to preserve the legacy markup's `·` divider before the chip. */
function BuiltinTableFromSql({ ctx }: { ctx: StatusBarContext }) {
  if (!ctx.sessionId) return null;
  const table = tableFromSql(ctx.executedSql ?? null);
  if (table === null) return null;
  return (
    <>
      <Separator />
      <span className="inline-flex items-center gap-1">
        <Database className="h-3 w-3" />
        <span className="font-mono text-fg" title={`Last FROM: ${table}`}>
          {table}
        </span>
      </span>
    </>
  );
}

/** Row count from most recent results batch. */
function BuiltinRowCount({ ctx }: { ctx: StatusBarContext }) {
  if (!ctx.sessionId) return null;
  const rowCount = rowCountFromResults(ctx.results ?? null);
  if (rowCount === null) return null;
  return (
    <>
      <Separator />
      <span className="inline-flex items-center gap-1">
        <Hash className="h-3 w-3" />
        <span className="font-mono text-fg">
          {rowCount.toLocaleString()} {rowCount === 1 ? 'row' : 'rows'}
        </span>
      </span>
    </>
  );
}

/** Last query duration from the recent-queries bucket. */
function BuiltinLastDuration({ ctx }: { ctx: StatusBarContext }) {
  const recentKey = ctx.recentKey ?? '';
  const lastDuration = useRecentQueries(
    (s) => selectRecent(s, recentKey)[0]?.durationMs ?? null,
  );
  if (!ctx.sessionId) return null;
  if (lastDuration === null) return null;
  return (
    <>
      <Separator />
      <span className="inline-flex items-center gap-1">
        <Timer className="h-3 w-3" />
        <span className="font-mono text-fg">
          {lastDuration.toLocaleString()} ms
        </span>
      </span>
    </>
  );
}

const ITEMS: {
  id: string;
  priority: number;
  payload: StatusBarItemContributionPayload;
}[] = [
  {
    id: 'health-dot',
    priority: 200,
    payload: { alignment: 'left', Component: BuiltinHealthDot },
  },
  {
    id: 'dsn-and-copy',
    priority: 210,
    payload: { alignment: 'left', Component: BuiltinDsnAndCopy },
  },
  {
    id: 'table-from-sql',
    priority: 220,
    payload: { alignment: 'left', Component: BuiltinTableFromSql },
  },
  {
    id: 'row-count',
    priority: 230,
    payload: { alignment: 'left', Component: BuiltinRowCount },
  },
  {
    id: 'last-duration',
    priority: 240,
    payload: { alignment: 'left', Component: BuiltinLastDuration },
  },
];

/**
 * Registers the five built-in left-side status-bar items. Returns a
 * teardown closure for `useEffect` pairing.
 */
export function registerBuiltinDefaultStatusBarItems(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    status_bar_items: ITEMS,
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinDefaultStatusBarItems(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
