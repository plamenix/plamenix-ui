import { useCallback, useEffect, useRef } from 'react';
import { connectionOpeningChain } from '../interceptors/connection-opening.js';
import type { ConnectionForm, TestConnectionResult } from './types.js';
import { useHealthProbe } from './use-health-probe.js';

/**
 * Connection lifecycle shared by both editions.
 *
 * Connect, reconnect, test, the background health probe, and
 * auto-reconnect existed twice — once in each shell's `App.tsx` — as
 * near-identical code. The only genuine difference was the shape of the
 * call underneath: the desktop shell invokes `db_connect` or
 * `profile_connect` through Tauri and spells "absent" as `null`, while
 * the web shell posts to `connect` or the profile REST endpoint and
 * spells it `undefined`. Everything above that — running the
 * `connection.opening` chain, the order fields are written to the tab,
 * which failures set `health: 'dead'` versus `error` — was the same,
 * and had already drifted in one place before this hook existed.
 *
 * So the edition supplies a {@link ConnectionAdapter} and this hook owns
 * the sequence. The library never reaches a host directly; see the
 * repository's `CLAUDE.md`.
 */

/** What the host needs to open a session. */
export interface ConnectRequest {
  /** The tab's current connection form. */
  form: ConnectionForm;
  /** Saved profile to connect by, or `null` for the typed-in details.
   *  Editions route these to different endpoints — the profile path
   *  never sends a password the host already holds. */
  profileId: string | null;
}

/** The edition-specific half of the connection lifecycle. */
export interface ConnectionAdapter {
  /** Opens a session. Rejects with a message fit to show the user. */
  connect: (request: ConnectRequest) => Promise<{ sessionId: string }>;
  /** Probes without opening a session, for the Test button. */
  testConnection: (form: ConnectionForm) => Promise<TestConnectionResult>;
  /** Liveness check. Resolves with the engine version string. */
  pingSession: (sessionId: string) => Promise<string>;
}

/** The subset of a tab this hook reads. */
export interface ConnectionTab {
  id: string;
  sessionId: string | null;
  form: ConnectionForm;
  selectedProfileId: string | null;
  profileName: string;
  busy: boolean;
  health: 'unknown' | 'healthy' | 'reconnecting' | 'dead';
}

/** Everything written back to a tab during the lifecycle. Deliberately
 *  loose: the host owns the tab store and this hook only names fields. */
export interface ConnectionPatch {
  sessionId?: string | null;
  results?: null;
  error?: string | null;
  busy?: boolean;
  testing?: boolean;
  testResult?: TestConnectionResult | null;
  cryptState?: null;
  health?: 'unknown' | 'healthy' | 'reconnecting' | 'dead';
  lastPingAt?: number | null;
  connectedAt?: number | null;
  engineVersion?: string | null;
}

export interface UseConnectionActionsOptions {
  adapter: ConnectionAdapter;
  /** The tab the user is acting on. */
  activeTab: ConnectionTab;
  /** Every tab, for the background probe. */
  tabs: ConnectionTab[];
  patchTab: (tabId: string, patch: ConnectionPatch) => void;
  renameTab: (tabId: string, title: string) => void;
  /** Title for a tab connected by typed-in details rather than a saved
   *  profile — `host/database`, which only the host can spell, since it
   *  is also what the profile-less recent-queries bucket is keyed by. */
  deriveTitle: (form: ConnectionForm) => string;
  /** Called after a session opens, for whatever the shell wants to load
   *  next — schema, crypt state, transaction status. Fire-and-forget by
   *  contract: nothing here should be able to fail a connect that
   *  already succeeded. */
  onConnected: (tabId: string, sessionId: string) => void;
  /** Whether a tab that dies should attempt one automatic reconnect.
   *  Read from the host's preference store. */
  autoReconnect: boolean;
  /** Health-probe cadence; forwarded to {@link useHealthProbe}. */
  probeIntervalMs?: number;
}

export interface ConnectionActions {
  /** Opens a session for the active tab, running the
   *  `connection.opening` interceptor chain first. */
  handleConnect: () => Promise<void>;
  /** Re-opens a session for a tab whose health has gone `dead`. Skips
   *  the interceptor chain: the user already approved this connection
   *  when it was first opened, and re-prompting on every network blip
   *  would train them to click through it. */
  handleReconnect: () => Promise<void>;
  /** Probes the current form without opening a session. */
  handleTestConnection: () => Promise<void>;
}

