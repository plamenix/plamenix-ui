/**
 * Reactive read-side access to the contribution registry without the
 * `<PluginOutlet>` render-prop wrapper.
 *
 * Use this when shell code needs to enumerate contributions for a
 * non-render purpose:
 *
 * - The command palette builds a list of palette entries from the
 *   `commands` point.
 * - Keybinding compilation walks `keybindings` to register handlers.
 * - Menu builders consume `menus` for context menus that aren't
 *   directly under an outlet.
 * - Diagnostics-providers list reads `diagnostics_providers` and runs
 *   each provider against the active editor buffer.
 *
 * Use [`PluginOutlet`] instead when you just want to render the
 * contributions inline — it wraps this hook plus a render prop.
 */

import { useSyncExternalStore } from 'react';
import { registry } from './registry.js';
import type { Contribution, ExtensionPoint } from './types.js';

export interface PluginContribution<Payload = unknown> {
  pluginId: string;
  contribution: Contribution<Payload>;
}

/**
 * Returns the currently registered contributions for `point`, sorted
 * by priority (lower first). Re-renders the calling component when
 * contributions are added or removed at the point. Reference-stable
 * across no-op re-renders so consumers can pass the array directly to
 * `useMemo` deps lists.
 */
export function usePluginContributions<Payload = unknown>(
  point: ExtensionPoint,
): ReadonlyArray<PluginContribution<Payload>> {
  return useSyncExternalStore(
    (listener) => registry.subscribe(point, listener),
    () => registry.getContributions<Payload>(point) as ReadonlyArray<PluginContribution<Payload>>,
    () => registry.getContributions<Payload>(point) as ReadonlyArray<PluginContribution<Payload>>,
  );
}
