/**
 * Hook that returns the host-injected [`PluginAPI`] for plugin code.
 *
 * Plugin code runs in the host's React tree (no iframe / Worker — the
 * Wasm sandbox protects the Rust half; the JS half is "trusted" per
 * the architecture's anti-pattern list: see
 * `plamenix/docs/plugin-architecture.md` §15). The host wraps each
 * plugin's React subtree in a [`PluginAPIProvider`] (added in I2.3);
 * `usePluginAPI` reads from that context.
 *
 * I2.1 ships only the provider skeleton + a placeholder hook that
 * throws if used outside a provider. I2.3 fleshes out the command +
 * event surface; I6 wires the event-bus subscribe path.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { PluginAPI } from './types.js';

const PluginAPIContext = createContext<PluginAPI | null>(null);

export interface PluginAPIProviderProps {
  api: PluginAPI;
  children: ReactNode;
}

/**
 * Wraps a plugin's React subtree with the host-provided API. Hosts
 * call this once per active plugin around any `<PluginOutlet>` whose
 * children include plugin-supplied components.
 */
export function PluginAPIProvider({ api, children }: PluginAPIProviderProps): ReactNode {
  return <PluginAPIContext.Provider value={api}>{children}</PluginAPIContext.Provider>;
}

/**
 * Plugin-side hook returning the API the host injected. Throws when
 * called outside a [`PluginAPIProvider`] — that almost always means
 * the host forgot to wrap a plugin contribution, since plugin code
 * should never be rendered outside the host's outlet machinery.
 */
export function usePluginAPI(): PluginAPI {
  const api = useContext(PluginAPIContext);
  if (!api) {
    throw new Error(
      'usePluginAPI must be called inside a <PluginAPIProvider> — host did not wrap the plugin subtree',
    );
  }
  return api;
}
