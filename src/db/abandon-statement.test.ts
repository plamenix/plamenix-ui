/**
 * Getting out of a statement that will not finish.
 *
 * The product cannot cancel: `fb_cancel_operation` is unbound in the
 * vendored native driver, and the default pure-Rust backend has no
 * cancel operation at all. So the honest move is to end the attachment,
 * and the tests here are mostly about being straight with the user
 * about what that costs — and about the race it opens.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  abandonNeedsConfirmation,
  abandonStatement,
  describeAbandonCost,
  isStaleSession,
} from './abandon-statement.js';
import type { TxStatus } from './types.js';

function tx(overrides: Partial<TxStatus> = {}): TxStatus {
  return { mode: 'manual', open: true, pendingStatements: 3, ...overrides } as TxStatus;
}

describe('abandonNeedsConfirmation', () => {
  it('asks when a manual transaction has statements in it', () => {
    expect(abandonNeedsConfirmation(tx())).toBe(true);
  });

  it('does not ask under autocommit', () => {
    // Nothing pending by definition. Prompting anyway trains the user
    // to dismiss the prompt that matters.
    expect(abandonNeedsConfirmation(tx({ mode: 'autocommit', open: false }))).toBe(false);
  });

  it('does not ask for an open transaction with nothing in it', () => {
    expect(abandonNeedsConfirmation(tx({ pendingStatements: 0 }))).toBe(false);
  });

  it('does not ask when there is no transaction state at all', () => {
    expect(abandonNeedsConfirmation(null)).toBe(false);
    expect(abandonNeedsConfirmation(undefined)).toBe(false);
  });
});

describe('describeAbandonCost', () => {
  it('says what will be discarded, and how much', () => {
    // "Your work will be lost" is not a decision anyone can make.
    const text = describeAbandonCost(tx({ pendingStatements: 40 }));
    expect(text).toContain('40 statements');
    expect(text).toContain('rolled back');
  });

  it('counts one statement in the singular', () => {
    expect(describeAbandonCost(tx({ pendingStatements: 1 }))).toContain('1 statement');
    expect(describeAbandonCost(tx({ pendingStatements: 1 }))).not.toContain('1 statements');
  });

  it('explains why the connection has to go', () => {
    // Otherwise dropping the session looks like a bug rather than the
    // only lever available.
    expect(describeAbandonCost(tx())).toMatch(/no way to cancel/i);
  });

  it('says the tab will come back', () => {
    expect(describeAbandonCost(tx())).toMatch(/reconnect/i);
  });
});

describe('abandonStatement', () => {
  it('ends the session, then reconnects', async () => {
    const order: string[] = [];
    await abandonStatement({
      sessionId: 's1',
      close: async () => void order.push('close'),
      reconnect: async () => void order.push('reconnect'),
      onError: vi.fn(),
    });

    expect(order).toEqual(['close', 'reconnect']);
  });

  it('reconnects even when the close failed', async () => {
    // A tab whose session is in an unknown state is not one the user
    // can do anything with. The reconnect is what returns it to a
    // usable state, and if the server is genuinely gone that attempt
    // reports the real problem.
    const reconnect = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    await abandonStatement({
      sessionId: 's1',
      close: vi.fn().mockRejectedValue(new Error('already gone')),
      reconnect,
      onError,
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('already gone'));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('closes the session it was given, not whatever is current', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    await abandonStatement({
      sessionId: 'the-stuck-one',
      close,
      reconnect: vi.fn().mockResolvedValue(undefined),
      onError: vi.fn(),
    });

    expect(close).toHaveBeenCalledWith('the-stuck-one');
  });
});

describe('isStaleSession', () => {
  it('recognises a result from the session the tab still holds', () => {
    expect(isStaleSession('s1', 's1')).toBe(false);
  });

  it('recognises a result from a session the tab has left', () => {
    // The race abandoning opens: the execute rejects because its
    // session died, and its catch would stamp an error on a tab that
    // has already reconnected and looks healthy.
    expect(isStaleSession('s1', 's2')).toBe(true);
  });

  it('treats a disconnected tab as having left every session', () => {
    expect(isStaleSession('s1', null)).toBe(true);
  });
});
