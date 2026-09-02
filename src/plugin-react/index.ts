/**
 * Public API for `@plamenix/ui/plugin-react` — the React SDK plugin
 * authors and host integrators consume.
 *
 * Plugin authors:
 * - Import [`PluginUiModule`], [`PluginContributions`],
 *   [`Contribution`], and [`ExtensionPoint`] to type-check their
 *   default-exported module.
 * - Optionally use [`usePluginAPI`] inside React components for
 *   runtime host-callable functions.
 *
 * Host integrators:
 * - Render `<PluginOutlet point="..." />` wherever contributions
 *   should appear.
 * - Call [`loadPluginUi`] / [`unloadPluginUi`] to manage plugin
 *   lifecycle.
 * - Wrap plugin-contributed React subtrees with
 *   [`PluginAPIProvider`] so [`usePluginAPI`] resolves.
 *
 * See `plamenix/docs/plugin-architecture.md` for the wider design and
 * `PLUGIN_TRACKER.md` for live status across Sections I0–I9.
 */

export type {
  Contribution,
  ContributionRenderer,
  Disposable,
  EventHandler,
  ExtensionPoint,
  LogLevel,
  NotifyLevel,
  PluginAPI,
  PluginComponent,
  PluginContributions,
  PluginHostBindings,
  PluginUiModule,
} from './types.js';
export { PluginPermissionDenied } from './types.js';

export { PluginOutlet, type PluginOutletProps } from './PluginOutlet.js';
export { PluginAPIProvider, usePluginAPI } from './usePluginAPI.jsx';
export {
  loadPluginUi,
  loadPluginUiFromBytes,
  mergeContributions,
  reloadPluginUi,
  unloadPluginUi,
  type LoadOptions,
} from './loader.js';
export { createPluginAPI, unwiredBindings } from './api.js';
export {
  registerContributions,
  unregisterPlugin,
  registry,
  type InternalContribution,
} from './registry.js';
export { usePluginContributions, type PluginContribution } from './usePluginContributions.js';
export {
  BUILTIN_NAMESPACE,
  builtinId,
  isBuiltinPlugin,
  registerBuiltin,
  unregisterBuiltin,
} from './builtin.js';
