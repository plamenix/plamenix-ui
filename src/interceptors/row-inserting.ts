/**
 * `row.inserting` interceptor chain (I6.14, half 1) — runs BEFORE a
 * row-insert UPDATE hits the driver. Same shape as `cell.committing`
 * (I6.13) but the context covers the full row that's about to land,
 * not a single column.
 *
 * Typical use: required-field policies ("INSERT INTO orders must
 * include APPROVED_BY"), seed-data guards ("don't allow INSERTs into
 * REF_* tables in production"), audit-trail enforcement ("require a
 * comment column on every INSERT").
 *
 * The shell wraps `RowEditorModal`'s handleApply commit:
 *
 *     const decision = await rowInsertingChain.run(ctx);
 *     if (decision.action === 'cancel') {
 *       // surface decision.reason; keep the modal open + show the
 *       // reason as a banner; do not call host.execute
 *       return;
 *     }
 *     await host.execute(ctx.sql);
 *
 * Veto-only; no modification (same rationale as I6.12 / I6.13).
 */

import { InterceptorChain } from './chain.js';
import type { ColumnValue } from '../db/types.js';

/** One column-value pair from the row about to be inserted. */
export interface RowInsertColumnValue {
  column: string;
  value: ColumnValue | null;
}

/** Context passed to every `row.inserting` handler. Frozen at call
 *  time — handlers MAY NOT mutate fields. */
export interface RowInsertingContext {
  tabId: string;
  sessionId: string;
  /** Table the INSERT will run against. */
  table: string;
  /** Column-value pairs in declaration order — same order the
   *  `buildInsertSql` helper uses to assemble the literal list. The
   *  array carries every column the user supplied a value for;
   *  columns omitted from the INSERT (relying on database defaults)
   *  are absent. */
  values: ReadonlyArray<RowInsertColumnValue>;
  /** Full `INSERT INTO … (cols…) VALUES (literals…)` SQL. */
  sql: string;
}

/** Singleton chain instance. Plugins call `rowInsertingChain.use(...)`
 *  to register their handlers; the shell calls `.run(ctx)` from
 *  `RowEditorModal.handleApply` before the INSERT executes. */
export const rowInsertingChain = new InterceptorChain<RowInsertingContext>();
