import { useEffect, useRef } from 'react';

/** Per-tab fields the probe loop needs to decide whether to ping and
 *  where to write the outcome. */
export interface HealthProbeTab {
  id: string;
  sessionId: string | null;
  busy: boolean;
  health: 'unknown' | 'healthy' | 'reconnecting' | 'dead';
}

/** Snapshot the probe loop applies to a tab once a ping settles. */
export interface HealthPatch {
  health: 'healthy' | 'dead';
  lastPingAt: number | null;
  /** Engine version reported by the ping (e.g. `'5.0.1'`). Present on
   *  successful pings; `null` on failure so the badge falls back to a
   *  neutral state until the next successful probe. */
  engineVersion: string | null;
}

export interface UseHealthProbeOptions {
  /** Live tab list; only entries with `sessionId !== null` are probed. */
  tabs: HealthProbeTab[];
  /** Edition-specific liveness check. Resolves with engine version on
   *  success; rejects on any failure. */
  ping: (sessionId: string) => Promise<string>;
  /** Patch handler the loop calls when a ping settles. Host typically
   *  routes this through its tab store. */
  onPatch: (tabId: string, patch: HealthPatch) => void;
  /** Polling cadence in milliseconds. Defaults to 30 s — light enough
   *  to spot a dead attachment within a minute, gentle enough not to
   *  hammer the server with N tabs open. */
  intervalMs?: number;
}

/**
 * Background health probe for active sessions.
 *
 * Walks `tabs` every `intervalMs`. For each tab that has a `sessionId`
 * and is not currently `busy` or `reconnecting`, fires the host's
 * `ping` and stamps the outcome through `onPatch`. Tabs without a
 * session (disconnected, fresh, or already dead awaiting manual
 * reconnect) are skipped entirely so the loop does not invent traffic.
 *
 * The hook owns no React state of its own; results land in the host's
 * tab store via `onPatch` so the rest of the shell (tab strip dot,
 * QueryPanel status pill) reads from the same source of truth as the
 * user-facing fields.
 */
export function useHealthProbe({
  tabs,
  ping,
  onPatch,
  intervalMs = 30_000,
}: UseHealthProbeOptions): void {
  const tabsRef = useRef(tabs);
  const pingRef = useRef(ping);
  const patchRef = useRef(onPatch);
  // Refreshed in an effect rather than during render: a render-time
  // write is visible to a render React may then discard, so under
  // concurrent rendering the loop below could probe against props from
  // a render that never committed. Declared first so the values are
  // current before the interval effect reads them.
  useEffect(() => {
    tabsRef.current = tabs;
    pingRef.current = ping;
    patchRef.current = onPatch;
  });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const snapshot = tabsRef.current;
      for (const tab of snapshot) {
        if (cancelled) return;
        if (tab.sessionId === null) continue;
        if (tab.busy) continue;
        if (tab.health === 'reconnecting') continue;
        const sessionId = tab.sessionId;
        try {
          const version = await pingRef.current(sessionId);
          if (cancelled) return;
          patchRef.current(tab.id, {
            health: 'healthy',
            lastPingAt: Date.now(),
            engineVersion: version.trim().length > 0 ? version.trim() : null,
          });
        } catch {
          if (cancelled) return;
          patchRef.current(tab.id, {
            health: 'dead',
            lastPingAt: null,
            engineVersion: null,
          });
        }
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
