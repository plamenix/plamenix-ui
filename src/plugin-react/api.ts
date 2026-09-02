/**
 * Factory that binds a plugin id to a set of [`PluginHostBindings`],
 * producing the [`PluginAPI`] surface plugin code consumes.
 *
 * The indirection between `PluginAPI` (plugin-facing, pluginId already
 * bound) and `PluginHostBindings` (host-facing, takes pluginId per
 * call) lets the host edition keep one shared binding implementation
 * across all loaded plugins while plugins see the simpler bound form.
 *
 * Capability enforcement is the host's job — `createPluginAPI` is a
 * pure adapter. Bindings reject calls the plugin lacks permission for
 * by throwing [`PluginPermissionDenied`].
 */

import type {
  Disposable,
  EventHandler,
  LogLevel,
  NotifyLevel,
  PluginAPI,
  PluginHostBindings,
} from './types.js';

export function createPluginAPI(
  pluginId: string,
  bindings: PluginHostBindings,
): PluginAPI {
  return {
    pluginId,
    log: (level: LogLevel, message: string): void => {
      bindings.log(pluginId, level, message);
    },
    notify: (level: NotifyLevel, message: string): void => {
      bindings.notify(pluginId, level, message);
    },
    invokeCommand: async <Result = unknown>(
      commandId: string,
      args?: unknown,
    ): Promise<Result> => {
      const out = await bindings.invokeCommand(pluginId, commandId, args);
      return out as Result;
    },
    getSetting: (key: string): Promise<string | null> =>
      bindings.getSetting(pluginId, key),
    setSetting: (key: string, value: string): Promise<void> =>
      bindings.setSetting(pluginId, key, value),
    subscribe: <Payload = unknown>(
      topic: string,
      handler: EventHandler<Payload>,
    ): Disposable =>
      bindings.subscribe(pluginId, topic, handler as EventHandler),
  };
}

/**
 * Host-utility: builds bindings that throw `Error('not wired')` for
 * methods the host hasn't connected yet. Useful for the shell to
 * stand up a `PluginAPIProvider` early in boot while the real
 * transport / event bus / settings store are still initialising.
 *
 * Each unwired method throws with a descriptive message identifying
 * the missing host capability + the calling plugin id so the operator
 * sees which integration is incomplete.
 */
export function unwiredBindings(): PluginHostBindings {
  const msg = (pluginId: string, cap: string) =>
    `plugin "${pluginId}" called ${cap}() but the host has not wired bindings yet`;
  return {
    log: (pluginId) => {
      throw new Error(msg(pluginId, 'log'));
    },
    notify: (pluginId) => {
      throw new Error(msg(pluginId, 'notify'));
    },
    invokeCommand: (pluginId) => Promise.reject(new Error(msg(pluginId, 'invokeCommand'))),
    getSetting: (pluginId) => Promise.reject(new Error(msg(pluginId, 'getSetting'))),
    setSetting: (pluginId) => Promise.reject(new Error(msg(pluginId, 'setSetting'))),
    subscribe: (pluginId) => {
      throw new Error(msg(pluginId, 'subscribe'));
    },
  };
}
