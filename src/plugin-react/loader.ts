/**
 * ESM dynamic loader for plugin UI bundles.
 *
 * Two entry points, both env-agnostic:
 *
 * - [`loadPluginUi`] — hand it a URL the JS runtime can `import()`.
 *   The host edition decides the URL scheme: desktop converts an
 *   on-disk path via Tauri's `convertFileSrc`, web serves
 *   `/api/plugins/<id>/ui.mjs` from Fastify, tests use `blob:` /
 *   `data:`. Plugin-react itself does not import any edition-specific
 *   API (per `plamenix-ui/CLAUDE.md` transport-agnostic rule).
 *
 * - [`loadPluginUiFromBytes`] — hand it the raw bundle text (or
 *   bytes). The loader wraps it in a `Blob`, creates an object URL,
 *   delegates to [`loadPluginUi`], then revokes the URL after the
 *   module resolves so memory does not leak. This is the universal
 *   fallback for runtimes where direct URL imports are blocked by CSP
 *   (early Tauri versions with strict `script-src 'self'` policies)
 *   or where bundles arrive over IPC rather than over the network.
 *
 * Both paths use the browser's native dynamic `import()` so the plugin
 * bundle inherits the host's React + ReactDOM at runtime (rollup /
 * Vite externalise them at build time; the recipe lives in I2.6).
 * Failures surface as rejected promises that the host can render in
 * the Permissions panel (Section I7).
 *
 * I2.4 + I2.5 add edition-specific wrappers in the host repos; this
 * file stays edition-agnostic. I2.7 layers hot-reload via cache
 * busting on top of these primitives.
 */

import { registerContributions, unregisterPlugin } from './registry.js';
import { eventBus } from '../events/event-bus.js';
import {
  emitPluginActivated,
  emitPluginCrashed,
  emitPluginDeactivated,
} from '../events/lifecycle-events.js';
import type {
  Contribution,
  ExtensionPoint,
  PluginAPI,
  PluginContributions,
  PluginUiModule,
} from './types.js';

/**
 * Combines multiple [`PluginContributions`] bundles into one — used
 * by hosts that want to merge manifest-declared static contributions
 * (sidebar panels, theme names, tip-pack metadata, etc.) with the
 * dynamic contributions a plugin's `ui.mjs` default-exports.
 *
 * Per-point arrays are concatenated; downstream duplicate-id detection
 * is the registry's job. The merge is shallow — point arrays are
 * concatenated, not deduplicated. Mutates nothing; the result is a
 * fresh object.
 */
export function mergeContributions(
  ...bundles: ReadonlyArray<PluginContributions | undefined>
): PluginContributions {
  const out: Partial<Record<ExtensionPoint, Contribution[]>> = {};
  for (const bundle of bundles) {
    if (!bundle) continue;
    for (const [point, items] of Object.entries(bundle) as Array<
      [ExtensionPoint, Contribution[] | undefined]
    >) {
      if (!items || items.length === 0) continue;
      const existing = out[point] ?? [];
      out[point] = existing.concat(items);
    }
  }
  return out as PluginContributions;
}

export interface LoadOptions {
  /**
   * Static contributions the host wants merged into the plugin's
   * registration alongside whatever `ui.mjs` default-exports. Use
   * this to bridge manifest-declared contributions (sidebar panels,
   * theme names, tip-pack metadata) into the same single
   * `registerContributions` call the plugin's dynamic contributions
   * use, keeping one entry per plugin in the registry.
   *
   * Per-point arrays are concatenated; duplicate `(pluginId, id)`
   * tuples are still a registration error.
   */
  extraContributions?: PluginContributions;
}

/**
 * Loads a plugin UI bundle, registers its static contributions
 * (optionally merged with host-supplied `extraContributions`), and
 * (if the module exports one) calls `activate(api)`. Returns the
 * loaded module so the host can drive `deactivate` later.
 *
 * @throws when the URL fails to resolve, the module has no default
 * export, or `activate` rejects.
 */
