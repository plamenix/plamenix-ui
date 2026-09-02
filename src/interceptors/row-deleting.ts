/**
 * `row.deleting` interceptor chain (I6.14, half 2) — runs BEFORE a
 * row-delete DELETE hits the driver. Same shape as `query.executing`
 * (I6.12) but scoped to the specific row-delete pathway (single-row,
 * bulk-selection, all-rows) so policies can target deletions
 * separately from arbitrary user-typed SQL.
 *
 * Typical use: tombstone-only policies ("DELETE not allowed; use
 * soft-delete via UPDATE"), retention guards ("rows in audit_log are
 * immutable"), bulk-delete throttling ("block DELETE batches larger
 * than 10k rows in production").
 *
 * The shell wraps each row-delete path in `ResultTable`:
 *
 *     const decision = await rowDeletingChain.run(ctx);
 *     if (decision.action === 'cancel') {
 *       // surface decision.reason; revert the selection state;
 *       // do not call host.execute
 *       return;
 *     }
 *     await host.execute(ctx.sql);
 *
 * Veto-only; no modification. The destructive-DROP confirmation
 * built-in (I6.12) does NOT cover bulk-delete because the
 * unconstrained-DELETE detection in `isDestructiveSql` matches
 * `DELETE FROM t` (no WHERE) — bulk + all-rows DELETEs from the
 * result-table UI always carry a WHERE built from selected PKs, so
 * they bypass the I6.12 prompt. `row.deleting` is the right surface
 * for "I want to confirm every bulk delete from the result table"
 * policies.
 */

import { InterceptorChain } from './chain.js';

/** Context passed to every `row.deleting` handler. Frozen at call
 *  time — handlers MAY NOT mutate fields. */
export interface RowDeletingContext {
  tabId: string;
  sessionId: string;
  /** Table the DELETE will run against. */
  table: string;
  /** Number of rows the DELETE targets. `null` for the all-rows path
   *  (where the count isn't known until the DELETE returns).
   *  Policies that want to gate on size cross-check against
   *  `predicate`: a `null` predicate plus `null` rowCount means
   *  "delete everything in the table". */
  rowCount: number | null;
  /** The WHERE clause text the DELETE will carry, or `null` for the
   *  all-rows path. Policies that need to inspect filters parse
   *  this; subscribers wanting "the literal SQL" read `sql`. */
  predicate: string | null;
  /** Full `DELETE FROM … [WHERE …]` SQL. */
  sql: string;
}

/** Singleton chain instance. Plugins call `rowDeletingChain.use(...)`
 *  to register their handlers; the shell calls `.run(ctx)` from
 *  every row-delete site in `ResultTable.tsx` before the DELETE
 *  executes. */
export const rowDeletingChain = new InterceptorChain<RowDeletingContext>();
