import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  schemaActionApplyingChain,
  type SchemaActionApplyingContext,
} from './schema-action-applying.js';

const ctx = (
  overrides: Partial<SchemaActionApplyingContext> = {},
): SchemaActionApplyingContext => ({
  tabId: 't1',
  sessionId: 's1',
  kind: 'table',
  action: 'drop',
  targetName: 'CUSTOMERS',
  ddl: 'DROP TABLE CUSTOMERS',
  ...overrides,
});

describe('schemaActionApplyingChain (I6.18)', () => {
  beforeEach(() => schemaActionApplyingChain.__reset());
  afterEach(() => schemaActionApplyingChain.__reset());

  it('empty chain allows the action (returns continue)', async () => {
    const decision = await schemaActionApplyingChain.run(ctx());
    expect(decision.action).toBe('continue');
  });

  it('handler can veto drops via the schema panel (independent of editor SQL)', async () => {
    schemaActionApplyingChain.use((c) =>
      c.action === 'drop'
        ? { action: 'cancel', reason: 'DROP via schema panel disabled; type the SQL explicitly.' }
        : { action: 'continue' },
    );
    const dropDecision = await schemaActionApplyingChain.run(ctx({ action: 'drop' }));
    expect(dropDecision.action).toBe('cancel');
    const alterDecision = await schemaActionApplyingChain.run(ctx({ action: 'alter' }));
    expect(alterDecision.action).toBe('continue');
  });

  it('handler can veto DDL on protected objects (target-name policy)', async () => {
    const PROTECTED = new Set(['AUDIT_LOG', 'BILLING_LEDGER']);
    schemaActionApplyingChain.use((c) =>
      PROTECTED.has(c.targetName)
        ? { action: 'cancel', reason: `Object ${c.targetName} is append-only — DDL blocked.` }
        : { action: 'continue' },
    );
    const blocked = await schemaActionApplyingChain.run(
      ctx({ kind: 'table', action: 'alter', targetName: 'AUDIT_LOG' }),
    );
    expect(blocked.action).toBe('cancel');
    const allowed = await schemaActionApplyingChain.run(
      ctx({ kind: 'table', action: 'alter', targetName: 'PRODUCTS' }),
    );
    expect(allowed.action).toBe('continue');
  });

  it('handler can veto recreate-table (long-running DDL) regardless of target', async () => {
    schemaActionApplyingChain.use((c) =>
      c.action === 'recreate'
        ? { action: 'cancel', reason: 'recreate-table blocked outside maintenance windows.' }
        : { action: 'continue' },
    );
    const decision = await schemaActionApplyingChain.run(
      ctx({ action: 'recreate', ddl: 'RECREATE TABLE …' }),
    );
    expect(decision.action).toBe('cancel');
  });

  it('context.ddl is null for non-DDL actions (next-value)', async () => {
    const seen = vi.fn(() => ({ action: 'continue' as const }));
    schemaActionApplyingChain.use(seen);
    await schemaActionApplyingChain.run(
      ctx({ kind: 'generator', action: 'next-value', targetName: 'GEN_X', ddl: null }),
    );
    expect((seen.mock.calls[0]?.[0] as SchemaActionApplyingContext).ddl).toBeNull();
  });

  it('async handler can prompt + veto on user-deny', async () => {
    schemaActionApplyingChain.use(async () => {
      await Promise.resolve();
      return { action: 'cancel', reason: 'denied' };
    });
    const decision = await schemaActionApplyingChain.run(ctx());
    expect(decision.action).toBe('cancel');
  });

  it('multiple handlers run in registration order; first cancel wins', async () => {
    const second = vi.fn(() => ({ action: 'continue' as const }));
    schemaActionApplyingChain.use(() => ({ action: 'cancel', reason: 'first' }));
    schemaActionApplyingChain.use(second);
    const decision = await schemaActionApplyingChain.run(ctx());
    expect(decision).toEqual({ action: 'cancel', reason: 'first' });
    expect(second).not.toHaveBeenCalled();
  });

  it('handler can compose kind + action policies', async () => {
    schemaActionApplyingChain.use((c) => {
      if (c.kind === 'trigger' && c.action === 'toggle-active') {
        return { action: 'cancel', reason: 'Trigger toggles require ops approval.' };
      }
      return { action: 'continue' };
    });
    const trigToggle = await schemaActionApplyingChain.run(
      ctx({ kind: 'trigger', action: 'toggle-active', targetName: 'BI_ORDERS', ddl: 'ALTER TRIGGER BI_ORDERS ACTIVE' }),
    );
    expect(trigToggle.action).toBe('cancel');
    const trigDrop = await schemaActionApplyingChain.run(
      ctx({ kind: 'trigger', action: 'drop', targetName: 'BI_ORDERS', ddl: 'DROP TRIGGER BI_ORDERS' }),
    );
    expect(trigDrop.action).toBe('continue');
  });
});
