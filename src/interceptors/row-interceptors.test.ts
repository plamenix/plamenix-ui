import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  rowInsertingChain,
  type RowInsertingContext,
} from './row-inserting.js';
import {
  rowDeletingChain,
  type RowDeletingContext,
} from './row-deleting.js';

const insertCtx = (overrides: Partial<RowInsertingContext> = {}): RowInsertingContext => ({
  tabId: 't1',
  sessionId: 's1',
  table: 'CUSTOMERS',
  values: [
    { column: 'ID', value: { type: 'integer', value: 1 } },
    { column: 'NAME', value: { type: 'string', value: 'Alice' } },
  ],
  sql: "INSERT INTO CUSTOMERS (ID, NAME) VALUES (1, 'Alice')",
  ...overrides,
});

const deleteCtx = (overrides: Partial<RowDeletingContext> = {}): RowDeletingContext => ({
  tabId: 't1',
  sessionId: 's1',
  table: 'CUSTOMERS',
  rowCount: 3,
  predicate: 'ID IN (1, 2, 3)',
  sql: 'DELETE FROM CUSTOMERS WHERE ID IN (1, 2, 3)',
  ...overrides,
});

describe('rowInsertingChain (I6.14)', () => {
  beforeEach(() => rowInsertingChain.__reset());
  afterEach(() => rowInsertingChain.__reset());

  it('empty chain allows the insert (returns continue)', async () => {
    const decision = await rowInsertingChain.run(insertCtx());
    expect(decision.action).toBe('continue');
  });

  it('handler receives the values array in declaration order', async () => {
    const seen = vi.fn(() => ({ action: 'continue' as const }));
    rowInsertingChain.use(seen);
    await rowInsertingChain.run(insertCtx());
    const got = (seen.mock.calls[0]?.[0] as RowInsertingContext).values;
    expect(got.map((v) => v.column)).toEqual(['ID', 'NAME']);
  });

  it('handler can veto missing-required-field inserts', async () => {
    rowInsertingChain.use((c) =>
      c.values.some((v) => v.column === 'APPROVED_BY')
        ? { action: 'continue' as const }
        : { action: 'cancel' as const, reason: 'INSERT requires APPROVED_BY column.' },
    );
    const decision = await rowInsertingChain.run(insertCtx());
    expect(decision.action).toBe('cancel');
    if (decision.action === 'cancel') {
      expect(decision.reason).toContain('APPROVED_BY');
    }
  });

  it('async handler can prompt + veto on user-deny', async () => {
    rowInsertingChain.use(async () => {
      await Promise.resolve();
      return { action: 'cancel', reason: 'denied' };
    });
    const decision = await rowInsertingChain.run(insertCtx());
    expect(decision.action).toBe('cancel');
  });

  it('multiple handlers run in registration order; first cancel wins', async () => {
    const second = vi.fn(() => ({ action: 'continue' as const }));
    rowInsertingChain.use(() => ({ action: 'cancel', reason: 'first' }));
    rowInsertingChain.use(second);
    const decision = await rowInsertingChain.run(insertCtx());
    expect(decision).toEqual({ action: 'cancel', reason: 'first' });
    expect(second).not.toHaveBeenCalled();
  });
});

describe('rowDeletingChain (I6.14)', () => {
  beforeEach(() => rowDeletingChain.__reset());
  afterEach(() => rowDeletingChain.__reset());

  it('empty chain allows the delete (returns continue)', async () => {
    const decision = await rowDeletingChain.run(deleteCtx());
    expect(decision.action).toBe('continue');
  });

  it('handler can veto bulk deletes above a threshold', async () => {
    rowDeletingChain.use((c) =>
      c.rowCount !== null && c.rowCount > 1000
        ? { action: 'cancel', reason: `Bulk DELETE of ${c.rowCount} rows blocked.` }
        : { action: 'continue' },
    );
    const small = await rowDeletingChain.run(deleteCtx({ rowCount: 5 }));
    expect(small.action).toBe('continue');
    const big = await rowDeletingChain.run(deleteCtx({ rowCount: 5000 }));
    expect(big.action).toBe('cancel');
  });

  it('handler can detect all-rows DELETE via null rowCount + null predicate', async () => {
    rowDeletingChain.use((c) =>
      c.rowCount === null && c.predicate === null
        ? { action: 'cancel', reason: 'all-rows DELETE blocked' }
        : { action: 'continue' },
    );
    const allRows = await rowDeletingChain.run(deleteCtx({ rowCount: null, predicate: null, sql: 'DELETE FROM CUSTOMERS' }));
    expect(allRows.action).toBe('cancel');
    const filtered = await rowDeletingChain.run(deleteCtx());
    expect(filtered.action).toBe('continue');
  });

  it('handler can read predicate string for filter-aware policies', async () => {
    const seen: string[] = [];
    rowDeletingChain.use((c) => {
      if (c.predicate !== null) seen.push(c.predicate);
      return { action: 'continue' };
    });
    await rowDeletingChain.run(deleteCtx({ predicate: 'ARCHIVED = 1' }));
    expect(seen).toEqual(['ARCHIVED = 1']);
  });

  it('multiple handlers run in registration order; first cancel wins', async () => {
    const second = vi.fn(() => ({ action: 'continue' as const }));
    rowDeletingChain.use(() => ({ action: 'cancel', reason: 'tombstone-only' }));
    rowDeletingChain.use(second);
    const decision = await rowDeletingChain.run(deleteCtx());
    expect(decision.action).toBe('cancel');
    if (decision.action === 'cancel') {
      expect(decision.reason).toBe('tombstone-only');
    }
    expect(second).not.toHaveBeenCalled();
  });
});

describe('rowInsertingChain + rowDeletingChain are independent (I6.14)', () => {
  beforeEach(() => {
    rowInsertingChain.__reset();
    rowDeletingChain.__reset();
  });
  afterEach(() => {
    rowInsertingChain.__reset();
    rowDeletingChain.__reset();
  });

  it('vetoing INSERT does not affect DELETE chain', async () => {
    rowInsertingChain.use(() => ({ action: 'cancel', reason: 'no inserts' }));
    const insertDecision = await rowInsertingChain.run(insertCtx());
    expect(insertDecision.action).toBe('cancel');
    const deleteDecision = await rowDeletingChain.run(deleteCtx());
    expect(deleteDecision.action).toBe('continue');
  });
});
