/**
 * In-process contribution registry.
 *
 * **One singleton shared by plugin authors AND the host shell.**
 *
 * The VSCode model (per `plamenix/docs/plugin-architecture.md` §4):
 * built-in features register through the same API third-party plugins
 * use. Plamenix follows this — the registry has two client surfaces:
 *
 * - **Plugin authors** call [`registerContributions`] /
 *   [`unregisterPlugin`] from their `ui.mjs` default export's static
 *   `contributions` field (the loader auto-registers on
 *   `loadPluginUi`).
 * - **Shell host** code (Plamenix UI's own first-party features —
 *   built-in cell renderers, exports, schema actions) calls the same
 *   functions to register itself; the host is just a plugin that
 *   ships in-binary.
 *
 * Both sides import from `@plamenix/ui/plugin-react`. The registry is
 * a process-wide singleton in that bundle; the shell host importing
 * the SDK subpath gets the same `registry` instance plugins do, so
 * built-in + third-party contributions live in the same ordered list
 * per extension point. No re-export from the main `@plamenix/ui`
 * bundle exists — that would duplicate the registry in two bundle
 * scopes and break the singleton.
 *
 * Subscribers consume via [`useSyncExternalStore`]: the
 * [`PluginOutlet`] slot component is the most common consumer, but
 * non-render shell code (menu builders, palette indexers,
 * keybinding compilers) uses the [`usePluginContributions`] hook for
 * direct access without a render prop.
 *
 * Implementation note: a hand-rolled observable Map is intentionally
 * preferred over Zustand here. Plugin authors get **zero new
 * peerDependencies** — they only need React (already required), so the
 * subpath export stays cheap to consume. The full `@plamenix/ui`
 * package ships Zustand for its own internal stores, but the
 * plugin-react surface stays leaner.
 */

import type { Contribution, ExtensionPoint, PluginContributions } from './types.js';

interface InternalContribution<Payload = unknown> {
  pluginId: string;
  contribution: Contribution<Payload>;
}

type Listener = () => void;

class ContributionRegistry {
  private byPoint: Map<ExtensionPoint, InternalContribution[]> = new Map();
  private byPlugin: Map<string, Set<ExtensionPoint>> = new Map();
  private listeners: Map<ExtensionPoint, Set<Listener>> = new Map();
  private snapshots: Map<ExtensionPoint, InternalContribution[]> = new Map();

  /** Register every contribution in the bundle under one plugin id. */
  registerContributions(pluginId: string, bundle: PluginContributions): void {
    if (this.byPlugin.has(pluginId)) {
      throw new Error(
        `plugin "${pluginId}" already registered contributions; call unregisterPlugin first`,
      );
    }

    const touched = new Set<ExtensionPoint>();
    for (const [point, items] of Object.entries(bundle) as Array<
      [ExtensionPoint, Contribution[] | undefined]
    >) {
      if (!items || items.length === 0) continue;
      const existing = this.byPoint.get(point) ?? [];
      for (const item of items) {
        existing.push({ pluginId, contribution: item });
      }
      sortByPriority(existing);
      this.byPoint.set(point, existing);
      touched.add(point);
    }

    this.byPlugin.set(pluginId, touched);
    for (const point of touched) {
      this.bumpSnapshot(point);
      this.notify(point);
    }
  }

  /** Drop every contribution registered under one plugin id. No-op
   *  when the plugin has no registered contributions. */
  unregisterPlugin(pluginId: string): void {
    const touched = this.byPlugin.get(pluginId);
    if (!touched) return;

    for (const point of touched) {
      const current = this.byPoint.get(point);
      if (!current) continue;
      const remaining = current.filter((entry) => entry.pluginId !== pluginId);
      if (remaining.length === 0) {
        this.byPoint.delete(point);
      } else {
        this.byPoint.set(point, remaining);
      }
      this.bumpSnapshot(point);
      this.notify(point);
    }

    this.byPlugin.delete(pluginId);
  }

  /**
   * Snapshot of contributions at one extension point. Returns the
   * same reference until something changes; `useSyncExternalStore`
   * uses referential equality to skip re-renders.
   */
  getContributions<Payload = unknown>(
    point: ExtensionPoint,
  ): ReadonlyArray<InternalContribution<Payload>> {
    return (this.snapshots.get(point) ?? EMPTY) as ReadonlyArray<InternalContribution<Payload>>;
  }

  /** Subscribe to changes at one extension point. Returns the
   *  unsubscribe function. */
  subscribe(point: ExtensionPoint, listener: Listener): () => void {
    let listeners = this.listeners.get(point);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(point, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
    };
  }

  /** Test-only escape hatch — fully clears the registry. Reserved
   *  for unit tests that share the singleton across cases. */
  __reset(): void {
    const points = Array.from(this.byPoint.keys());
    this.byPoint.clear();
    this.byPlugin.clear();
    this.snapshots.clear();
    for (const point of points) {
      this.notify(point);
    }
  }

  private bumpSnapshot(point: ExtensionPoint): void {
    const current = this.byPoint.get(point);
    this.snapshots.set(point, current ? current.slice() : []);
  }

  private notify(point: ExtensionPoint): void {
    const listeners = this.listeners.get(point);
    if (!listeners) return;
    for (const listener of listeners) listener();
  }
}

function sortByPriority(items: InternalContribution[]): void {
  items.sort((a, b) => {
    const pa = a.contribution.priority ?? 100;
    const pb = b.contribution.priority ?? 100;
    if (pa !== pb) return pa - pb;
    // Stable tiebreak by plugin id then contribution id so the order
    // is deterministic regardless of registration order.
    if (a.pluginId !== b.pluginId) return a.pluginId.localeCompare(b.pluginId);
    return a.contribution.id.localeCompare(b.contribution.id);
  });
}

const EMPTY: ReadonlyArray<InternalContribution> = Object.freeze([]);

/** Process-wide singleton. Plugin loader + PluginOutlet talk to this. */
export const registry: ContributionRegistry = new ContributionRegistry();

/** Re-export for the public API surface — plugin loaders call this
 *  after a successful `import(url)`. */
export function registerContributions(
  pluginId: string,
  bundle: PluginContributions,
): void {
  registry.registerContributions(pluginId, bundle);
}

/** Re-export — host calls this when a plugin is deactivated or
 *  uninstalled. */
export function unregisterPlugin(pluginId: string): void {
  registry.unregisterPlugin(pluginId);
}

/** Re-export — internal-server pattern: built-in features register
 *  through the same registry as third-party plugins. */
export type { InternalContribution };
