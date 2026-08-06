/**
 * `cell.committing` interceptor chain (I6.13) — runs BEFORE a
 * single-cell inline-edit UPDATE hits the driver. Handlers can veto
 * the commit (typical use: policy gates that block edits to certain
 * columns, audit trails that require a justification comment,
 * row-level access controls in multi-tenant setups).
 *
 * The shell wraps the inline-edit commit:
 *
 *     const decision = await cellCommittingChain.run(ctx);
 *     if (decision.action === 'cancel') {
 *       // surface decision.reason; revert the cell to its previous
 *       // value; do not call host.execute
 *       return;
 *     }
 *     await host.execute(ctx.sql);
 *
 * No built-in interceptors today. The shape is identical to I6.12
 * `query.executing`; the separation lets policy authors target
 * inline cell edits without also catching every user-typed SQL run.
 *
 * Modification (rewriting the new value before it commits) is
 * intentionally out of scope — same rationale as the chain
 * primitive's veto-only design (I6.12). Plugins that need to
 * transform the cell value should run the transform BEFORE
 * submitting via a contribution-point hook, not silently rewrite
 * inside the commit path.
 */

import { InterceptorChain } from './chain.js';
import type { ColumnValue } from '../db/types.js';

/** Context passed to every `cell.committing` handler. Frozen at
 *  call time — handlers MAY NOT mutate fields. */
export interface CellCommittingContext {
  tabId: string;
  sessionId: string;
  /** Table the UPDATE will run against. Same string as
   *  `EditableContext.table.name` at the inline-edit call site. */
  table: string;
  /** Column the user edited. */
  columnName: string;
  /** Cell value before the edit. `null` when the cell was previously
   *  NULL or unset. Subscribers comparing previous-vs-next for audit
   *  trails read both fields directly. */
  previousValue: ColumnValue | null;
  /** Cell value the user typed (already parsed into `ColumnValue`
   *  shape by the inline-edit parser). May be `null` when the user
   *  cleared the cell to NULL. */
  nextValue: ColumnValue | null;
  /** New value the SQL literal will carry, AFTER the inline-edit
   *  parser quoted/escaped it. `'NULL'` for explicit-null edits;
   *  `'DEFAULT'` for the default-restore action; everything else is
   *  a Firebird-dialect literal (single-quoted string with doubled
   *  inner quotes, ISO timestamp, unquoted number, etc.). */
  newLiteral: string;
  /** Full `UPDATE … SET col = literal WHERE pk = …` SQL. Same string
   *  the shell would otherwise pass to `host.execute`. */
  sql: string;
}

/** Singleton chain instance. Plugins call `cellCommittingChain.use(...)`
 *  to register their handlers; the shell calls `.run(ctx)` before each
 *  inline-cell-edit commit. */
export const cellCommittingChain = new InterceptorChain<CellCommittingContext>();
