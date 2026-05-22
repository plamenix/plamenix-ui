import { useState } from 'react';
import {
  Check,
  Circle,
  Clipboard,
  Database,
  Github,
  Hash,
  Timer,
} from 'lucide-react';
import { selectRecent, useRecentQueries } from './recent-queries';
import type { StatementOutcome } from './types';

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
  const [copied, setCopied] = useState(false);
  const lastDuration = useRecentQueries(
    (s) => selectRecent(s, recentKey)[0]?.durationMs ?? null,
  );

  const stem = stemOf(database);
  const display = `${user || '—'}@${host || '—'}:${port}/${stem}`;
  const dsn = `firebird://${user}@${host}:${port}/${database}`;
  const table = tableFromSql(executedSql);
  const rowCount = rowCountFromResults(results);
  const credit = attribution === undefined ? DEFAULT_ATTRIBUTION : attribution;

  const handleCopy = () => {
    void navigator.clipboard.writeText(dsn).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-edge bg-canvas px-3 text-[11px] text-fg-subtle">
      <span
        title={`Connection: ${sessionId ? health : 'disconnected'}`}
        className="inline-flex items-center"
      >
        <Circle
          className={`h-2 w-2 fill-current ${healthColorClass(sessionId, health)}`}
          strokeWidth={0}
        />
      </span>

      {sessionId !== null && (
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

          {table !== null && (
            <>
              <Separator />
              <span className="inline-flex items-center gap-1">
                <Database className="h-3 w-3" />
                <span className="font-mono text-fg" title={`Last FROM: ${table}`}>
                  {table}
                </span>
              </span>
            </>
          )}

          {rowCount !== null && (
            <>
              <Separator />
              <span className="inline-flex items-center gap-1">
                <Hash className="h-3 w-3" />
                <span className="font-mono text-fg">
                  {rowCount.toLocaleString()}{' '}
                  {rowCount === 1 ? 'row' : 'rows'}
                </span>
              </span>
            </>
          )}

          {lastDuration !== null && (
            <>
              <Separator />
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" />
                <span className="font-mono text-fg">
                  {lastDuration.toLocaleString()} ms
                </span>
              </span>
            </>
          )}
        </>
      )}

      <span className="flex-1" />

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

function Separator() {
  return <span className="text-fg-subtle" aria-hidden="true">·</span>;
}

function healthColorClass(
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

function stemOf(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return '';
  const tail = trimmed.split(/[\\/]/).pop();
  return tail && tail.length > 0 ? tail : trimmed;
}

/** Best-effort table extractor. Strips line + block comments, then
 *  matches the first identifier after `FROM`. Quoted identifiers keep
 *  their inner text; bare identifiers are returned verbatim. Returns
 *  `null` when no FROM clause is present. */
function tableFromSql(sql: string | null): string | null {
  if (!sql) return null;
  const cleaned = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /\bfrom\s+(?:"([^"]+)"|([A-Za-z_$][\w$]*))/i.exec(cleaned);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

function rowCountFromResults(results: StatementOutcome[] | null): number | null {
  if (!results || results.length === 0) return null;
  const last = results[results.length - 1];
  if (!last || last.status !== 'ok') return null;
  if ('Rows' in last.result) return last.result.Rows.rows.length;
  if ('Affected' in last.result) return last.result.Affected.rows;
  return null;
}
