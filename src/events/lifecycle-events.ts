/**
 * Lifecycle events (I6.3) — first concrete emit family on the I6.1
 * event bus.
 *
 * Five topics fire across the app lifetime + the plugin lifecycle:
 *
 *   - `app/started`           — once, at shell mount
 *   - `app/shutdown`          — once, at shell unmount / window
 *                                close
 *   - `plugin/activated`      — once per `loadPluginUi(...)` success
 *   - `plugin/deactivated`    — once per `unloadPluginUi(...)` success
 *   - `plugin/crashed`        — when `activate()` / `deactivate()`
 *                                throws (the host catches + emits;
 *                                contributions still roll back)
 *
 * Payload shapes are exported as named types so subscribers can
 * `eventBus.subscribe<AppStartedPayload>('app/started', ...)` and get
 * typed payloads without round-tripping through `unknown`. The topic
 * constants are exported for the same reason — subscribers and
 * emitters reference the same string symbol instead of typing the
 * topic literal twice and risking drift.
 *
 * The hook `useEmitLifecycleEvents(opts)` wires the app-level events:
 * shell editions call it once at App mount. The plugin-level events
 * fire from `loader.ts` (`loadPluginUi` / `unloadPluginUi`) — no host
 * wiring needed for them.
 */

import { useEffect } from 'react';
import { eventBus } from './event-bus.js';

/** Topic literals — exported so emitters + subscribers share the
 *  same symbol. */
export const APP_STARTED = 'app/started' as const;
export const APP_SHUTDOWN = 'app/shutdown' as const;
export const PLUGIN_ACTIVATED = 'plugin/activated' as const;
export const PLUGIN_DEACTIVATED = 'plugin/deactivated' as const;
export const PLUGIN_CRASHED = 'plugin/crashed' as const;

export interface AppStartedPayload {
  /** Shell edition reporting the start (e.g. `'desktop'`, `'web'`). */
  edition: string;
  /** Host SemVer at boot time (the value `host.host-version()`
   *  returns to plugins). */
  hostVersion: string;
  /** Wall-clock epoch ms at the emit site. Useful for "session
   *  duration" subscribers. */
  startedAt: number;
}

export interface AppShutdownPayload {
  /** Wall-clock epoch ms at the emit site. */
  shutdownAt: number;
  /** What triggered the shutdown — `'unmount'` (React tree dropped)
   *  or `'beforeunload'` (browser window closing). The latter is
   *  best-effort: web browsers may not give us enough time before
   *  the page actually unloads. */
  reason: 'unmount' | 'beforeunload';
}

export interface PluginActivatedPayload {
  /** Plugin id from the ui module's `default.id` (or the loader's
   *  explicit id arg). */
  pluginId: string;
  /** Wall-clock epoch ms at the emit site. */
  activatedAt: number;
}

export interface PluginDeactivatedPayload {
  pluginId: string;
  deactivatedAt: number;
}

export interface PluginCrashedPayload {
  pluginId: string;
  /** Which lifecycle hook the plugin threw in. */
  phase: 'activate' | 'deactivate';
  /** Error message captured from the thrown value (stack omitted to
   *  keep the payload JSON-serialisable for cross-bus bridging). */
  error: string;
  /** Wall-clock epoch ms at the emit site. */
  crashedAt: number;
}

/** Emits `app/started`. Exposed for unit-test direct invocation +
 *  for host edition wiring that prefers to fire imperatively
 *  (rather than via the `useEmitLifecycleEvents` hook). */
export function emitAppStarted(payload: AppStartedPayload): void {
  eventBus.emit<AppStartedPayload>(APP_STARTED, payload);
}

/** Emits `app/shutdown`. Same imperative-escape rationale as
 *  `emitAppStarted`. */
export function emitAppShutdown(payload: AppShutdownPayload): void {
  eventBus.emit<AppShutdownPayload>(APP_SHUTDOWN, payload);
}

export function emitPluginActivated(payload: PluginActivatedPayload): void {
  eventBus.emit<PluginActivatedPayload>(PLUGIN_ACTIVATED, payload);
}

export function emitPluginDeactivated(payload: PluginDeactivatedPayload): void {
  eventBus.emit<PluginDeactivatedPayload>(PLUGIN_DEACTIVATED, payload);
}

export function emitPluginCrashed(payload: PluginCrashedPayload): void {
  eventBus.emit<PluginCrashedPayload>(PLUGIN_CRASHED, payload);
}

export interface UseEmitLifecycleEventsOptions {
  edition: string;
  hostVersion: string;
}

/**
 * React hook that emits `app/started` on shell mount and
 * `app/shutdown` on unmount + on `window.beforeunload`. Call once at
 * the top of the shell's App component:
 *
 *   useEmitLifecycleEvents({ edition: 'desktop', hostVersion: '1.0.0-beta' });
 *
 * The hook is idempotent across re-renders (effect deps empty) — it
 * fires exactly one start + one shutdown per shell lifetime.
 */
export function useEmitLifecycleEvents(opts: UseEmitLifecycleEventsOptions): void {
  useEffect(() => {
    const startedAt = Date.now();
    emitAppStarted({
      edition: opts.edition,
      hostVersion: opts.hostVersion,
      startedAt,
    });

    let firedShutdown = false;
    const fireShutdown = (reason: AppShutdownPayload['reason']) => {
      if (firedShutdown) return;
      firedShutdown = true;
      emitAppShutdown({ shutdownAt: Date.now(), reason });
    };

    const onBeforeUnload = () => fireShutdown('beforeunload');
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', onBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', onBeforeUnload);
      }
      fireShutdown('unmount');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
