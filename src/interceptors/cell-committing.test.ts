import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cellCommittingChain,
  type CellCommittingContext,
} from './cell-committing.js';

const ctx = (overrides: Partial<CellCommittingContext> = {}): CellCommittingContext => ({
  tabId: 't1',
  sessionId: 's1',
  table: 'CUSTOMERS',
  columnName: 'NAME',
  previousValue: { type: 'string', value: 'Alice' },
  nextValue: { type: 'string', value: 'Bob' },
  newLiteral: "'Bob'",
  sql: "UPDATE CUSTOMERS SET NAME = 'Bob' WHERE ID = 1",
  ...overrides,
});

describe('cellCommittingChain (I6.13)', () => {
  beforeEach(() => cellCommittingChain.__reset());
  afterEach(() => cellCommittingChain.__reset());

  it('empty chain allows the commit (returns continue)', async () => {
    const decision = await cellCommittingChain.run(ctx());
    expect(decision.action).toBe('continue');
  });

  it('handler receives the full context unchanged', async () => {
    const seen = vi.fn(() => ({ action: 'continue' as const }));
    cellCommittingChain.use(seen);
    const c = ctx();
    await cellCommittingChain.run(c);
    expect(seen).toHaveBeenCalledWith(c);
  });

  it('handler can veto a commit with a human-readable reason', async () => {
    cellCommittingChain.use((c) =>
      c.columnName === 'NAME'
        ? { action: 'cancel', reason: 'Edits to NAME require manager approval.' }
        : { action: 'continue' },
    );
    const decision = await cellCommittingChain.run(ctx());
    expect(decision.action).toBe('cancel');
    if (decision.action === 'cancel') {
      expect(decision.reason).toContain('NAME');
    }
  });

  it('async handler can prompt + veto on user-deny', async () => {
    cellCommittingChain.use(async () => {
      await Promise.resolve();
      return { action: 'cancel', reason: 'cancelled' };
    });
    const decision = await cellCommittingChain.run(ctx());
    expect(decision.action).toBe('cancel');
  });

  it('multiple handlers run in registration order; first cancel wins', async () => {
    const second = vi.fn(() => ({ action: 'continue' as const }));
    cellCommittingChain.use(() => ({ action: 'cancel', reason: 'first' }));
    cellCommittingChain.use(second);
    const decision = await cellCommittingChain.run(ctx());
    expect(decision).toEqual({ action: 'cancel', reason: 'first' });
    expect(second).not.toHaveBeenCalled();
  });

  it('handler that disposes itself mid-chain does not break iteration', async () => {
    const trail: string[] = [];
    let reg = cellCommittingChain.use((c) => {
      trail.push('a');
      reg.dispose();
      return { action: 'continue' as const };
    });
    cellCommittingChain.use(() => {
      trail.push('b');
      return { action: 'continue' as const };
    });
    await cellCommittingChain.run(ctx());
    expect(trail).toEqual(['a', 'b']);
  });

  it('handler can read previousValue + nextValue for diff-aware policies', async () => {
    const seen: Array<{ prev: unknown; next: unknown }> = [];
    cellCommittingChain.use((c) => {
      seen.push({ prev: c.previousValue, next: c.nextValue });
      return { action: 'continue' };
    });
    await cellCommittingChain.run(ctx({
      previousValue: { type: 'integer', value: 10 },
      nextValue: { type: 'integer', value: 20 },
    }));
    expect(seen[0]).toEqual({
      prev: { type: 'integer', value: 10 },
      next: { type: 'integer', value: 20 },
    });
  });

  it('context carries newLiteral for value-shape policies', async () => {
    const seen = vi.fn(() => ({ action: 'continue' as const }));
    cellCommittingChain.use(seen);
    await cellCommittingChain.run(ctx({ newLiteral: 'DEFAULT' }));
    const got = (seen.mock.calls[0]?.[0] as CellCommittingContext).newLiteral;
    expect(got).toBe('DEFAULT');
  });
});
