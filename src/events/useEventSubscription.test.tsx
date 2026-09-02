// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useEventSubscription } from './useEventSubscription.js';
import { eventBus } from './event-bus.js';

describe('useEventSubscription (I6.1)', () => {
  beforeEach(() => {
    eventBus.__reset();
  });
  afterEach(() => {
    cleanup();
    eventBus.__reset();
  });

  it('subscribes on mount + invokes handler when matching topic fires', () => {
    const handler = vi.fn();
    renderHook(() => useEventSubscription('com.example.a', 'query/*', handler));
    eventBus.emit('query/executed', { sql: 'SELECT 1' });
    expect(handler).toHaveBeenCalledWith('query/executed', { sql: 'SELECT 1' });
  });

  it('captures latest handler via ref — no re-subscribe on handler change', () => {
    let count = 0;
    const { rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useEventSubscription('com.example.b', 'query/*', () => {
          count += tag === 'first' ? 1 : 10;
        }),
      { initialProps: { tag: 'first' } },
    );
    eventBus.emit('query/executed', null);
    expect(count).toBe(1);
    rerender({ tag: 'second' });
    eventBus.emit('query/executed', null);
    // Latest handler ran (incremented by 10), not the stale first one.
    expect(count).toBe(11);
    // Subscription count stayed at 1 — the hook didn't tear down + re-subscribe.
    expect(eventBus.subscriptionCount()).toBe(1);
  });

  it('disposes subscription on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useEventSubscription('com.example.c', 'query/*', handler),
    );
    expect(eventBus.subscriptionCount()).toBe(1);
    unmount();
    expect(eventBus.subscriptionCount()).toBe(0);
    eventBus.emit('query/executed', null);
    expect(handler).not.toHaveBeenCalled();
  });

  it('changing pattern re-subscribes (the dep array includes pattern)', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ pattern }: { pattern: string }) =>
        useEventSubscription('com.example.d', pattern, handler),
      { initialProps: { pattern: 'query/*' } },
    );
    eventBus.emit('query/executed', null);
    expect(handler).toHaveBeenCalledTimes(1);
    rerender({ pattern: 'connection/*' });
    eventBus.emit('query/executed', null);
    eventBus.emit('connection/opened', null);
    // Old pattern (query/*) no longer fires; new pattern (connection/*) does.
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1]?.[0]).toBe('connection/opened');
  });
});
