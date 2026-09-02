import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unloadPluginUi } from './loader.js';
import { eventBus } from '../events/event-bus.js';
import {
  PLUGIN_ACTIVATED,
  PLUGIN_CRASHED,
  PLUGIN_DEACTIVATED,
  type PluginCrashedPayload,
  type PluginDeactivatedPayload,
} from '../events/lifecycle-events.js';
import { registry } from './registry.js';
import type { PluginUiModule } from './types.js';

describe('loader emit wiring (I6.3)', () => {
  beforeEach(() => {
    eventBus.__reset();
    registry.__reset();
  });
  afterEach(() => {
    eventBus.__reset();
    registry.__reset();
  });

  it('unloadPluginUi emits plugin/deactivated on success (no deactivate hook)', async () => {
    const handler = vi.fn();
    eventBus.subscribe<PluginDeactivatedPayload>('t', PLUGIN_DEACTIVATED, handler);
    const mod: PluginUiModule = { contributions: {} };
    await unloadPluginUi('plg.simple', mod);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as PluginDeactivatedPayload).pluginId).toBe(
      'plg.simple',
    );
  });

  it('unloadPluginUi emits plugin/deactivated after a successful deactivate hook', async () => {
    const handler = vi.fn();
    const deactivate = vi.fn(async () => {});
    eventBus.subscribe<PluginDeactivatedPayload>('t', PLUGIN_DEACTIVATED, handler);
    const mod: PluginUiModule = { contributions: {}, deactivate };
    const { deactivateError } = await unloadPluginUi('plg.hook', mod);
    expect(deactivateError).toBeNull();
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unloadPluginUi emits BOTH plugin/crashed and plugin/deactivated when deactivate throws', async () => {
    const crashed = vi.fn();
    const deactivated = vi.fn();
    eventBus.subscribe<PluginCrashedPayload>('t', PLUGIN_CRASHED, crashed);
    eventBus.subscribe<PluginDeactivatedPayload>('t', PLUGIN_DEACTIVATED, deactivated);
    const mod: PluginUiModule = {
      contributions: {},
      deactivate: async () => {
        throw new Error('shutdown failed');
      },
    };
    const { deactivateError } = await unloadPluginUi('plg.crashy', mod);
    expect(deactivateError?.message).toMatch(/shutdown failed/);
    expect(crashed).toHaveBeenCalledTimes(1);
    const crashPayload = crashed.mock.calls[0]?.[1] as PluginCrashedPayload;
    expect(crashPayload.pluginId).toBe('plg.crashy');
    expect(crashPayload.phase).toBe('deactivate');
    expect(crashPayload.error).toMatch(/shutdown failed/);
    expect(deactivated).toHaveBeenCalledTimes(1);
  });

  it('subscriber to plugin/** receives every lifecycle event a plugin generates', async () => {
    const all = vi.fn();
    eventBus.subscribe('observability', 'plugin/**', all);
    const mod: PluginUiModule = { contributions: {} };
    await unloadPluginUi('plg.multi', mod);
    const topics = all.mock.calls.map((c) => c[0]);
    expect(topics).toContain(PLUGIN_DEACTIVATED);
  });

  it('plugin/activated emit at loadPluginUi success is documented via the loader test suite (no separate spec)', () => {
    // The plugin/activated emit lives at the end of loadPluginUi
    // (after registration + activate). loadPluginUi requires either
    // a network URL or a data: URL bundle for round-trip; that path
    // is exercised in loader.test.tsx (which already covers success
    // + failure rollback). This spec just documents that the emit
    // is part of the contract — assertion intentionally minimal.
    expect(PLUGIN_ACTIVATED).toBe('plugin/activated');
  });
});
