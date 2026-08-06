/**
 * Internal-server pattern — built-in features register through the
 * same registry third-party plugins use.
 *
 * Per `plamenix/docs/plugin-architecture.md` §6 (VSCode model), the
 * shell ships first-party "internal-server" contributions that look
 * identical to third-party plugins from the registry's perspective.
 * The BLOB renderer, the 5 export formats, the 32 Firebird tips, the
 * RECREATE TABLE schema action — all of these become builtins
 * registering through this surface in Section I4. The pattern lives
 * here from I3.3 so future built-in extractions slot in without each
 * having to reinvent the registration shape.
 *
 * Plugin id namespacing: built-ins prefix their id with
 * `@plamenix-builtin/`. Plugins from the marketplace or sideloaded
 * use reverse-DNS (`dev.plamenix.hello`, `com.example.csv-export`,
 * etc.). The `isBuiltinPlugin(id)` discriminator lets consumers
 * (Permissions panel, uninstall flow, debug overlays) treat the two
 * differently — e.g. uninstall is disabled for built-ins, badge is
 * different in the plugin list — while contributions themselves
 * compose in the same ordered slot per extension point.
 */

import { registerContributions, unregisterPlugin } from './registry.js';
import type { PluginContributions } from './types.js';

/**
 * Reserved id prefix for built-in (host-shipped) contributions.
 * Marketplace plugin id rules disallow this prefix so collisions
 * cannot happen.
 */
export const BUILTIN_NAMESPACE = '@plamenix-builtin/';

/** Composes the full registry id for a built-in name. */
export function builtinId(name: string): string {
  if (name.length === 0) {
    throw new Error('builtin name must be non-empty');
  }
  if (name.startsWith(BUILTIN_NAMESPACE)) {
    throw new Error(
      `built-in name must not already include the "${BUILTIN_NAMESPACE}" prefix: got ${JSON.stringify(name)}`,
    );
  }
  return `${BUILTIN_NAMESPACE}${name}`;
}

/** True when the supplied id is a built-in (host-shipped) plugin. */
export function isBuiltinPlugin(pluginId: string): boolean {
  return pluginId.startsWith(BUILTIN_NAMESPACE);
}

/**
 * Registers built-in contributions. Thin wrapper around
 * [`registerContributions`] that prefixes `name` with
 * [`BUILTIN_NAMESPACE`]. Call once per built-in feature module at
 * shell boot — the registration is process-wide and persists until
 * [`unregisterBuiltin`] is called or the host process exits.
 *
 * @throws when `name` is empty, already prefixed, or a built-in by
 * the same name is already registered (re-registration is treated as
 * a typo — call `unregisterBuiltin` first if intentional).
 */
export function registerBuiltin(name: string, bundle: PluginContributions): void {
  registerContributions(builtinId(name), bundle);
}

/** Drops every contribution registered under the named built-in. */
export function unregisterBuiltin(name: string): void {
  unregisterPlugin(builtinId(name));
}
