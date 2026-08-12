import { useEffect } from 'react';
import { Github } from 'lucide-react';
import { ToolbarSlot } from '../toolbar/ToolbarSlot';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pluginContributionsToStatusBarItems,
  statusBarItemsByAlignment,
  type StatusBarContext,
  type StatusBarItemContributionPayload,
} from '../status-bar/status-bar-item-contract';
import type { StatementOutcome } from './types';

/** Per-button ctx the `status` toolbar slot hands plugins. */
interface StatusToolbarCtx {
  sessionId: string | null;
}

/** Brand attribution rendered at the right edge. Defaulted in
 *  {@link StatusBar} but overridable so a fork or downstream consumer
 *  can swap the credit. */
export interface StatusBarAttribution {
  year: number;
  name: string;
  brand: string;
  href: string;
}

export interface StatusBarProps {
  /** `null` while disconnected — the bar still renders but only shows
   *  the brand attribution + a muted dot. */
  sessionId: string | null;
  health: 'unknown' | 'healthy' | 'reconnecting' | 'dead';
  user: string;
  host: string;
  port: number;
  database: string;
  /** SQL of the most recent execute. Used to surface a "table"
   *  hint when the statement starts with a single `FROM <table>`. */
  executedSql: string | null;
  /** Most recent multi-statement outcome batch. The bar reads the
   *  last statement's row / affected count when present. */
  results: StatementOutcome[] | null;
  /** Recent-queries bucket key, same value the welcome dashboard uses.
   *  The bar pulls the most recent entry's `durationMs` from it. */
  recentKey: string;
  /** Override the default brand credit. Pass `null` to hide it. */
  attribution?: StatusBarAttribution | null | undefined;
}

const DEFAULT_ATTRIBUTION: StatusBarAttribution = {
  year: new Date().getFullYear(),
  name: 'Zlatan Omerović',
  brand: 'Ascent Systèmes',
  href: 'https://github.com/ZlatanOmerovic',
};

/**
 * Bottom strip rendered beneath the session view. Surfaces live
 * connection health, a masked connection string with a copy button,
 * the table the last result came from (best-effort parse of
 * `executedSql`), row count, last-query duration, and a brand link.
 *
 * Layout is always-on: when `sessionId` is null only the brand side
 * renders, so the bar's height does not jump between connect / session
 * states.
 */
export function StatusBar({
  sessionId,
  health,
  user,
  host,
  port,
  database,
  executedSql,
  results,
  recentKey,
  attribution,
}: StatusBarProps) {
  // I5.11 — register the five built-in left-side items (health dot,
  // DSN+copy, last-FROM table, row count, last duration) through the
  // `status_bar_items` registry. Each item's Component owns its own
  // subscriptions (recent-queries hook for last duration, copy-state
  // for the DSN button, etc.). Single mount per StatusBar instance.
  const itemContributions =
    usePluginContributions<StatusBarItemContributionPayload>('status_bar_items');
  const descriptors = pluginContributionsToStatusBarItems(itemContributions);
  const leftItems = statusBarItemsByAlignment(descriptors, 'left');
  const rightItems = statusBarItemsByAlignment(descriptors, 'right');

  const ctx: StatusBarContext = {
    sessionId,
    health,
    user,
    host,
    port,
    database,
    executedSql,
    results,
    recentKey,
  };
  const credit = attribution === undefined ? DEFAULT_ATTRIBUTION : attribution;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-edge bg-canvas px-3 text-[11px] text-fg-subtle">
      {leftItems.map((d) => (
        <d.Component key={d.id} ctx={ctx} />
      ))}

      <span className="flex-1" />

      {/* I5.11 — plugin-contributed right-side status-bar items (rich
          Components) sit between the spacer and the I5.3 button slot.
          Empty by default — built-in only registers left-side items. */}
      {rightItems.map((d) => (
        <d.Component key={d.id} ctx={ctx} />
      ))}

      {/* I5.3 — plugin-contributed status-bar buttons (simple
          label+icon+click). Distinct from I5.11 status_bar_items
          which carries arbitrary Components. */}
      <ToolbarSlot<StatusToolbarCtx> location="status" ctx={{ sessionId }} />

      {credit !== null && (
        <a
          href={credit.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-elevated hover:text-fg"
          title={`Visit ${credit.name} on GitHub`}
        >
          <Github className="h-3 w-3" />
          <span>
            © {credit.year} {credit.name} · {credit.brand}
          </span>
        </a>
      )}
    </footer>
  );
}

export function Separator() {
  return <span className="text-fg-subtle" aria-hidden="true">·</span>;
}

export function healthColorClass(
  sessionId: string | null,
  health: StatusBarProps['health'],
): string {
  if (sessionId === null) return 'text-fg-subtle';
  switch (health) {
    case 'healthy':
      return 'text-success';
    case 'reconnecting':
      return 'text-warning';
    case 'dead':
      return 'text-danger';
    case 'unknown':
    default:
      return 'text-fg-subtle';
  }
}

export function stemOf(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return '';
  const tail = trimmed.split(/[\\/]/).pop();
  return tail && tail.length > 0 ? tail : trimmed;
}

/** Best-effort table extractor. Strips line + block comments, then
 *  matches the first identifier after `FROM`. Quoted identifiers keep
 *  their inner text; bare identifiers are returned verbatim. Returns
 *  `null` when no FROM clause is present. */
export function tableFromSql(sql: string | null): string | null {
  if (!sql) return null;
  const cleaned = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /\bfrom\s+(?:"([^"]+)"|([A-Za-z_$][\w$]*))/i.exec(cleaned);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

export function rowCountFromResults(results: StatementOutcome[] | null): number | null {
  if (!results || results.length === 0) return null;
  const last = results[results.length - 1];
  if (!last || last.status !== 'ok') return null;
  if ('Rows' in last.result) return last.result.Rows.rows.length;
  if ('Affected' in last.result) return last.result.Affected.rows;
  return null;
}
