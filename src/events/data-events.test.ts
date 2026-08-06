import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CELL_COMMITTED,
  ROW_DELETED,
  ROW_INSERTED,
  emitCellCommitted,
  emitRowDeleted,
  emitRowInserted,
  type CellCommittedPayload,
  type RowDeletedPayload,
  type RowInsertedPayload,
} from './data-events.js';
import { eventBus } from './event-bus.js';

describe('data-events topic constants (I6.7)', () => {
  it('exposes the three expected topic literals', () => {
    expect(CELL_COMMITTED).toBe('cell/committed');
    expect(ROW_INSERTED).toBe('row/inserted');
    expect(ROW_DELETED).toBe('row/deleted');
  });
});

describe('emitCellCommitted / emitRowInserted / emitRowDeleted (I6.7)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emitCellCommitted dispatches to subscribers of cell/committed', () => {
    const handler = vi.fn();
    eventBus.subscribe<CellCommittedPayload>('p', CELL_COMMITTED, handler);
    const payload: CellCommittedPayload = {
      tabId: 't1',
      sessionId: 's1',
      table: 'CUSTOMERS',
      columnName: 'NAME',
      sql: "UPDATE CUSTOMERS SET NAME = 'Bob' WHERE ID = 1",
      committedAt: 1234,
    };
    emitCellCommitted(payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toBe(CELL_COMMITTED);
    expect(handler.mock.calls[0]?.[1]).toEqual(payload);
  });

  it('emitRowInserted dispatches to subscribers of row/inserted', () => {
    const handler = vi.fn();
    eventBus.subscribe<RowInsertedPayload>('p', ROW_INSERTED, handler);
    const payload: RowInsertedPayload = {
      tabId: 't1',
      sessionId: 's1',
      table: 'PRODUCTS',
      sql: "INSERT INTO PRODUCTS (NAME) VALUES ('Widget')",
      insertedAt: 9999,
    };
    emitRowInserted(payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toEqual(payload);
  });

  it('emitRowDeleted dispatches to subscribers of row/deleted with rowCount', () => {
    const handler = vi.fn();
    eventBus.subscribe<RowDeletedPayload>('p', ROW_DELETED, handler);
    const payload: RowDeletedPayload = {
      tabId: 't1',
      sessionId: 's1',
      table: 'ORDERS',
      sql: 'DELETE FROM ORDERS WHERE ID IN (1, 2, 3)',
      rowCount: 3,
      deletedAt: 5555,
    };
    emitRowDeleted(payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toEqual(payload);
  });

  it('emitRowDeleted accepts null rowCount for all-rows delete (count unknown until DELETE returns)', () => {
    const handler = vi.fn();
    eventBus.subscribe<RowDeletedPayload>('p', ROW_DELETED, handler);
    emitRowDeleted({
      tabId: 't1',
      sessionId: null,
      table: 'ORDERS',
      sql: 'DELETE FROM ORDERS',
      rowCount: null,
      deletedAt: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as RowDeletedPayload).rowCount).toBeNull();
  });

  it('subscribers to the wildcard pattern `*/committed` see only cell/committed (single-segment)', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', '*/committed', handler);
    emitCellCommitted({
      tabId: 't1', sessionId: 's1', table: 'T', columnName: 'C',
      sql: 'UPDATE T SET C = 1', committedAt: 1,
    });
    emitRowInserted({
      tabId: 't1', sessionId: 's1', table: 'T', sql: 'INSERT INTO T VALUES (1)', insertedAt: 2,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toBe(CELL_COMMITTED);
  });

  it('subscribers to `**` see every data event', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', '**', handler);
    emitCellCommitted({
      tabId: 't1', sessionId: 's1', table: 'T', columnName: 'C',
      sql: 'UPDATE T SET C = 1', committedAt: 1,
    });
    emitRowInserted({
      tabId: 't1', sessionId: 's1', table: 'T', sql: 'INSERT INTO T VALUES (1)', insertedAt: 2,
    });
    emitRowDeleted({
      tabId: 't1', sessionId: 's1', table: 'T', sql: 'DELETE FROM T WHERE ID = 1',
      rowCount: 1, deletedAt: 3,
    });
    expect(handler).toHaveBeenCalledTimes(3);
  });
});