export async function loadPluginUi(
  pluginId: string,
  url: string,
  api: PluginAPI,
  opts?: LoadOptions,
): Promise<PluginUiModule> {
  let mod: { default?: PluginUiModule };
  try {
    mod = (await import(/* @vite-ignore */ url)) as { default?: PluginUiModule };
  } catch (err) {
    throw new Error(
      `plugin "${pluginId}" UI bundle failed to load from ${url}: ${describe(err)}`,
    );
  }

  const module = mod.default;
  if (!module || typeof module !== 'object') {
    throw new Error(
      `plugin "${pluginId}" UI bundle at ${url} has no default export of type PluginUiModule`,
    );
  }

  const merged = mergeContributions(opts?.extraContributions, module.contributions);
  if (hasAnyContribution(merged)) {
    registerContributions(pluginId, merged);
  }

  if (module.activate) {
    try {
      await module.activate(api);
    } catch (err) {
      // Roll back the registration so a failing activate does not
      // leave contributions stranded in the registry. Same I6.2
      // event-bus auto-cleanup as the unload path: a partial
      // activate() may have set up subscriptions before throwing.
      unregisterPlugin(pluginId);
      eventBus.unsubscribeByPluginId(pluginId);
      // I6.3 — emit plugin/crashed BEFORE re-throwing so subscribers
      // see the failure even when the host swallows the throw
      // upstream. Emit after the rollback so a subscriber probing
      // the registry sees the cleaned-up state.
      emitPluginCrashed({
        pluginId,
        phase: 'activate',
        error: describe(err),
        crashedAt: Date.now(),
      });
      throw new Error(
        `plugin "${pluginId}" activate() threw: ${describe(err)}`,
      );
    }
  }

  // I6.3 — fires after a fully-successful load (registration + the
  // optional activate hook). Subscribers can rely on the plugin's
  // contributions being live in the registry by the time they see
  // the event.
  emitPluginActivated({ pluginId, activatedAt: Date.now() });

  return module;
}

function hasAnyContribution(bundle: PluginContributions): boolean {
  for (const items of Object.values(bundle)) {
    if (items && items.length > 0) return true;
  }
  return false;
}

/**
 * Loads a plugin UI bundle from its raw source text or bytes, by
 * encoding it as a `data:text/javascript;base64,…` URL and delegating
 * to [`loadPluginUi`].
 *
 * Use this when the host cannot expose the bundle as a fetchable URL
 * — for example, desktop hosts that read the bundle over a Tauri
 * command (Rust-side `fs::read_to_string`) and pass the text into the
 * webview rather than serving it through a custom protocol.
 *
 * **Why `data:` not `blob:`**: Node's ESM dynamic import accepts
 * `data:` URLs natively (so vitest can exercise this path under
 * jsdom), while `blob:` URLs require browser-only `URL.createObjectURL`
 * support that vitest does not bridge. Production browsers handle
 * both; `data:` is the lowest-friction common denominator. Host CSP
 * must allow `script-src 'self' data:` — most Tauri webviews allow
 * `data:` by default.
 *
 * Failure modes mirror [`loadPluginUi`] — a rejected promise surfaces
 * the failure with the plugin id baked into the message.
 *
 * @param pluginId Stable plugin identifier (matches the manifest `id`).
 * @param source Either the bundle's UTF-8 text or its raw bytes.
 * @param api Plugin-bound API surface (from {@link createPluginAPI}).
 */
export async function loadPluginUiFromBytes(
  pluginId: string,
  source: string | Uint8Array | ArrayBuffer,
  api: PluginAPI,
  opts?: LoadOptions,
): Promise<PluginUiModule> {
  const text =
    typeof source === 'string'
      ? source
      : new TextDecoder().decode(source instanceof Uint8Array ? source : new Uint8Array(source));
  const url = `data:text/javascript;base64,${encodeBase64Utf8(text)}`;
  return loadPluginUi(pluginId, url, api, opts);
}

