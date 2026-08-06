/**
 * Query events (I6.6) — per-statement emit family.
 *
 *   - `query/executed` — fires once per successful `StatementOutcome`
 *                        (`status === 'ok'`). Multi-statement batches
 *                        emit one event per statement.
 *   - `query/failed`   — fires once per failed `StatementOutcome`
 *                        (`status === 'err'`). The Firebird driver
 *                        aborts a batch at the first error, so there
 *                        is at most one failed entry per batch — but
 *                        the contract is per-statement to keep the
 *                        emit shape uniform.
 *
 * Trigger: `useTabsStore.tabs[].results` reference identity changes
 * (the store replaces the array on every execute call). Per-statement
 * walk emits each outcome in document order.
 *
 * Diff-on-subscribe shape mirrors I6.4 + I6.5. Subscribers correlate
 * events by `tabId` + `sql`; observability dashboards can group by
 * `sessionId` for connection-scoped query metrics.
 */

import { useEffect, useRef } from 'react';
import { eventBus } from './event-bus.js';
import { useTabsStore, type TabState } from '../db/tabs-store.js';
import type { StatementOutcome } from '../db/types.js';

/** Topic literals. */
export const QUERY_EXECUTED = 'query/executed' as const;
export const QUERY_FAILED = 'query/failed' as const;

export interface QueryExecutedPayload {
  tabId: string;
  /** Session that ran the statement. `null` is invalid (queries can't
   *  run without a session) but kept nullable for type-narrowing in
   *  subscribers that share a single handler with other event
   *  families. */
  sessionId: string | null;
  /** SQL text that executed (trimmed of trailing whitespace +
   *  semicolon by the driver wrapper before emit). */
  sql: string;
  /** Row count for SELECTs; `null` for DDL / DML that returned no
   *  rows (use `affectedRows` for those). */
  rowCount: number | null;
  /** Affected row count for DML / DDL; `null` for SELECT results. */
  affectedRows: number | null;
  /** Wall-clock execution time in milliseconds. */
  durationMs: number;
  /** Position in the batch — 0 for single-statement runs, useful for
   *  per-statement progress in multi-statement scripts. */
  statementIndex: number;
  executedAt: number;
}

export interface QueryFailedPayload {
  tabId: string;
  sessionId: string | null;
  sql: string;
  /** Stringified driver error. */
  error: string;
  /** Wall-clock duration in milliseconds (typically near-zero for
   *  validation failures). */
  durationMs: number;
  /** Position in the batch — the batch aborts after this index, so
   *  later statements in the script did not run. */
  statementIndex: number;
  failedAt: number;
}

export function emitQueryExecuted(payload: QueryExecutedPayload): void {
  eventBus.emit<QueryExecutedPayload>(QUERY_EXECUTED, payload);
}
export function emitQueryFailed(payload: QueryFailedPayload): void {
  eventBus.emit<QueryFailedPayload>(QUERY_FAILED, payload);
}

/** Per-tab snapshot for the diff. Decoupled from the full `TabState`
 *  so unit tests can drive without the larger types. */
export interface QuerySnapshot {
  id: string;
  sessionId: string | null;
  /** Reference-identity-tracked array. Diff fires when this changes
   *  to a different array (or null → array). */
  results: ReadonlyArray<StatementOutcome> | null;
}

/** Pure diff — exposed for unit tests. For each tab whose `results`
 *  identity changed to a non-null array, walks the outcomes and
 *  emits one `executed` / `failed` event per statement. Returns
 *  total event count emitted across all tabs. */
export function diffAndEmitQueryEvents(
  prev: ReadonlyArray<QuerySnapshot>,
  next: ReadonlyArray<QuerySnapshot>,
  now: () => number = Date.now,
): number {
  let count = 0;
  const prevById = new Map(prev.map((t) => [t.id, t]));
  for (const t of next) {
    const before = prevById.get(t.id);
    const prevResults = before?.results ?? null;
    if (t.results === null || t.results === prevResults) continue;
    t.results.forEach((outcome, statementIndex) => {
      if (outcome.status === 'ok') {
        // The driver-level `result` is a discriminated union:
        // `{Rows: {columns, rows, truncated?}}` for SELECT-shape
        // statements, `{Affected: {rows}}` for DML/DDL. Narrow on
        // the discriminator + populate rowCount / affectedRows
        // accordingly.
        const result = outcome.result;
        const rowCount = result.Rows ? result.Rows.rows.length : null;
        const affectedRows = result.Affected ? result.Affected.rows : null;
        emitQueryExecuted({
          tabId: t.id,
          sessionId: t.sessionId,
          sql: outcome.sql,
          rowCount,
          affectedRows,
          durationMs: outcome.durationMs,
          statementIndex,
          executedAt: now(),
        });
        count++;
      } else {
        emitQueryFailed({
          tabId: t.id,
          sessionId: t.sessionId,
          sql: outcome.sql,
          error: outcome.error,
          durationMs: outcome.durationMs,
          statementIndex,
          failedAt: now(),
        });
        count++;
      }
    });
  }
  return count;
}

function toSnapshot(state: { tabs: ReadonlyArray<TabState> }): QuerySnapshot[] {
  return state.tabs.map((t) => ({
    id: t.id,
    sessionId: t.sessionId,
    results: t.results,
  }));
}

/** React hook that subscribes to `useTabsStore` + emits query events
 *  on every results-identity change. Mount once at the App
 *  component:
 *
 *    useEmitQueryEvents();
 *
 *  Initial mount captures the current store snapshot — if a tab
 *  already holds results at mount, the diff against the empty
 *  baseline emits them once (so subscribers mounting late see the
 *  most-recent batch from their first event instead of having to
 *  query the store). */
export function useEmitQueryEvents(): void {
  const prevRef = useRef<QuerySnapshot[]>([]);
  useEffect(() => {
    const initial = toSnapshot(useTabsStore.getState());
    diffAndEmitQueryEvents(prevRef.current, initial);
    prevRef.current = initial;
    const unsubscribe = useTabsStore.subscribe((state) => {
      const next = toSnapshot(state);
      diffAndEmitQueryEvents(prevRef.current, next);
      prevRef.current = next;
    });
    return () => unsubscribe();
  }, []);
}
