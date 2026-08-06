/**
 * Public type surface for plugin authors.
 *
 * Plugin UI bundles ship a single default-exported `PluginUiModule`
 * (see [`PluginUiModule`]) that the host loads dynamically through
 * `loadPluginUi(url)`. Contributions inside the module are registered
 * with the in-process [`registry`] under the plugin's id; the
 * `<PluginOutlet>` slot component then renders matching contributions
 * at well-known extension points.
 *
 * This file deliberately exposes the **minimum** surface needed by
 * plugin authors. Adding a new contribution kind = adding a typed
 * field here + a registry-side dispatch path; both halves land
 * together so the public contract stays observable.
 */

import type { ComponentType, ReactNode } from 'react';

/**
 * Names of the extension points the host exposes. Mirrors the
 * `[[contributions.*]]` blocks the plugin manifest may declare. Adding
 * a new point is a SemVer-minor extension; renaming or removing one is
 * SemVer-major and ships under a new world version.
 *
 * Section I3 wires the first three consumers (cell_renderers,
 * export_formats, commands); the rest land in I5 as each shell
 * surface gets retrofitted to query the registry.
 */
export type ExtensionPoint =
  | 'cell_renderers'
  | 'cell_editors'
  | 'export_formats'
  | 'import_sources'
  | 'sidebar_panels'
  | 'toolbar_buttons'
  | 'object_inspectors'
  | 'schema_actions'
  | 'sql_formatters'
  | 'auth_providers'
  | 'tip_packs'
  | 'themes'
  | 'settings_panels'
  | 'dashboard_sections'
  | 'status_bar_items'
  | 'completion_providers'
  | 'diagnostics_providers'
  | 'commands'
  | 'keybindings'
  | 'menus';

/** A single contribution to one extension point. */
export interface Contribution<Payload = unknown> {
  /** Stable id within the plugin's namespace. Final registry key is
   *  `<plugin-id>:<id>` so two plugins can claim the same local id. */
  id: string;
  /** Optional priority — lower runs/renders first. Default `100`. */
  priority?: number;
  /** Optional `when` clause future-proofing dynamic visibility. The
   *  syntax mirrors VSCode's `when` expressions; for v1 the host
   *  evaluates only literal `true`. */
  when?: string;
  /** Point-specific payload — typed by the matching `ContributionMap`
   *  entry on the consumer side. */
  payload: Payload;
}

/**
 * Whole-plugin contribution bundle. Plugin authors default-export an
 * object matching this shape; the host's [`loadPluginUi`] loader hands
 * it to [`registerContributions`].
 *
 * Unknown extension point keys are ignored with a console warning —
 * forward-compatible for plugins targeting newer worlds than the host
 * implements. (Section I7 surfaces these warnings in the Permissions
 * panel.)
 */
export type PluginContributions = Partial<
  Record<ExtensionPoint, Contribution[]>
>;

/**
 * Module shape that a plugin's `ui.mjs` bundle exposes as `default`.
 *
 * Beyond static contributions a plugin may export an `activate`
 * function called by the host immediately after registration, mirroring
 * VSCode's extension-host lifecycle. `activate` receives the
 * [`PluginAPI`] surface for dynamic registrations (commands wired at
 * runtime, event subscriptions, etc. — landing in I3 + I6).
 *
 * Both fields are optional: a tip-pack plugin shipping only static
 * `tip_packs` contributions has no `activate`; a command-only plugin
 * may have only `activate` and no static contributions.
 */
