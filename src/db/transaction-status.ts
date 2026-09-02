/**
 * Presentation helpers for transaction state.
 *
 * Kept apart from the component so the thresholds and wording can be
 * tested directly — the numbers here are the difference between a
 * useful nudge and an ignored badge.
 */

import type { TxStatus } from './types';

/**
 * How worrying an open transaction's age is.
 *
 * Firebird reclaims record versions only up to the oldest active
 * transaction, so an editor holding one open is stalling garbage
 * collection for every user of that database. The thresholds are about
 * human working rhythm rather than engine internals: a minute is long
 * enough to mean the user walked away, five minutes is long enough that
 * a busy server is accumulating versions it cannot clear.
 */
export type TxAgeLevel = 'fresh' | 'lingering' | 'stale';

/** A transaction older than this reads as forgotten rather than active. */
export const TX_LINGERING_MS = 60_000;
/** Past this, it is worth saying so plainly. */
export const TX_STALE_MS = 5 * 60_000;

/** Classifies an open transaction's age. */
export function txAgeLevel(ageMs: number): TxAgeLevel {
  if (ageMs >= TX_STALE_MS) return 'stale';
  if (ageMs >= TX_LINGERING_MS) return 'lingering';
  return 'fresh';
}

/**
 * Formats a duration the way a status line should read: compact, and
 * never wider than it needs to be.
 */
export function formatTxAge(ageMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(ageMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * True when committing or rolling back would change what is stored.
 *
 * The question a tab-close or disconnect prompt needs to ask. An open
 * transaction with nothing in it is not worth interrupting anybody over.
 */
export function hasUncommittedWork(status: TxStatus | null | undefined): boolean {
  return Boolean(status?.open && status.pendingStatements > 0);
}

/**
 * One-line summary for the status indicator.
 *
 * Says what a rollback would discard, because "1 statement" and "40
 * statements" are very different decisions.
 */
export function describeTxStatus(status: TxStatus | null | undefined): string {
  if (!status) return 'No session';
  if (status.mode === 'autocommit') return 'Autocommit';
  if (!status.open) return 'Manual · no transaction open';
  const count = status.pendingStatements;
  const statements = count === 1 ? '1 statement' : `${count} statements`;
  return `Manual · ${statements} · ${formatTxAge(status.ageMs)}`;
}

/**
 * Warning text for a transaction that has been open too long, or `null`
 * when there is nothing worth saying.
 */
export function txAgeWarning(status: TxStatus | null | undefined): string | null {
  if (!status?.open) return null;
  switch (txAgeLevel(status.ageMs)) {
    case 'stale':
      return `Open ${formatTxAge(status.ageMs)}. Firebird cannot reclaim old record versions past the oldest active transaction, so this is holding back garbage collection for the whole database.`;
    case 'lingering':
      return `Open ${formatTxAge(status.ageMs)}. Commit or roll back when you can — a long transaction delays Firebird's garbage collection.`;
    case 'fresh':
      return null;
  }
}
