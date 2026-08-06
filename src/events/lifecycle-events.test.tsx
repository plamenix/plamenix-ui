// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import {
  APP_SHUTDOWN,
  APP_STARTED,
  PLUGIN_ACTIVATED,
  PLUGIN_CRASHED,
  PLUGIN_DEACTIVATED,
  emitAppShutdown,
  emitAppStarted,
  emitPluginActivated,
  emitPluginCrashed,
  emitPluginDeactivated,
  useEmitLifecycleEvents,
  type AppShutdownPayload,
  type AppStartedPayload,
  type PluginActivatedPayload,
  type PluginCrashedPayload,
  type PluginDeactivatedPayload,
} from './lifecycle-events.js';
import { eventBus } from './event-bus.js';

describe('lifecycle-events topic constants (I6.3)', () => {
  it('exposes the five expected topic literals', () => {
    expect(APP_STARTED).toBe('app/started');
    expect(APP_SHUTDOWN).toBe('app/shutdown');
    expect(PLUGIN_ACTIVATED).toBe('plugin/activated');
    expect(PLUGIN_DEACTIVATED).toBe('plugin/deactivated');
    expect(PLUGIN_CRASHED).toBe('plugin/crashed');
  });
});

describe('lifecycle emit helpers (I6.3)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emitAppStarted fires on the app/started topic with the payload', () => {
    const handler = vi.fn();
    eventBus.subscribe<AppStartedPayload>('test', APP_STARTED, handler);
    emitAppStarted({ edition: 'desktop', hostVersion: '1.0.0-beta', startedAt: 12345 });
    expect(handler).toHaveBeenCalledWith('app/started', {
      edition: 'desktop',
      hostVersion: '1.0.0-beta',
      startedAt: 12345,
    });
  });

  it('emitAppShutdown distinguishes unmount vs beforeunload via reason', () => {
    const handler = vi.fn();
    eventBus.subscribe<AppShutdownPayload>('test', APP_SHUTDOWN, handler);
    emitAppShutdown({ shutdownAt: 1, reason: 'unmount' });
    emitAppShutdown({ shutdownAt: 2, reason: 'beforeunload' });
    expect(handler.mock.calls.map((c) => (c[1] as AppShutdownPayload).reason)).toEqual([
      'unmount',
      'beforeunload',
    ]);
  });

  it('emitPluginActivated / Deactivated / Crashed fire on their topics with typed payloads', () => {
    const activated = vi.fn();
    const deactivated = vi.fn();
    const crashed = vi.fn();
    eventBus.subscribe<PluginActivatedPayload>('a', PLUGIN_ACTIVATED, activated);
    eventBus.subscribe<PluginDeactivatedPayload>('b', PLUGIN_DEACTIVATED, deactivated);
    eventBus.subscribe<PluginCrashedPayload>('c', PLUGIN_CRASHED, crashed);
    emitPluginActivated({ pluginId: 'plg.a', activatedAt: 10 });
    emitPluginDeactivated({ pluginId: 'plg.a', deactivatedAt: 20 });
    emitPluginCrashed({ pluginId: 'plg.a', phase: 'activate', error: 'boom', crashedAt: 30 });
    expect(activated).toHaveBeenCalledWith('plugin/activated', { pluginId: 'plg.a', activatedAt: 10 });
    expect(deactivated).toHaveBeenCalledWith('plugin/deactivated', { pluginId: 'plg.a', deactivatedAt: 20 });
    expect(crashed).toHaveBeenCalledWith('plugin/crashed', {
      pluginId: 'plg.a',
      phase: 'activate',
      error: 'boom',
      crashedAt: 30,
    });
  });

  it('emit helpers reach subscribers across topic wildcards (plugin/**)', () => {
    const handler = vi.fn();
    eventBus.subscribe('observability', 'plugin/**', handler);
    emitPluginActivated({ pluginId: 'plg.a', activatedAt: 0 });
    emitPluginDeactivated({ pluginId: 'plg.a', deactivatedAt: 1 });
    emitPluginCrashed({ pluginId: 'plg.a', phase: 'deactivate', error: 'x', crashedAt: 2 });
    expect(handler).toHaveBeenCalledTimes(3);
  });
});

describe('useEmitLifecycleEvents hook (I6.3)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => {
    cleanup();
    eventBus.__reset();
  });

  it('emits app/started once on mount with edition + hostVersion + startedAt', () => {
    const handler = vi.fn();
    eventBus.subscribe<AppStartedPayload>('t', APP_STARTED, handler);
    renderHook(() =>
      useEmitLifecycleEvents({ edition: 'desktop', hostVersion: '1.0.0-beta' }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as AppStartedPayload;
    expect(payload.edition).toBe('desktop');
    expect(payload.hostVersion).toBe('1.0.0-beta');
    expect(typeof payload.startedAt).toBe('number');
  });

  it('emits app/shutdown with reason "unmount" when the hook unmounts', () => {
    const handler = vi.fn();
    eventBus.subscribe<AppShutdownPayload>('t', APP_SHUTDOWN, handler);
    const { unmount } = renderHook(() =>
      useEmitLifecycleEvents({ edition: 'web', hostVersion: '1.0.0-beta' }),
    );
    unmount();
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as AppShutdownPayload).reason).toBe('unmount');
  });

  it('emits app/shutdown with reason "beforeunload" when the window fires the event', () => {
    const handler = vi.fn();
    eventBus.subscribe<AppShutdownPayload>('t', APP_SHUTDOWN, handler);
    renderHook(() =>
      useEmitLifecycleEvents({ edition: 'web', hostVersion: '1.0.0-beta' }),
    );
    window.dispatchEvent(new Event('beforeunload'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as AppShutdownPayload).reason).toBe('beforeunload');
  });

  it('only fires shutdown once even if both beforeunload and unmount happen', () => {
    const handler = vi.fn();
    eventBus.subscribe<AppShutdownPayload>('t', APP_SHUTDOWN, handler);
    const { unmount } = renderHook(() =>
      useEmitLifecycleEvents({ edition: 'web', hostVersion: '1.0.0-beta' }),
    );
    window.dispatchEvent(new Event('beforeunload'));
    unmount();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