export interface PluginUiModule {
  contributions?: PluginContributions;
  activate?: (api: PluginAPI) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

/** Severity level for `PluginAPI.log`. Mirrors `host.log-level` in WIT. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/** Severity level for `PluginAPI.notify`. Maps to shell toast variants. */
export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

/** Returned by `PluginAPI.subscribe`; plugin must dispose on unmount. */
export interface Disposable {
  dispose: () => void;
}

/** Handler for events delivered through `PluginAPI.subscribe`. */
export type EventHandler<Payload = unknown> = (payload: Payload) => void;

/**
 * Error thrown when a plugin call hits a capability the host has not
 * granted. Host's transport layer throws this from any method whose
 * manifest declaration required a permission that is not in the
 * plugin's `grantedPermissions` set. Plugin code may catch it to
 * degrade gracefully when an *optional* capability was denied.
 */
export class PluginPermissionDenied extends Error {
  override readonly name = 'PluginPermissionDenied';
  constructor(public readonly permission: string, message?: string) {
    super(message ?? `plugin lacks capability "${permission}"`);
  }
}

/**
 * Host-provided runtime bindings — concrete implementations of every
 * dynamic host capability the plugin can reach. The host edition
 * (desktop / web) constructs one of these from its existing
 * `Transport`, capability grant set, and event bus, then hands it to
 * [`createPluginAPI`].
 *
 * Method names map 1:1 to the methods on [`PluginAPI`]; the indirection
 * exists so the API factory can layer pluginId-binding and validation
 * without forcing every host edition to reimplement the same wrappers.
 */
export interface PluginHostBindings {
  log: (pluginId: string, level: LogLevel, message: string) => void;
  notify: (pluginId: string, level: NotifyLevel, message: string) => void;
  invokeCommand: (
    pluginId: string,
    commandId: string,
    args?: unknown,
  ) => Promise<unknown>;
  getSetting: (pluginId: string, key: string) => Promise<string | null>;
  setSetting: (pluginId: string, key: string, value: string) => Promise<void>;
  subscribe: (
    pluginId: string,
    topic: string,
    handler: EventHandler,
  ) => Disposable;
}

/**
 * Runtime API the host hands plugin code on `activate` and via
 * [`usePluginAPI`] inside React components.
 *
 * Every method is **already bound** to the calling plugin's id — plugin
 * code does not pass `pluginId` explicitly on each call. Capability
 * gates run inside the host's bindings (the Rust side for db / fs /
 * net imports, the TS shell for commands / notifications / settings).
 * A call to a method the plugin lacks the capability for rejects with
 * [`PluginPermissionDenied`].
 *
 * Event subscriptions returned by `subscribe` are auto-disposed when
 * the plugin deactivates; plugin React components that subscribe
 * inside `useEffect` must still call `.dispose()` on unmount to avoid
 * stale handlers firing into unmounted trees.
 */
export interface PluginAPI {
  /** Plugin's own id — passed in so plugin code does not have to
   *  hard-code or parse it from anywhere. */
  pluginId: string;
  /**
   * Forwards a log line to the host's tracing pipeline. Mirrors the
   * Rust `host.log` import so a plugin's two halves share one logging
   * shape.
   */
  log: (level: LogLevel, message: string) => void;
  /**
   * Surfaces a toast in the shell's notification viewport. Subject to
   * the plugin's `os:notify` capability when wired through to the
   * native OS notifier (I7); the in-browser toast variant is always
   * permitted because the user is already viewing the shell.
   */
  notify: (level: NotifyLevel, message: string) => void;
  /**
   * Invokes a host command by id. The result is the command's return
   * value; type-narrowing is the plugin's responsibility (the host
   * registry is open-ended). Throws [`PluginPermissionDenied`] when
   * the plugin lacks `command:invoke` for the named command.
   */
  invokeCommand: <Result = unknown>(commandId: string, args?: unknown) => Promise<Result>;
  /** Reads a per-plugin scoped setting. Returns `null` for absent keys. */
  getSetting: (key: string) => Promise<string | null>;
  /** Writes a per-plugin scoped setting. */
  setSetting: (key: string, value: string) => Promise<void>;
  /**
   * Subscribes to an event-bus topic. The host will deliver every
   * matching event to `handler`. Return value is a [`Disposable`]
   * the plugin must call to unsubscribe; failing to do so is a leak
   * the host cannot detect except by deactivation cleanup.
   */
  subscribe: <Payload = unknown>(
    topic: string,
    handler: EventHandler<Payload>,
  ) => Disposable;
}

/**
 * Convenience render-prop type used by [`PluginOutlet`] when the
 * consumer needs to interpose layout around each contribution.
 */
export type ContributionRenderer<Payload> = (args: {
  pluginId: string;
  contribution: Contribution<Payload>;
}) => ReactNode;

/**
 * React component shape for contributions that render UI directly
 * (sidebar panels, dashboard sections, etc.). Helper alias so plugin
 * authors do not have to import `ComponentType` from React themselves.
 */
export type PluginComponent<Props = Record<string, never>> = ComponentType<Props>;
