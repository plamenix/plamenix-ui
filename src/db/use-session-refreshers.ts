import { useCallback, useEffect, useRef } from 'react';
import type { CryptState, Schema, TxStatus } from './types.js';

/**
 * The four reads a shell fires after connecting, and after anything
 * that might have changed what they report.
 *
 * Each was eight to twelve lines in both shells, differing only in the
 * transport call. What is worth having in one place is not the plumbing
 * but the policy underneath it: each of these fails differently on
 * purpose, and "differently on purpose" is precisely what drifts when
 * it lives in two files.
 *
 * - **Schema** failing sets the tab's error. The object list is how the
 *   user navigates; its absence is not cosmetic and should not be
 *   silent.
 * - **Crypt state** and **engine version** failing clear their values.
 *   Both drive badges. A stale badge is worse than an absent one — it
 *   describes a database or a server that may no longer be there.
 * - **Transaction status** failing does nothing at all, not even a
 *   clear. It is polled after anything that can change it — connect,
 *   execute, commit, rollback — so the indicator reflects the session
 *   rather than what the UI last assumed, and the next real operation
 *   will report an underlying problem with better context than a status
 *   read can.
 */

/** The edition-specific reads. */
export interface SessionReadAdapter {
  cryptState: (sessionId: string) => Promise<CryptState>;
  /** Engine version string; blank counts as absent. */
  engineVersion: (sessionId: string) => Promise<string>;
  describeSchema: (sessionId: string) => Promise<Schema>;
  transactionStatus: (sessionId: string) => Promise<TxStatus>;
}

/** Tab fields these write. */
export interface SessionRefreshPatch {
  cryptState?: CryptState | null;
  engineVersion?: string | null;
  lastPingAt?: number;
  schema?: Schema;
  txStatus?: TxStatus;
  error?: string;
}

export interface UseSessionRefreshersOptions {
  adapter: SessionReadAdapter;
  patchTab: (tabId: string, patch: SessionRefreshPatch) => void;
}

export interface SessionRefreshers {
  refreshCryptState: (tabId: string, sessionId: string) => Promise<void>;
  refreshEngineVersion: (tabId: string, sessionId: string) => Promise<void>;
  refreshSchema: (tabId: string, sessionId: string) => Promise<void>;
  refreshTxStatus: (tabId: string, sessionId: string) => Promise<void>;
}

export function useSessionRefreshers({
  adapter,
  patchTab,
}: UseSessionRefreshersOptions): SessionRefreshers {
  const latest = useRef({ adapter, patchTab });
  // In an effect, not during render: a render-time write is visible to
  // a render React may then discard.
  useEffect(() => {
    latest.current = { adapter, patchTab };
  });

  const refreshCryptState = useCallback(async (tabId: string, sessionId: string) => {
    const { adapter: a, patchTab: patch } = latest.current;
    try {
      patch(tabId, { cryptState: await a.cryptState(sessionId) });
    } catch {
      patch(tabId, { cryptState: null });
    }
  }, []);

  const refreshEngineVersion = useCallback(async (tabId: string, sessionId: string) => {
    const { adapter: a, patchTab: patch } = latest.current;
    try {
      const version = (await a.engineVersion(sessionId)).trim();
      // `lastPingAt` only on success: this read is also a liveness
      // probe, and stamping it after a failure would make a dead
      // session look recently seen.
      patch(tabId, { engineVersion: version.length > 0 ? version : null, lastPingAt: Date.now() });
    } catch {
      patch(tabId, { engineVersion: null });
    }
  }, []);

  const refreshSchema = useCallback(async (tabId: string, sessionId: string) => {
    const { adapter: a, patchTab: patch } = latest.current;
    try {
      patch(tabId, { schema: await a.describeSchema(sessionId) });
    } catch (err) {
      patch(tabId, { error: String(err) });
    }
  }, []);

  const refreshTxStatus = useCallback(async (tabId: string, sessionId: string) => {
    const { adapter: a, patchTab: patch } = latest.current;
    try {
      patch(tabId, { txStatus: await a.transactionStatus(sessionId) });
    } catch {
      // Deliberately nothing. Clearing `txStatus` here would tell the
      // user their transaction is gone on the strength of one failed
      // read, and an open transaction they believe is closed is the
      // worse of the two mistakes.
    }
  }, []);

  return { refreshCryptState, refreshEngineVersion, refreshSchema, refreshTxStatus };
}
