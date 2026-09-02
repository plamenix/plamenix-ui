/**
 * `export.starting` interceptor chain (I6.16) — runs BEFORE an
 * export job begins. Handlers can veto the export (typical use: PII
 * gates that block exporting customer / employee tables; format
 * gates that ban unencrypted formats in regulated environments;
 * scope gates that block full-database exports outside business
 * hours).
 *
 * The shell wraps the export entry point (both the streamed result
 * export and the full-database export):
 *
 *     const decision = await exportStartingChain.run(ctx);
 *     if (decision.action === 'cancel') {
 *       // surface decision.reason; keep the export modal open;
 *       // do not invoke the runner
 *       return;
 *     }
 *     // proceed: emitExportStarted({...}) + run the export
 *
 * The interceptor runs BEFORE `emitExportStarted` (I6.9). A vetoed
 * export does NOT fire the `export/started` event — observers only
 * see exports the policy chain admitted.
 *
 * Veto-only; no modification. Same rationale as I6.12-I6.15.
 *
 * No built-in interceptors today. Universal defaults like
 * "warn before exporting PII columns" need a PII-detection plumbing
 * layer the codebase doesn't ship yet.
 */

import { InterceptorChain } from './chain.js';
import type { ExportScopeKind } from '../events/export-events.js';

/** Context passed to every `export.starting` handler. Frozen at
 *  call time — handlers MAY NOT mutate fields. */
export interface ExportStartingContext {
  tabId: string | null;
  sessionId: string;
  /** File format the export would produce — `csv` / `json` / `sql` /
   *  `xml` for streamed, host-defined for database (typically `sql`). */
  format: string;
  /** Scope kind discriminating the pathway. Reuses the I6.9 union so
   *  policy code that subscribes to `export/started` events can use
   *  the same type narrowing. */
  scopeKind: ExportScopeKind;
  /** Human label describing the scope — table name for single-table,
   *  comma-joined names for `tables`, `'database'` for full. Useful
   *  for surface-area policies ("block exports labelled CUSTOMERS"). */
  scopeLabel: string;
  /** When `scopeKind === 'tables'` or `'statement'` with a known
   *  table, lists the underlying base tables the export touches.
   *  Useful for PII / classification policies that gate per-table.
   *  Empty array for `scopeKind === 'statement'` with a freeform
   *  SQL that doesn't surface a base table. Always empty for
   *  `scopeKind === 'database'` (every table is included — gate via
   *  `scopeKind` instead). */
  tables: ReadonlyArray<string>;
}

/** Singleton chain instance. Plugins call `exportStartingChain.use(...)`
 *  to register their handlers; the shell calls `.run(ctx)` from
 *  every export entry point before the runner kicks off. */
export const exportStartingChain = new InterceptorChain<ExportStartingContext>();
