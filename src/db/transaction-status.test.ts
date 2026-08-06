import { describe, expect, it } from 'vitest';
import {
  TX_LINGERING_MS,
  TX_STALE_MS,
  describeTxStatus,
  formatTxAge,
  hasUncommittedWork,
  txAgeLevel,
  txAgeWarning,
} from './transaction-status.js';
import type { TxStatus } from './types.js';

function status(overrides: Partial<TxStatus> = {}): TxStatus {
  return {
    mode: 'manual',
    config: { isolation: 'readCommitted', locking: { kind: 'noWait' } },
    open: true,
    pendingStatements: 1,
    ageMs: 0,
    ...overrides,
  };
}

describe('formatTxAge', () => {
  it('stays compact across the ranges a status line has room for', () => {
    expect(formatTxAge(0)).toBe('0s');
    expect(formatTxAge(45_000)).toBe('45s');
    expect(formatTxAge(65_000)).toBe('1m 05s');
    expect(formatTxAge(3_600_000)).toBe('1h 00m');
    expect(formatTxAge(5_430_000)).toBe('1h 30m');
  });

  it('does not render negative time if a clock skews', () => {
    expect(formatTxAge(-1)).toBe('0s');
  });
});

describe('txAgeLevel', () => {
  it('escalates at the thresholds', () => {
    expect(txAgeLevel(0)).toBe('fresh');
    expect(txAgeLevel(TX_LINGERING_MS - 1)).toBe('fresh');
    expect(txAgeLevel(TX_LINGERING_MS)).toBe('lingering');
    expect(txAgeLevel(TX_STALE_MS - 1)).toBe('lingering');
    expect(txAgeLevel(TX_STALE_MS)).toBe('stale');
  });
});

describe('hasUncommittedWork', () => {
  it('is the question a close prompt should ask', () => {
    expect(hasUncommittedWork(status({ pendingStatements: 2 }))).toBe(true);
    // Open but empty: nothing a rollback would discard, so do not
    // interrupt the user over it.
    expect(hasUncommittedWork(status({ pendingStatements: 0 }))).toBe(false);
    expect(hasUncommittedWork(status({ open: false, pendingStatements: 3 }))).toBe(false);
    expect(hasUncommittedWork(null)).toBe(false);
    expect(hasUncommittedWork(undefined)).toBe(false);
  });
});

describe('describeTxStatus', () => {
  it('says what a rollback would discard', () => {
    expect(describeTxStatus(status({ pendingStatements: 1, ageMs: 5_000 }))).toBe(
      'Manual · 1 statement · 5s',
    );
    expect(describeTxStatus(status({ pendingStatements: 40, ageMs: 5_000 }))).toBe(
      'Manual · 40 statements · 5s',
    );
  });

  it('covers the states with nothing pending', () => {
    expect(describeTxStatus(status({ mode: 'autocommit', open: false }))).toBe('Autocommit');
    expect(describeTxStatus(status({ open: false }))).toBe('Manual · no transaction open');
    expect(describeTxStatus(null)).toBe('No session');
  });
});

describe('txAgeWarning', () => {
  it('stays quiet until the transaction has been open a while', () => {
    expect(txAgeWarning(status({ ageMs: 1_000 }))).toBeNull();
    expect(txAgeWarning(status({ open: false, ageMs: TX_STALE_MS }))).toBeNull();
  });

  it('names the actual consequence rather than just "old"', () => {
    const lingering = txAgeWarning(status({ ageMs: TX_LINGERING_MS }));
    expect(lingering).toContain('garbage collection');

    const stale = txAgeWarning(status({ ageMs: TX_STALE_MS }));
    expect(stale).toContain('oldest active transaction');
    expect(stale).toContain('whole database');
  });
});
