import { editorSavingChain } from '../interceptors/editor-saving.js';
import { queryExecutingChain } from '../interceptors/query-executing.js';
import type { ColumnDescription, Row, StatementOutcome } from './types.js';

/**
 * What happens to a statement on either side of the host call.
 *
 * Before: two interceptor chains get to rewrite or refuse it. After: the
 * outcome array gets unwrapped into the shape the caller expected. Both
 * halves existed in each shell's `App.tsx` — the chain run twice
 * verbatim, the unwrap five times in one shell and four in the other,
 * each with its own error message and its own chance to check one
 * condition fewer.
 *
 * These are plain functions rather than a hook. Nothing here needs React,
 * and the chains are the point at which a plugin can change what SQL the
 * user's database actually receives, so they earn direct tests.
 */

/** Where a statement is headed. */
export interface StatementIntent {
  tabId: string;
  /** Never `null`: the chains only run when a live session exists. */
  sessionId: string;
  /** The SQL as the user wrote it, before any interceptor sees it. */
  sql: string;
}

/** What the chains decided. */
export type StatementDecision =
  | {
      action: 'run';
      /** The SQL to actually send — the user's, unless an interceptor
       *  replaced it. */
      sql: string;
      /** `true` when an interceptor rewrote the statement. Hosts may
       *  surface this; the user is entitled to know their SQL changed. */
      replaced: boolean;
    }
  | { action: 'cancel'; reason: string };

/**
 * Runs the `editor.saving` and `query.executing` chains over a statement.
 *
 * Order matters and is not arbitrary: `editor.saving` fires first
 * because it represents "the user committed this buffer", and
 * `query.executing` fires second on whatever that produced, so a
 * formatter and a policy check compose rather than race. The second
 * chain sees the first chain's output — running both against the
 * original would silently discard one of the two rewrites.
 *
 * A cancel from either chain stops the statement. The reason is the
 * user's only explanation for why nothing ran, so it is carried back
 * rather than swallowed.
 */
export async function resolveStatement(intent: StatementIntent): Promise<StatementDecision> {
  const editorDecision = await editorSavingChain.run({
    tabId: intent.tabId,
    sessionId: intent.sessionId,
    sql: intent.sql,
  });
  if (editorDecision.action === 'cancel') {
    return { action: 'cancel', reason: editorDecision.reason };
  }
  const afterEditor =
    editorDecision.action === 'replace' ? editorDecision.ctx.sql : intent.sql;

  const queryDecision = await queryExecutingChain.run({
    tabId: intent.tabId,
    sessionId: intent.sessionId,
    sql: afterEditor,
  });
  if (queryDecision.action === 'cancel') {
    return { action: 'cancel', reason: queryDecision.reason };
  }
  const sql = queryDecision.action === 'replace' ? queryDecision.ctx.sql : afterEditor;

  return { action: 'run', sql, replaced: sql !== intent.sql };
}

/** A statement that returned a result set. */
export interface RowsResult {
  columns: ColumnDescription[];
  rows: Row[];
}

/**
 * Unwraps the first outcome of a batch that was expected to return rows.
 *
 * `label` names what was being run, so the thrown message says which
 * query disappointed rather than only that one did — these are surfaced
 * to the user, and "SELECT did not return rows" without a subject is
 * not actionable when four background fetches are in flight.
 *
 * @throws When the batch is empty, the statement failed, or it produced
 * an affected-row count instead of a result set.
 */
export function firstRows(outcomes: StatementOutcome[], label: string): RowsResult {
  const first = outcomes[0];
  if (!first) throw new Error(`${label}: produced no outcome.`);
  if (first.status === 'err') throw new Error(`${label}: ${first.error}`);
  if (!('Rows' in first.result)) throw new Error(`${label}: did not return rows.`);
  return { columns: first.result.Rows.columns, rows: first.result.Rows.rows };
}

/**
 * Unwraps the first outcome of a batch that was expected to change rows.
 *
 * Zero affected rows is a failure here, not a success. Every caller is
 * a write the user initiated against a row they were looking at — an
 * `UPDATE` that matched nothing means the row moved or vanished under
 * them, and reporting success would leave them believing an edit landed
 * that did not.
 *
 * @throws When the batch is empty, the statement failed, or it matched
 * no rows.
 */
export function firstAffected(outcomes: StatementOutcome[], label: string): number {
  const first = outcomes[0];
  if (!first) throw new Error(`${label}: produced no outcome.`);
  if (first.status === 'err') throw new Error(first.error);
  if (!('Affected' in first.result)) {
    throw new Error(`${label}: did not report affected rows.`);
  }
  const affected = first.result.Affected.rows;
  if (affected === 0) throw new Error(`${label}: matched zero rows.`);
  return affected;
}