/** UTF-8 → base64. `btoa` is global in browsers, jsdom, and Node ≥16,
 *  so a single path covers every target. The `encodeURIComponent` +
 *  `unescape` trick is the canonical workaround for `btoa`'s
 *  latin1-only input requirement; it round-trips arbitrary unicode
 *  bundles correctly. */
function encodeBase64Utf8(text: string): string {
  const utf8 = unescape(encodeURIComponent(text));
  return btoa(utf8);
}

/**
 * Hot-reload helper: drops the old plugin module + contributions and
 * loads the fresh one via the supplied `reload` callback. The reload
 * step is caller-supplied so plugin-react does not have to know
 * whether the host is fetching from a URL (and how to bust the cache)
 * or reading bytes over IPC.
 *
 * Order of operations:
 *
 * 1. [`unloadPluginUi`] — unregisters contributions, calls plugin's
 *    `deactivate()` if present. Errors recorded but not raised.
 * 2. `reload()` — caller's load step (`loadPluginUi(url + ?v=hash)`
 *    or `loadPluginUiFromBytes(freshBytes)`).
 *
 * Returns the new module + any deactivate error from step 1 so the
 * host can surface it independently of the reload success.
 *
 * The reload is **not atomic** — if `reload()` rejects, the plugin is
 * left unloaded (contributions cleared, no replacement registered).
 * Recovery is a fresh `loadPluginUi` once the caller addresses the
 * load failure (bad bundle, network down, etc.).
 */
export async function reloadPluginUi(
  pluginId: string,
  oldModule: PluginUiModule,
  reload: () => Promise<PluginUiModule>,
): Promise<{ module: PluginUiModule; deactivateError: Error | null }> {
  const { deactivateError } = await unloadPluginUi(pluginId, oldModule);
  const module = await reload();
  return { module, deactivateError };
}

/**
 * Releases a loaded plugin. Unregisters its contributions and (if the
 * module exposes one) calls `deactivate`. Errors during `deactivate`
 * are surfaced to the host but do **not** abort the unregister — a
 * crashed `deactivate` should not leave the plugin's slots active.
 */
export async function unloadPluginUi(
  pluginId: string,
  module: PluginUiModule,
): Promise<{ deactivateError: Error | null }> {
  unregisterPlugin(pluginId);
  // I6.2 — drop every event-bus subscription the plugin registered.
  // Auto-cleanup prevents a stale handler (closure over a torn-down
  // plugin's state) from firing on subsequent emits + bounds the bus's
  // memory footprint to the active plugin set.
  eventBus.unsubscribeByPluginId(pluginId);
  if (!module.deactivate) {
    // I6.3 — emit even when there's no deactivate hook; subscribers
    // care about the lifecycle transition, not whether the plugin
    // bothered to expose a teardown callback.
    emitPluginDeactivated({ pluginId, deactivatedAt: Date.now() });
    return { deactivateError: null };
  }
  try {
    await module.deactivate();
    emitPluginDeactivated({ pluginId, deactivatedAt: Date.now() });
    return { deactivateError: null };
  } catch (err) {
    // I6.3 — emit plugin/crashed for the deactivate-throw case +
    // ALSO emit plugin/deactivated (the plugin IS gone from the
    // registry + bus regardless of the throw). Subscribers can
    // correlate the two events by pluginId + timestamp proximity.
    emitPluginCrashed({
      pluginId,
      phase: 'deactivate',
      error: describe(err),
      crashedAt: Date.now(),
    });
    emitPluginDeactivated({ pluginId, deactivatedAt: Date.now() });
    return {
      deactivateError: new Error(
        `plugin "${pluginId}" deactivate() threw: ${describe(err)}`,
      ),
    };
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
