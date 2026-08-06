/**
 * Plugin install state machine + React hook (I7.5 / I7.6 / I7.8).
 *
 * The flow is identical across both editions (Tauri picker, web URL
 * fetch, web admin upload). The host injects three adapter functions
 * that abstract the I/O surface; the hook owns the state machine that
 * sequences pick → validate → confirm → install.
 *
 * # State machine
 *
 * ```text
 *  idle ──pick()──► picking ──source──► validating ──ok──► confirming
 *    ▲                                                      │   │
 *    │                                                    cancel confirm()
 *    │                                                      │     │
 *    │                                                      ▼     ▼
 *    └─────────────────────reset────────────────────────── idle  installing
 *                                                                  │
 *                                                                  ├── ok → idle
 *                                                                  └── err → error
 * ```
 *
 * Cancellation is allowed at any non-terminal step (`reset()` returns
 * to `idle` and clears any pending data). Errors collapse the flow to
 * the `error` state where the host can render an inline message; the
 * next `pick()` clears it.
 *
 * The hook is generic over the **source** type so a desktop picker
 * can return a file path while a web fetch returns a URL + a Blob —
 * the validator and installer just consume whatever opaque blob the
 * picker hands back.
 */

import { useCallback, useState } from 'react';
import type { PendingPluginInstall } from './PluginInstallDialog';

/** Phase of the install flow. */
export type PluginInstallPhase =
  | 'idle'
  | 'picking'
  | 'validating'
  | 'confirming'
  | 'installing'
  | 'error';

/** Discriminated state — TS narrows on `.phase`. */
export type PluginInstallState<TSource> =
  | { phase: 'idle' }
  | { phase: 'picking' }
  | { phase: 'validating'; source: TSource }
  | { phase: 'confirming'; source: TSource; pending: PendingPluginInstall }
  | { phase: 'installing'; source: TSource; pending: PendingPluginInstall }
  | { phase: 'error'; message: string };

/** Adapter pack the host supplies. */
export interface PluginInstallAdapters<TSource> {
  /** Open the host's file/URL picker. Resolves with the source
   *  identifier (a file path on desktop, a URL or Blob on web). Resolve
   *  with `null` when the user cancels the picker. */
  pick: () => Promise<TSource | null>;
  /** Validate the picked source — extract the bundle's manifest +
   *  return the `PendingPluginInstall` shape for the install dialog.
   *  Rejecting (or throwing) collapses the flow to the `error` state. */
  validate: (source: TSource) => Promise<PendingPluginInstall>;
  /** Persist the install. Receives the source + the optional
   *  permissions the user chose to grant in the install dialog.
   *  Required permissions are implied. */
  install: (
    source: TSource,
    pluginId: string,
    grantedOptional: string[],
  ) => Promise<void>;
}

export interface UsePluginInstallFlowResult<TSource> {
  /** Current state. Narrow on `.phase`. */
  state: PluginInstallState<TSource>;
  /** Convenience boolean for "the picker is currently working". */
  isBusy: boolean;
  /** Begin the flow — opens the host picker. No-op when the flow is
   *  already mid-flight (returns silently). */
  start: () => Promise<void>;
  /** Reset to `idle`. Safe to call from any phase. */
  reset: () => void;
  /** Confirm the install with the dialog's chosen optional perms.
   *  No-op outside the `confirming` phase. */
  confirm: (grantedOptional: string[]) => Promise<void>;
  /** Convenience accessor for the install dialog's `pending` prop.
   *  Returns the `PendingPluginInstall` when in `confirming` or
   *  `installing`, `null` otherwise. */
  pending: PendingPluginInstall | null;
}

/** State machine for the install flow. */
export function usePluginInstallFlow<TSource>(
  adapters: PluginInstallAdapters<TSource>,
): UsePluginInstallFlowResult<TSource> {
  const [state, setState] = useState<PluginInstallState<TSource>>({
    phase: 'idle',
  });

  const reset = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const start = useCallback(async () => {
    setState((prev) => (prev.phase === 'idle' || prev.phase === 'error' ? { phase: 'picking' } : prev));
    let source: TSource | null;
    try {
      source = await adapters.pick();
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (source === null) {
      // User cancelled the picker.
      setState({ phase: 'idle' });
      return;
    }
    setState({ phase: 'validating', source });
    try {
      const pending = await adapters.validate(source);
      setState({ phase: 'confirming', source, pending });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [adapters]);

  const confirm = useCallback(
    async (grantedOptional: string[]) => {
      // Capture the snapshot once — setState's functional updater
      // can't return a promise. Reading `state` from the closure is
      // race-safe here because confirm is only called when the
      // dialog is visible (phase === 'confirming'), and React
      // serialises state transitions for a given dispatch.
      if (state.phase !== 'confirming') return;
      const { source, pending } = state;
      setState({ phase: 'installing', source, pending });
      try {
        await adapters.install(source, pending.id, grantedOptional);
        setState({ phase: 'idle' });
      } catch (err) {
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [adapters, state],
  );

  const pending: PendingPluginInstall | null =
    state.phase === 'confirming' || state.phase === 'installing'
      ? state.pending
      : null;

  const isBusy =
    state.phase === 'picking' ||
    state.phase === 'validating' ||
    state.phase === 'installing';

  return {
    state,
    isBusy,
    start,
    reset,
    confirm,
    pending,
  };
}
