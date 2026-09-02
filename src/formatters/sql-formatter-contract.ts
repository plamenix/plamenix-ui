/**
 * SQL-formatter contribution contract (I5.6).
 *
 * Plugins contribute SQL pretty-printers / re-formatters through the
 * `sql_formatters` extension point. The shell's "Format SQL" button
 * (DdlViewerModal + QueryPanel) consults the registry and runs the
 * highest-priority formatter whose `dialect` matches the active
 * context (Firebird dialect 3 by default).
 *
 * Built-in `@plamenix-builtin/sql-formatter-basic` ships a tiny
 * keyword-uppercase + whitespace-normaliser as the safety net; third-
 * party plugins replace it with Prettier-SQL, pgFormatter-style,
 * IBExpert-style, etc. by registering at lower priority (lower wins
 * per the registry's existing sort) or by declaring a more specific
 * `dialect` filter.
 *
 * Dialect string: free-form for now (`'firebird'`, `'firebird/3'`,
 * `'pl-sql'`, `'tsql'`, `'all'`, ...). Curation of that list will
 * eventually settle on a registry of recognised dialect ids; for M1
 * the built-in registers `dialect: 'firebird'` and the helper does
 * an equality match (with `'all'` matching everything).
 */

import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** SQL dialect a formatter targets. `'all'` is the universal
 *  fallback. Empty string forbidden — register `'all'` instead. */
export type SqlDialect = string;

export interface SqlFormatterContributionPayload {
  /** Display label (`'Prettier-SQL'`, `'pgFormatter'`, `'Basic
   *  (built-in)'`). Surfaces in the formatter-picker dropdown when the
   *  user has more than one applicable formatter registered. */
  label: string;
  /** Dialect this formatter targets. `'all'` matches every active
   *  dialect; otherwise matched exactly against the caller-supplied
   *  active dialect. */
  dialect: SqlDialect;
  /** Pure function — receives the raw SQL buffer, returns the
   *  formatted output. Must NOT throw on syntactically-invalid input;
   *  formatters that cannot parse should return the input unchanged
   *  (the shell's Format button surfaces a noop as success without
   *  rewriting the buffer to an empty string). */
  format: (sql: string) => string;
}

/** Resolved formatter ready for invocation. */
export interface SqlFormatterDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins registering the
   *  same local id never collide. */
  id: string;
  pluginId: string;
  label: string;
  dialect: SqlDialect;
  format: (sql: string) => string;
}

/**
 * Filters + sorts contributions for the active dialect.
 *
 *   1. Drop contributions whose `dialect` is neither `'all'` nor an
 *      exact match against `activeDialect`.
 *   2. Sort by registry priority (already applied by the registry
 *      snapshot — preserved here).
 *
 * Returns the full list so the consumer can decide between
 * "first-applicable wins" (the default Format button) or a
 * formatter-picker dropdown (future SettingsPanel surface).
 */
export function pluginContributionsToSqlFormatters(
  contributions: ReadonlyArray<PluginContribution<SqlFormatterContributionPayload>>,
  activeDialect: SqlDialect,
): SqlFormatterDescriptor[] {
  const out: SqlFormatterDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    const d = contribution.payload.dialect;
    if (d !== 'all' && d !== activeDialect) continue;
    out.push({
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: contribution.payload.label,
      dialect: d,
      format: contribution.payload.format,
    });
  }
  return out;
}

/** Convenience: picks the highest-priority formatter for a dialect.
 *  Returns `null` when no contribution applies. */
export function pickSqlFormatter(
  contributions: ReadonlyArray<PluginContribution<SqlFormatterContributionPayload>>,
  activeDialect: SqlDialect,
): SqlFormatterDescriptor | null {
  return pluginContributionsToSqlFormatters(contributions, activeDialect)[0] ?? null;
}
