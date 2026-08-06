import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  editorSavingChain,
  type EditorSavingContext,
} from './editor-saving.js';

const ctx = (overrides: Partial<EditorSavingContext> = {}): EditorSavingContext => ({
  tabId: 't1',
  sessionId: 's1',
  sql: 'SELECT * FROM CUSTOMERS',
  ...overrides,
});

describe('editorSavingChain (I6.17)', () => {
  beforeEach(() => editorSavingChain.__reset());
  afterEach(() => editorSavingChain.__reset());

  it('empty chain allows the save (returns continue)', async () => {
    const decision = await editorSavingChain.run(ctx());
    expect(decision.action).toBe('continue');
  });

  it('handler receives the editor buffer', async () => {
    const seen = vi.fn(() => ({ action: 'continue' as const }));
    editorSavingChain.use(seen);
    await editorSavingChain.run(ctx({ sql: 'DELETE FROM ORDERS WHERE ID = 1' }));
    expect((seen.mock.calls[0]?.[0] as EditorSavingContext).sql).toBe(
      'DELETE FROM ORDERS WHERE ID = 1',
    );
  });

  it('handler can veto on missing-comment policy', async () => {
    editorSavingChain.use((c) =>
      c.sql.includes('--')
        ? { action: 'continue' as const }
        : { action: 'cancel' as const, reason: 'Save blocked: SQL missing a leading comment.' },
    );
    const noComment = await editorSavingChain.run(ctx({ sql: 'SELECT 1' }));
    expect(noComment.action).toBe('cancel');
    const withComment = await editorSavingChain.run(ctx({ sql: '-- ticket #42\nSELECT 1' }));
    expect(withComment.action).toBe('continue');
  });

  it('handler can veto on formatting-drift detection', async () => {
    editorSavingChain.use((c) =>
      /^\s+SELECT/i.test(c.sql)
        ? { action: 'cancel', reason: 'Indentation drift; run :format first.' }
        : { action: 'continue' },
    );
    const drifted = await editorSavingChain.run(ctx({ sql: '   SELECT 1' }));
    expect(drifted.action).toBe('cancel');
    const clean = await editorSavingChain.run(ctx({ sql: 'SELECT 1' }));
    expect(clean.action).toBe('continue');
  });

  it('async handler can prompt + veto on user-deny', async () => {
    editorSavingChain.use(async () => {
      await Promise.resolve();
      return { action: 'cancel', reason: 'denied' };
    });
    const decision = await editorSavingChain.run(ctx());
    expect(decision.action).toBe('cancel');
  });

  it('multiple handlers run in registration order; first cancel wins', async () => {
    const second = vi.fn(() => ({ action: 'continue' as const }));
    editorSavingChain.use(() => ({ action: 'cancel', reason: 'first' }));
    editorSavingChain.use(second);
    const decision = await editorSavingChain.run(ctx());
    expect(decision).toEqual({ action: 'cancel', reason: 'first' });
    expect(second).not.toHaveBeenCalled();
  });

  it('handler that disposes itself mid-chain does not break iteration', async () => {
    const trail: string[] = [];
    let reg = editorSavingChain.use(() => {
      trail.push('a');
      reg.dispose();
      return { action: 'continue' as const };
    });
    editorSavingChain.use(() => {
      trail.push('b');
      return { action: 'continue' as const };
    });
    await editorSavingChain.run(ctx());
    expect(trail).toEqual(['a', 'b']);
  });
});