export function useConnectionActions({
  adapter,
  activeTab,
  tabs,
  patchTab,
  renameTab,
  deriveTitle,
  onConnected,
  autoReconnect,
  probeIntervalMs,
}: UseConnectionActionsOptions): ConnectionActions {
  // Everything the callbacks read goes through a ref so the callbacks
  // themselves stay stable. `handleReconnect` in particular is a
  // dependency of the auto-reconnect effect, and an identity that
  // changed on every keystroke in the connection form would re-run it.
  const latest = useRef({
    adapter,
    activeTab,
    patchTab,
    renameTab,
    deriveTitle,
    onConnected,
  });
  // Refreshed in an effect rather than during render. A render-time
  // write is visible to a render React may then throw away, which under
  // concurrent rendering means the callbacks below can read props from
  // a render that never committed. Declared before the other effects in
  // this hook so it is current by the time they run.
  useEffect(() => {
    latest.current = { adapter, activeTab, patchTab, renameTab, deriveTitle, onConnected };
  });

  const handleTestConnection = useCallback(async () => {
    const { adapter: a, activeTab: tab, patchTab: patch } = latest.current;
    patch(tab.id, { testing: true, testResult: null });
    try {
      patch(tab.id, { testResult: await a.testConnection(tab.form) });
    } catch (err) {
      // A rejected probe is a failed test, not a broken button. The
      // panel renders this the same way it renders a refusal from the
      // server, which is what the user needs to see either way.
      patch(tab.id, {
        testResult: { ok: false, firebirdVersion: null, error: String(err), durationMs: 0 },
      });
    } finally {
      patch(tab.id, { testing: false });
    }
  }, []);

  const handleConnect = useCallback(async () => {
    const {
      adapter: a,
      activeTab: tab,
      patchTab: patch,
      renameTab: rename,
      deriveTitle: title,
      onConnected: connected,
    } = latest.current;

    const decision = await connectionOpeningChain.run({
      tabId: tab.id,
      profileId: tab.selectedProfileId,
      host: tab.form.host,
      port: tab.form.port,
      database: tab.form.database,
      user: tab.form.user,
      pureRust: tab.form.pureRust,
      encryptionRequired: tab.form.encryptionRequired,
      charset: tab.form.charset,
    });
    if (decision.action === 'cancel') {
      patch(tab.id, { error: decision.reason });
      return;
    }

    // `cryptState: null` before the attempt, not after it: leaving the
    // previous session's badge up while a new connection is in flight
    // shows an encryption state that belongs to a database the user may
    // no longer be talking to.
    patch(tab.id, { error: null, busy: true, cryptState: null });
    try {
      const response = await a.connect({ form: tab.form, profileId: tab.selectedProfileId });
      patch(tab.id, {
        sessionId: response.sessionId,
        results: null,
        health: 'healthy',
        lastPingAt: Date.now(),
        connectedAt: Date.now(),
      });
      rename(tab.id, tab.profileName.trim() || title(tab.form));
      connected(tab.id, response.sessionId);
    } catch (err) {
      patch(tab.id, { error: String(err) });
    } finally {
      patch(tab.id, { busy: false });
    }
  }, []);

  const handleReconnect = useCallback(async () => {
    const { adapter: a, activeTab: tab, patchTab: patch } = latest.current;
    // Guarding on the tab's own health rather than a local flag: a
    // second attempt while one is in flight would race two sessions
    // into the same tab and leak whichever lost.
    if (tab.health === 'reconnecting') return;
    patch(tab.id, { health: 'reconnecting', error: null });
    try {
      const response = await a.connect({ form: tab.form, profileId: tab.selectedProfileId });
      patch(tab.id, {
        sessionId: response.sessionId,
        health: 'healthy',
        lastPingAt: Date.now(),
        connectedAt: Date.now(),
      });
      void a
        .pingSession(response.sessionId)
        .then((version) =>
          patch(tab.id, { engineVersion: version.trim().length > 0 ? version.trim() : null }),
        )
        .catch(() => patch(tab.id, { engineVersion: null }));
    } catch (err) {
      patch(tab.id, { health: 'dead', error: String(err) });
    }
  }, []);

  useHealthProbe({
    tabs,
    ping: (sessionId) => latest.current.adapter.pingSession(sessionId),
    onPatch: (tabId, patch) => latest.current.patchTab(tabId, patch),
    ...(probeIntervalMs === undefined ? {} : { intervalMs: probeIntervalMs }),
  });

  // One automatic attempt per death, per tab. `lastAutoDeadRef` is the
  // gate: without it a host that stays down turns every failed attach
  // into the trigger for the next one, and the tab spins.
  const lastAutoDeadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoReconnect || activeTab.health !== 'dead') {
      lastAutoDeadRef.current = null;
      return;
    }
    if (activeTab.busy) return;
    if (lastAutoDeadRef.current === activeTab.id) return;
    lastAutoDeadRef.current = activeTab.id;
    void handleReconnect();
  }, [activeTab.health, activeTab.busy, activeTab.id, autoReconnect, handleReconnect]);

  return { handleConnect, handleReconnect, handleTestConnection };
}
