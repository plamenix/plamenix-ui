// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useGlobalKeybindings } from './useGlobalKeybindings.js';
import { registry, registerContributions } from '../plugin-react/registry.js';
import type { KeybindingContributionPayload } from './keybinding-contract.js';

function dispatch(event: Partial<KeyboardEvent> & { key: string }): boolean {
  const ev = new KeyboardEvent('keydown', {
    key: event.key,
    metaKey: event.metaKey ?? false,
    ctrlKey: event.ctrlKey ?? false,
    shiftKey: event.shiftKey ?? false,
    altKey: event.altKey ?? false,
    cancelable: true,
    bubbles: true,
  });
  document.dispatchEvent(ev);
  return ev.defaultPrevented;
}

describe('useGlobalKeybindings (I5.1)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    cleanup();
    registry.__reset();
  });

  it('dispatches the matching binding when the combo fires + calls preventDefault on claim', () => {
    const run = vi.fn(() => true);
    registerContributions('com.example.bind', {
      keybindings: [
        {
          id: 'palette',
          payload: {
            label: 'Open palette',
            combo: 'Mod+K',
            run,
          } satisfies KeybindingContributionPayload,
        },
      ],
    });
    renderHook(() => useGlobalKeybindings());
    const claimed = dispatch({ key: 'k', ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    // Honoured the claim → preventDefault was called.
    expect(claimed).toBe(true);
  });

  it('does NOT preventDefault when the handler returns false (pass-through)', () => {
    const run = vi.fn(() => false);
    registerContributions('com.example.passthrough', {
      keybindings: [
        {
          id: 'passthrough',
          payload: { label: 'Pass', combo: 'Mod+J', run },
        },
      ],
    });
    renderHook(() => useGlobalKeybindings());
    const claimed = dispatch({ key: 'j', ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(claimed).toBe(false);
  });

  it('walks bindings in priority order — higher-priority match shadows the lower', () => {
    const winner = vi.fn(() => true);
    const loser = vi.fn(() => true);
    registerContributions('com.example.loser', {
      keybindings: [
        {
          id: 'palette',
          priority: 200,
          payload: { label: 'Loser', combo: 'Mod+K', run: loser },
        },
      ],
    });
    registerContributions('com.example.winner', {
      keybindings: [
        {
          id: 'palette',
          priority: 50,
          payload: { label: 'Winner', combo: 'Mod+K', run: winner },
        },
      ],
    });
    renderHook(() => useGlobalKeybindings());
    dispatch({ key: 'k', ctrlKey: true });
    expect(winner).toHaveBeenCalledTimes(1);
    expect(loser).not.toHaveBeenCalled();
  });

  it('falls through to the next binding when the first returns false', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    registerContributions('com.example.first', {
      keybindings: [
        {
          id: 'palette',
          priority: 50,
          payload: { label: 'First', combo: 'Mod+K', run: first },
        },
      ],
    });
    registerContributions('com.example.second', {
      keybindings: [
        {
          id: 'palette',
          priority: 100,
          payload: { label: 'Second', combo: 'Mod+K', run: second },
        },
      ],
    });
    renderHook(() => useGlobalKeybindings());
    dispatch({ key: 'k', ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('respects when() predicate — gated binding does not fire when predicate is false', () => {
    const run = vi.fn(() => true);
    registerContributions('com.example.guarded', {
      keybindings: [
        {
          id: 'guarded',
          payload: {
            label: 'Guarded',
            combo: '?',
            when: () => false,
            run,
          },
        },
      ],
    });
    renderHook(() => useGlobalKeybindings());
    dispatch({ key: '?' });
    expect(run).not.toHaveBeenCalled();
  });

  it('a throwing handler does not crash the dispatcher; next binding still fires', () => {
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const fallback = vi.fn(() => true);
    registerContributions('com.example.thrower', {
      keybindings: [
        {
          id: 'thrower',
          priority: 50,
          payload: { label: 'T', combo: 'Mod+J', run: thrower },
        },
      ],
    });
    registerContributions('com.example.fallback', {
      keybindings: [
        {
          id: 'fallback',
          priority: 100,
          payload: { label: 'F', combo: 'Mod+J', run: fallback },
        },
      ],
    });
    renderHook(() => useGlobalKeybindings());
    expect(() => dispatch({ key: 'j', ctrlKey: true })).not.toThrow();
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
