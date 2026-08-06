// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { PluginAPIProvider, usePluginAPI } from './usePluginAPI.js';
import { createPluginAPI, unwiredBindings } from './api.js';
import {
  PluginPermissionDenied,
  type Disposable,
  type EventHandler,
  type PluginHostBindings,
} from './types.js';

describe('usePluginAPI + createPluginAPI', () => {
  afterEach(() => {
    cleanup();
  });

  /** Test double: records every binding call so cases can assert
   *  delegation without spinning up a real host edition. */
  function spyBindings(): PluginHostBindings & {
    calls: Array<{ method: string; args: unknown[] }>;
  } {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    return {
      calls,
      log: (...args) => {
        calls.push({ method: 'log', args });
      },
      notify: (...args) => {
        calls.push({ method: 'notify', args });
      },
      invokeCommand: async (...args) => {
        calls.push({ method: 'invokeCommand', args });
        return { ok: true };
      },
      getSetting: async (...args) => {
        calls.push({ method: 'getSetting', args });
        return 'cached-value';
      },
      setSetting: async (...args) => {
        calls.push({ method: 'setSetting', args });
      },
      subscribe: (...args) => {
        calls.push({ method: 'subscribe', args });
        return { dispose: () => {} };
      },
    };
  }

  function wrapper(api: ReturnType<typeof createPluginAPI>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <PluginAPIProvider api={api}>{children}</PluginAPIProvider>;
    };
  }

  it('throws when called outside a PluginAPIProvider', () => {
    expect(() => renderHook(() => usePluginAPI())).toThrow(/PluginAPIProvider/);
  });

  it('returns the same API instance when provider value is stable', () => {
    const bindings = spyBindings();
    const api = createPluginAPI('plg.one', bindings);
    const { result } = renderHook(() => usePluginAPI(), {
      wrapper: wrapper(api),
    });
    expect(result.current).toBe(api);
    expect(result.current.pluginId).toBe('plg.one');
  });

  it('binds pluginId to log so plugin code does not pass it', () => {
    const bindings = spyBindings();
    const api = createPluginAPI('plg.log', bindings);
    api.log('info', 'hi');
    expect(bindings.calls).toEqual([
      { method: 'log', args: ['plg.log', 'info', 'hi'] },
    ]);
  });

  it('binds pluginId to notify, invokeCommand, getSetting, setSetting, subscribe', async () => {
    const bindings = spyBindings();
    const api = createPluginAPI('plg.all', bindings);

    api.notify('warning', 'careful');
    const result = await api.invokeCommand<{ ok: boolean }>('cmd.x', { y: 1 });
    expect(result).toEqual({ ok: true });
    const setting = await api.getSetting('font-size');
    expect(setting).toBe('cached-value');
    await api.setSetting('font-size', '14');
    const sub = api.subscribe('plamenix:query/executed', () => {});
    sub.dispose();

    expect(bindings.calls.map((c) => c.method)).toEqual([
      'notify',
      'invokeCommand',
      'getSetting',
      'setSetting',
      'subscribe',
    ]);
    // Every recorded call must lead with the bound plugin id.
    for (const call of bindings.calls) {
      expect(call.args[0]).toBe('plg.all');
    }
  });

  it('propagates PluginPermissionDenied thrown by bindings', async () => {
    const bindings: PluginHostBindings = {
      ...spyBindings(),
      invokeCommand: async () => {
        throw new PluginPermissionDenied('command:invoke');
      },
    };
    const api = createPluginAPI('plg.denied', bindings);
    await expect(api.invokeCommand('any')).rejects.toBeInstanceOf(
      PluginPermissionDenied,
    );
  });

  it('typed invokeCommand return narrows via the generic', async () => {
    const bindings: PluginHostBindings = {
      ...spyBindings(),
      invokeCommand: async () => ({ rows: 42 }),
    };
    const api = createPluginAPI('plg.typed', bindings);
    const result = await api.invokeCommand<{ rows: number }>('count');
    expect(result.rows).toBe(42);
  });

  it('subscribe returns a Disposable that the binding hands back', () => {
    const disposeMock = vi.fn();
    const customSub: PluginHostBindings['subscribe'] = (_id, _topic, _handler) => ({
      dispose: disposeMock,
    });
    const bindings: PluginHostBindings = {
      ...spyBindings(),
      subscribe: customSub,
    };
    const api = createPluginAPI('plg.sub', bindings);
    const handler: EventHandler = () => {};
    const sub: Disposable = api.subscribe('plamenix:tab/opened', handler);
    sub.dispose();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it('unwiredBindings throws a descriptive error for every method', async () => {
    const api = createPluginAPI('plg.unwired', unwiredBindings());
    expect(() => api.log('info', 'x')).toThrow(/plg\.unwired.*log\(\).*not wired/);
    expect(() => api.notify('info', 'x')).toThrow(/plg\.unwired.*notify\(\)/);
    await expect(api.invokeCommand('x')).rejects.toThrow(/invokeCommand\(\)/);
    await expect(api.getSetting('x')).rejects.toThrow(/getSetting\(\)/);
    await expect(api.setSetting('x', 'y')).rejects.toThrow(/setSetting\(\)/);
    expect(() => api.subscribe('x', () => {})).toThrow(/subscribe\(\)/);
  });

  it('PluginAPIProvider exposes the same instance via usePluginAPI when consumed from a child component', () => {
    const bindings = spyBindings();
    const api = createPluginAPI('plg.children', bindings);

    function Child() {
      const got = usePluginAPI();
      return <span data-testid="cid">{got.pluginId}</span>;
    }

    render(
      <PluginAPIProvider api={api}>
        <Child />
      </PluginAPIProvider>,
    );
    expect(screen.getByTestId('cid').textContent).toBe('plg.children');
  });
});
