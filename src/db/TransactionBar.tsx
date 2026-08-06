/**
 * Transaction controls for the query toolbar: the autocommit/manual
 * toggle, Commit and Rollback, and the status readout.
 *
 * Presentational only — the host owns the session and performs the
 * calls, matching how the rest of this library is wired.
 *
 * The age readout ticks locally between status refreshes. `TxStatus`
 * carries the age at the moment the host sampled it, and a counter that
 * only moved when something else happened would read as frozen.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, RotateCcw } from 'lucide-react';
import type { TxConfig, TxIsolation, TxLocking, TxMode, TxStatus } from './types';
import { describeTxStatus, formatTxAge, txAgeLevel, txAgeWarning } from './transaction-status';

export interface TransactionBarProps {
  /** Current state, or `null` while the tab has no session. */
  status: TxStatus | null;
  /** Disables every control while a call is in flight. */
  busy?: boolean;
  /** Switches mode. Rejected by the host while a transaction is open. */
  onSetMode: (mode: TxMode, config: TxConfig) => void;
  /** Commits the open transaction. */
  onCommit: () => void;
  /** Rolls back the open transaction. */
  onRollback: () => void;
}

/** Ticks once a second while a transaction is open, so the age moves. */
function useLiveAge(status: TxStatus | null): number {
  const open = status?.open ?? false;
  const sampledAge = status?.ageMs ?? 0;
  const [sampledAt, setSampledAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setSampledAt(Date.now());
    setNow(Date.now());
  }, [sampledAge, open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return 0;
  return sampledAge + Math.max(0, now - sampledAt);
}

const ISOLATION_LABELS: Record<TxIsolation, string> = {
  readCommitted: 'Read committed',
  snapshot: 'Snapshot',
};

export function TransactionBar({
  status,
  busy = false,
  onSetMode,
  onCommit,
  onRollback,
}: TransactionBarProps) {
  const liveAge = useLiveAge(status);
  if (!status) return null;

  const manual = status.mode === 'manual';
  const open = status.open;
  const level = txAgeLevel(liveAge);
  const warning = txAgeWarning({ ...status, ageMs: liveAge });
  const summary = describeTxStatus({ ...status, ageMs: liveAge });

  const toggleMode = () => {
    onSetMode(manual ? 'autocommit' : 'manual', status.config);
  };

  const setIsolation = (isolation: TxIsolation) => {
    onSetMode(status.mode, { ...status.config, isolation });
  };

  const setLocking = (locking: TxLocking) => {
    onSetMode(status.mode, { ...status.config, locking });
  };

  return (
    <div className="flex items-center gap-2 text-[11px]" data-testid="transaction-bar">
      <button
        type="button"
        onClick={toggleMode}
        disabled={busy || open}
        title={
          open
            ? 'Commit or roll back before changing mode'
            : manual
              ? 'Switch to autocommit: each statement commits immediately'
              : 'Switch to manual: statements are held until you commit'
        }
        className={`rounded border px-2 py-0.5 font-medium transition-colors disabled:opacity-50 ${
          manual
            ? 'border-warning bg-warning-subtle text-warning'
            : 'border-edge bg-canvas text-fg-subtle hover:text-fg'
        }`}
      >
        {manual ? 'Manual commit' : 'Autocommit'}
      </button>

      {manual && (
        <>
          <select
            aria-label="Isolation level"
            value={status.config.isolation}
            onChange={(e) => setIsolation(e.target.value as TxIsolation)}
            disabled={busy || open}
            title={
              open
                ? 'Isolation applies to the next transaction'
                : 'Snapshot gives a stable view but holds it for the whole transaction'
            }
            className="rounded border border-edge bg-canvas px-1 py-0.5 text-fg-subtle disabled:opacity-50"
          >
            {(Object.keys(ISOLATION_LABELS) as TxIsolation[]).map((key) => (
              <option key={key} value={key}>
                {ISOLATION_LABELS[key]}
              </option>
            ))}
          </select>

          <select
            aria-label="Lock resolution"
            value={status.config.locking.kind}
            onChange={(e) =>
              setLocking(
                e.target.value === 'wait' ? { kind: 'wait', timeoutSecs: 10 } : { kind: 'noWait' },
              )
            }
            disabled={busy || open}
            title="On a lock conflict: fail immediately, or wait for the other transaction"
            className="rounded border border-edge bg-canvas px-1 py-0.5 text-fg-subtle disabled:opacity-50"
          >
            <option value="noWait">No wait</option>
            <option value="wait">Wait 10s</option>
          </select>

          <button
            type="button"
            onClick={onCommit}
            disabled={busy || !open}
            className="inline-flex items-center gap-1 rounded border border-success bg-success-subtle px-2 py-0.5 font-medium text-success transition-colors disabled:opacity-40"
          >
            <Check className="h-3 w-3" /> Commit
          </button>
          <button
            type="button"
            onClick={onRollback}
            disabled={busy || !open}
            className="inline-flex items-center gap-1 rounded border border-danger bg-danger-subtle px-2 py-0.5 font-medium text-danger transition-colors disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" /> Rollback
          </button>
        </>
      )}

      <span
        className={`inline-flex items-center gap-1 font-mono tabular-nums ${
          level === 'stale'
            ? 'text-danger'
            : level === 'lingering'
              ? 'text-warning'
              : 'text-fg-subtle'
        }`}
        title={warning ?? undefined}
        data-testid="transaction-summary"
      >
        {open && level !== 'fresh' && <AlertTriangle className="h-3 w-3" />}
        {summary}
      </span>
    </div>
  );
}

export { formatTxAge };
