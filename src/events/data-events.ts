/**
 * Data-mutation events (I6.7) — three topics covering inline + bulk
 * row mutations:
 *
 *   - `cell/committed`  — fires once per single-cell UPDATE that
 *                          succeeded
 *   - `row/inserted`    — fires once per row added via the row-editor
 *                          modal (or any future "insert one row" UI)
 *   - `row/deleted`     — fires once per DELETE batch (covers single-
 *                          row delete + bulk delete + delete-all)
 *
 * Unlike the I6.4 / I6.5 / I6.6 event families, these emits are
 * **imperative**, not diff-on-subscribe. The mutations are user
 * actions dispatched from React event handlers; the cleanest emit
 * point is right after `await onCommit(sql)` resolves in the
 * handler. The shell call sites read the active tab id + session id
 * from `useTabsStore` at emit time (the emit helpers don't bake
 * those in so they stay decoupled from the store).
 *
 * Subscribers that need the SQL that ran already get it via
 * `query/executed` (I6.6) since every inline edit runs through the
 * same `db.execute` pipeline. The cell/row events add **semantic**
 * context (table name, column name for cell edits, affected row
 * count for deletes) that the raw SQL doesn't carry.
 */

import { eventBus } from './event-bus.js';

/** Topic literals. */
export const CELL_COMMITTED = 'cell/committed' as const;
export const ROW_INSERTED = 'row/inserted' as const;
export const ROW_DELETED = 'row/deleted' as const;

export interface CellCommittedPayload {
  tabId: string;
  sessionId: string | null;
  /** Table the UPDATE ran against (the same name the inline-edit
   *  `EditableContext` carries). */
  table: string;
  /** Column the user edited. */
  columnName: string;
  /** The exact SQL that ran (`UPDATE … SET col = literal WHERE pk = …`).
   *  Same string the host's `onCommit(sql)` callback received. */
  sql: string;
  committedAt: number;
}

export interface RowInsertedPayload {
  tabId: string;
  sessionId: string | null;
  /** Table the INSERT ran against. */
  table: string;
  /** The exact `INSERT INTO … VALUES (…)` SQL. */
  sql: string;
  insertedAt: number;
}

export interface RowDeletedPayload {
  tabId: string;
  sessionId: string | null;
  /** Table the DELETE ran against. */
  table: string;
  /** The exact `DELETE FROM … WHERE …` SQL. */
  sql: string;
  /** Number of rows the delete targeted, when the call site knows
   *  (bulk-delete from the selection set carries this; all-rows
   *  delete may leave `null` because the count isn't known until
   *  the DELETE returns). Subscribers that need an exact count
   *  cross-reference the `query/executed` event for the same SQL
   *  (its `affectedRows` is authoritative). */
  rowCount: number | null;
  deletedAt: number;
}

export function emitCellCommitted(payload: CellCommittedPayload): void {
  eventBus.emit<CellCommittedPayload>(CELL_COMMITTED, payload);
}

export function emitRowInserted(payload: RowInsertedPayload): void {
  eventBus.emit<RowInsertedPayload>(ROW_INSERTED, payload);
}

export function emitRowDeleted(payload: RowDeletedPayload): void {
  eventBus.emit<RowDeletedPayload>(ROW_DELETED, payload);
}
