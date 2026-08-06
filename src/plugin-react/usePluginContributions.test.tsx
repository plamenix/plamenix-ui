// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { registerContributions, registry, unregisterPlugin } from './registry.js';
import { usePluginContributions } from './usePluginContributions.js';

describe('usePluginContributions', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    cleanup();
    registry.__reset();
  });

  it('returns the empty array when no contributions are registered', () => {
    const { result } = renderHook(() => usePluginContributions('commands'));
    expect(result.current).toEqual([]);
  });

  it('returns contributions for the requested point, sorted by priority', () => {
    registerContributions('plg.cmd', {
      commands: [
        { id: 'b', priority: 100, payload: { title: 'B' } },
        { id: 'a', priority: 10, payload: { title: 'A' } },
      ],
    });
    const { result } = renderHook(() => usePluginContributions<{ title: string }>('commands'));
    expect(result.current.map((c) => c.contribution.id)).toEqual(['a', 'b']);
    expect(result.current[0]?.contribution.payload.title).toBe('A');
  });

  it('re-renders the calling component when contributions are added after mount', () => {
    const { result } = renderHook(() => usePluginContributions('commands'));
    expect(result.current).toHaveLength(0);
    act(() => {
      registerContributions('plg.late', {
        commands: [{ id: 'late', payload: {} }],
      });
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.contribution.id).toBe('late');
  });

  it('re-renders when a plugin is unregistered', () => {
    registerContributions('plg.gone', {
      commands: [{ id: 'will-vanish', payload: {} }],
    });
    const { result } = renderHook(() => usePluginContributions('commands'));
    expect(result.current).toHaveLength(1);
    act(() => {
      unregisterPlugin('plg.gone');
    });
    expect(result.current).toHaveLength(0);
  });

  it('isolates extension points — registering to A does not re-render hook listening to B', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return usePluginContributions('export_formats');
    });
    const initial = renderCount;
    act(() => {
      registerContributions('plg.cell', {
        cell_renderers: [{ id: 'r', payload: {} }],
      });
    });
    expect(renderCount).toBe(initial);
    expect(result.current).toHaveLength(0);
  });

  it('returns referentially stable snapshots so useMemo deps lists are honored', () => {
    registerContributions('plg.stable', {
      commands: [{ id: 'c', payload: {} }],
    });
    const { result, rerender } = renderHook(() => usePluginContributions('commands'));
    const first = result.current;
    rerender();
    const second = result.current;
    // No state change between renders → same array reference.
    expect(second).toBe(first);
  });
});
