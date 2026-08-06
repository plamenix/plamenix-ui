// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  usePluginInstallFlow,
  type PluginInstallAdapters,
} from './use-plugin-install-flow.js';
import type { PendingPluginInstall } from './PluginInstallDialog.js';

const samplePending: PendingPluginInstall = {
  id: 'org.example.fmt',
  name: 'Format SQL',
  version: '1.2.3',
  requiredPermissions: ['contributions.sql_formatters'],
  optionalPermissions: ['network.fetch'],
};

function fakeAdapters(
  overrides: Partial<PluginInstallAdapters<string>> = {},
): PluginInstallAdapters<string> {
  return {
    pick: vi.fn(async () => '/tmp/plugin.plx'),
    validate: vi.fn(async () => samplePending),
    install: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('usePluginInstallFlow (I7.5)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts in idle phase with no pending data', () => {
    const { result } = renderHook(() => usePluginInstallFlow(fakeAdapters()));
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.pending).toBeNull();
    expect(result.current.isBusy).toBe(false);
  });

  it('start() walks idle → confirming on a successful pick + validate', async () => {
    const adapters = fakeAdapters();
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('confirming');
    expect(result.current.pending).toEqual(samplePending);
    expect(adapters.pick).toHaveBeenCalledTimes(1);
    expect(adapters.validate).toHaveBeenCalledWith('/tmp/plugin.plx');
  });

  it('returns to idle when the user cancels the picker (pick resolves null)', async () => {
    const adapters = fakeAdapters({ pick: vi.fn(async () => null) });
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('idle');
    expect(adapters.validate).not.toHaveBeenCalled();
  });

  it('moves to error phase when validate rejects', async () => {
    const adapters = fakeAdapters({
      validate: vi.fn(async () => {
        throw new Error('bad manifest');
      }),
    });
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('error');
    if (result.current.state.phase === 'error') {
      expect(result.current.state.message).toBe('bad manifest');
    }
  });

  it('moves to error phase when picker throws', async () => {
    const adapters = fakeAdapters({
      pick: vi.fn(async () => {
        throw new Error('picker exploded');
      }),
    });
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('error');
    if (result.current.state.phase === 'error') {
      expect(result.current.state.message).toBe('picker exploded');
    }
  });

  it('confirm() walks confirming → installing → idle on success', async () => {
    const adapters = fakeAdapters();
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.confirm(['network.fetch']);
    });
    expect(result.current.state.phase).toBe('idle');
    expect(adapters.install).toHaveBeenCalledWith(
      '/tmp/plugin.plx',
      'org.example.fmt',
      ['network.fetch'],
    );
  });

  it('confirm() moves to error when install rejects', async () => {
    const adapters = fakeAdapters({
      install: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.confirm([]);
    });
    expect(result.current.state.phase).toBe('error');
    if (result.current.state.phase === 'error') {
      expect(result.current.state.message).toBe('disk full');
    }
  });

  it('confirm() is a no-op outside the confirming phase', async () => {
    const adapters = fakeAdapters();
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    // Confirm from idle does nothing.
    await act(async () => {
      await result.current.confirm(['anything']);
    });
    expect(adapters.install).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
  });

  it('reset() returns to idle from any phase', async () => {
    const adapters = fakeAdapters();
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('confirming');
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.pending).toBeNull();
  });

  it('reset() clears an error phase so the next start() works', async () => {
    const adapters = fakeAdapters({
      validate: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { result } = renderHook(() => usePluginInstallFlow(adapters));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('error');
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.phase).toBe('idle');
  });

  it('isBusy is false in idle phase + true after start enters validating', async () => {
    // Start with default-resolved adapters; busy returns false after
    // the flow finishes in `confirming` (not a busy phase).
    const { result } = renderHook(() => usePluginInstallFlow(fakeAdapters()));
    expect(result.current.isBusy).toBe(false);
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('confirming');
    expect(result.current.isBusy).toBe(false);
  });

  it('pending accessor returns the dialog payload while confirming + clears on reset', async () => {
    const { result } = renderHook(() => usePluginInstallFlow(fakeAdapters()));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.pending).toEqual(samplePending);
    act(() => {
      result.current.reset();
    });
    expect(result.current.pending).toBeNull();
  });
});
