// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadPluginUi,
  loadPluginUiFromBytes,
  mergeContributions,
  reloadPluginUi,
  unloadPluginUi,
} from './loader.js';
import { createPluginAPI } from './api.js';
import { registry } from './registry.js';
import type { PluginAPI, PluginUiModule } from './types.js';

function silentBindings() {
  return {
    log: () => {},
    notify: () => {},
    invokeCommand: async () => null,
    getSetting: async () => null,
    setSetting: async () => {},
    subscribe: () => ({ dispose: () => {} }),
  };
}

function api(pluginId: string): PluginAPI {
  return createPluginAPI(pluginId, silentBindings());
}

/** Serialises a plugin module to a UTF-8 ESM source string the
 *  blob-loader can `import()`. Keeps tests self-contained: no need
 *  for fixtures on disk. */
function moduleSource(opts: {
  contributions?: string;
  activateBody?: string;
  deactivateBody?: string;
}): string {
  const fields: string[] = [];
  if (opts.contributions) fields.push(`contributions: ${opts.contributions}`);
  if (opts.activateBody !== undefined) {
    fields.push(`async activate(api) { ${opts.activateBody} }`);
  }
  if (opts.deactivateBody !== undefined) {
    fields.push(`async deactivate() { ${opts.deactivateBody} }`);
  }
  return `export default { ${fields.join(', ')} };\n`;
}

describe('loader (loadPluginUi + loadPluginUiFromBytes)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    registry.__reset();
  });

  it('loadPluginUiFromBytes registers contributions from a string source', async () => {
    const source = moduleSource({
      contributions: `{ cell_renderers: [{ id: 'json-tree', payload: { mime: 'application/json' } }] }`,
    });
    const mod = await loadPluginUiFromBytes('plg.blob', source, api('plg.blob'));
    expect(mod.contributions).toBeDefined();
    const snap = registry.getContributions('cell_renderers');
    expect(snap.map((s) => `${s.pluginId}:${s.contribution.id}`)).toEqual([
      'plg.blob:json-tree',
    ]);
  });

  it('loadPluginUiFromBytes calls activate() with the bound PluginAPI', async () => {
    // The activate body captures the pluginId we recover from the
    // injected API and stashes it on a global so the test can assert.
    const source = moduleSource({
      activateBody: `globalThis.__activatedFor = api.pluginId;`,
    });
    delete (globalThis as { __activatedFor?: unknown }).__activatedFor;
    await loadPluginUiFromBytes('plg.activate', source, api('plg.activate'));
    expect((globalThis as { __activatedFor?: string }).__activatedFor).toBe(
      'plg.activate',
    );
  });

  it('loadPluginUiFromBytes rolls back contribution registration when activate() throws', async () => {
    const source = moduleSource({
      contributions: `{ cell_renderers: [{ id: 'r', payload: {} }] }`,
      activateBody: `throw new Error('activate failed');`,
    });
    await expect(
      loadPluginUiFromBytes('plg.fail', source, api('plg.fail')),
    ).rejects.toThrow(/activate\(\) threw: activate failed/);
    expect(registry.getContributions('cell_renderers')).toHaveLength(0);
  });

  it('mergeContributions concatenates per-point arrays from multiple bundles', () => {
    const merged = mergeContributions(
      { cell_renderers: [{ id: 'from-manifest', payload: {} }] },
      { cell_renderers: [{ id: 'from-ui', payload: {} }], sidebar_panels: [{ id: 'panel', payload: {} }] },
    );
    expect(merged.cell_renderers?.map((c) => c.id)).toEqual(['from-manifest', 'from-ui']);
    expect(merged.sidebar_panels?.map((c) => c.id)).toEqual(['panel']);
  });

  it('mergeContributions ignores undefined bundles + empty arrays', () => {
    const merged = mergeContributions(
      undefined,
      { commands: [] },
      { commands: [{ id: 'real', payload: {} }] },
    );
    expect(merged.commands?.map((c) => c.id)).toEqual(['real']);
  });

  it('loadPluginUiFromBytes merges host-supplied extraContributions with ui.mjs contributions', async () => {
    const source = moduleSource({
      contributions: `{ sidebar_panels: [{ id: 'from-ui', payload: { label: 'UI' } }] }`,
    });
    await loadPluginUiFromBytes('plg.merge', source, api('plg.merge'), {
      extraContributions: {
        sidebar_panels: [{ id: 'from-manifest', payload: { label: 'MANIFEST' } }],
      },
    });
    const ids = registry
      .getContributions('sidebar_panels')
      .map((c) => c.contribution.id);
    // Host-supplied (manifest-static) contributions appear first;
    // ui.mjs-supplied dynamic ones follow.
    expect(ids).toEqual(['from-manifest', 'from-ui']);
  });

  it('extraContributions register even when the bundle has no contributions field', async () => {
    const source = moduleSource({ activateBody: `void 0;` });
    await loadPluginUiFromBytes('plg.manifest-only', source, api('plg.manifest-only'), {
      extraContributions: {
        tip_packs: [{ id: 'starter-tips', payload: { tips: ['Hello'] } }],
      },
    });
    expect(registry.getContributions('tip_packs').map((c) => c.contribution.id)).toEqual([
      'starter-tips',
    ]);
  });

  it('extraContributions trigger no registration when both sides are empty', async () => {
    const source = moduleSource({ activateBody: `void 0;` });
    await loadPluginUiFromBytes('plg.empty', source, api('plg.empty'), {
      extraContributions: {},
    });
    // No contributions registered, but the load did not error — pure
    // activate-only plugin is a valid shape.
    expect(registry.getContributions('cell_renderers')).toHaveLength(0);
  });

  it('loadPluginUiFromBytes accepts a Uint8Array source', async () => {
    const source = moduleSource({
      contributions: `{ commands: [{ id: 'c', payload: { title: 'Hello' } }] }`,
    });
    const bytes = new TextEncoder().encode(source);
    await loadPluginUiFromBytes('plg.bytes', bytes, api('plg.bytes'));
    expect(registry.getContributions('commands')).toHaveLength(1);
  });

  it('loadPluginUi rejects a bundle whose default export is not an object', async () => {
    const source = `export default null;\n`;
    await expect(
      loadPluginUiFromBytes('plg.bad', source, api('plg.bad')),
    ).rejects.toThrow(/no default export of type PluginUiModule/);
  });

  it('loadPluginUi rejects a URL that fails to import', async () => {
    await expect(
      loadPluginUi(
        'plg.404',
        'data:text/javascript;base64,@@not-valid-base64@@',
        api('plg.404'),
      ),
    ).rejects.toThrow(/UI bundle failed to load/);
  });

  it('unloadPluginUi unregisters contributions and runs deactivate()', async () => {
    const source = moduleSource({
      contributions: `{ tip_packs: [{ id: 'pack', payload: { tips: [] } }] }`,
      deactivateBody: `globalThis.__deactivated = 'plg.unload';`,
    });
    const mod = await loadPluginUiFromBytes('plg.unload', source, api('plg.unload'));
    expect(registry.getContributions('tip_packs')).toHaveLength(1);

    delete (globalThis as { __deactivated?: unknown }).__deactivated;
    const { deactivateError } = await unloadPluginUi('plg.unload', mod);
    expect(deactivateError).toBeNull();
    expect(registry.getContributions('tip_packs')).toHaveLength(0);
    expect((globalThis as { __deactivated?: string }).__deactivated).toBe('plg.unload');
  });

  it('reloadPluginUi swaps contributions atomically and surfaces deactivate errors separately', async () => {
    const oldSource = moduleSource({
      contributions: `{ themes: [{ id: 'theme-v1', payload: { hue: 'red' } }] }`,
      deactivateBody: `globalThis.__reloadDeactivated = true;`,
    });
    const oldModule = await loadPluginUiFromBytes('plg.reload', oldSource, api('plg.reload'));
    expect(registry.getContributions('themes').map((c) => c.contribution.id)).toEqual(['theme-v1']);

    delete (globalThis as { __reloadDeactivated?: unknown }).__reloadDeactivated;
    const newSource = moduleSource({
      contributions: `{ themes: [{ id: 'theme-v2', payload: { hue: 'blue' } }] }`,
    });

    const { module: newModule, deactivateError } = await reloadPluginUi(
      'plg.reload',
      oldModule,
      () => loadPluginUiFromBytes('plg.reload', newSource, api('plg.reload')),
    );
    expect(deactivateError).toBeNull();
    expect((globalThis as { __reloadDeactivated?: boolean }).__reloadDeactivated).toBe(true);
    expect(newModule.contributions?.themes?.[0]?.id).toBe('theme-v2');
    // Registry now reflects only the new contribution — old one gone.
    expect(registry.getContributions('themes').map((c) => c.contribution.id)).toEqual(['theme-v2']);
  });

  it('reloadPluginUi leaves the plugin unloaded if the reload step rejects', async () => {
    const oldSource = moduleSource({
      contributions: `{ themes: [{ id: 't', payload: {} }] }`,
    });
    const oldModule = await loadPluginUiFromBytes('plg.reload-fail', oldSource, api('plg.reload-fail'));
    expect(registry.getContributions('themes')).toHaveLength(1);

    await expect(
      reloadPluginUi('plg.reload-fail', oldModule, () =>
        Promise.reject(new Error('fetch failed')),
      ),
    ).rejects.toThrow(/fetch failed/);
    // Old contributions were dropped during unload; nothing replaced them.
    expect(registry.getContributions('themes')).toHaveLength(0);
  });

  it('unloadPluginUi surfaces deactivate() errors without aborting the unregister', async () => {
    const source = moduleSource({
      contributions: `{ tip_packs: [{ id: 'pack', payload: { tips: [] } }] }`,
      deactivateBody: `throw new Error('shutdown failed');`,
    });
    const mod = await loadPluginUiFromBytes('plg.fail-down', source, api('plg.fail-down'));
    expect(registry.getContributions('tip_packs')).toHaveLength(1);

    const { deactivateError } = await unloadPluginUi('plg.fail-down', mod as PluginUiModule);
    expect(deactivateError).not.toBeNull();
    expect(deactivateError?.message).toMatch(/deactivate\(\) threw: shutdown failed/);
    // Even though deactivate threw, contributions are still gone.
    expect(registry.getContributions('tip_packs')).toHaveLength(0);
  });

  // I6.2 — unloadPluginUi drops every event-bus subscription the
  // plugin held. Verified by registering subs directly (since
  // loadPluginUi → activate isn't trivial to exercise without an
  // ESM module file in this test, but the unload path is what we
  // care about for auto-cleanup).
  it('unloadPluginUi auto-cleans event-bus subscriptions (I6.2)', async () => {
    const { eventBus } = await import('../events/event-bus.js');
    eventBus.__reset();
    eventBus.subscribe('plg.auto-clean', 'query/*', () => {});
    eventBus.subscribe('plg.auto-clean', 'connection/*', () => {});
    eventBus.subscribe('plg.other', 'query/*', () => {});
    expect(eventBus.subscriptionCount()).toBe(3);
    const mod: PluginUiModule = { default: { contributions: {} } };
    await unloadPluginUi('plg.auto-clean', mod);
    // Both plg.auto-clean subs gone; plg.other survives.
    expect(eventBus.subscriptionCount()).toBe(1);
    eventBus.__reset();
  });
});
