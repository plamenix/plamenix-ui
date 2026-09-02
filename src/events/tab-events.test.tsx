// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  TAB_ACTIVATED,
  TAB_CLOSED,
  TAB_OPENED,
  TAB_RENAMED,
  diffAndEmitTabEvents,
  useEmitTabEvents,
  type TabActivatedPayload,
  type TabClosedPayload,
  type TabOpenedPayload,
  type TabRenamedPayload,
  type TabStateSnapshot,
} from './tab-events.js';
import { eventBus } from './event-bus.js';
import { useTabsStore } from '../db/tabs-store.js';

const snapshot = (
  tabs: { id: string; title: string }[],
  activeTabId: string | null,
): TabStateSnapshot => ({ tabs, activeTabId });

describe('tab-events topic constants (I6.4)', () => {
  it('exposes the four expected topic literals', () => {
    expect(TAB_OPENED).toBe('tab/opened');
    expect(TAB_ACTIVATED).toBe('tab/activated');
    expect(TAB_CLOSED).toBe('tab/closed');
    expect(TAB_RENAMED).toBe('tab/renamed');
  });
});

describe('diffAndEmitTabEvents (I6.4)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emits tab/opened for new tabs in next', () => {
    const handler = vi.fn();
    eventBus.subscribe<TabOpenedPayload>('t', TAB_OPENED, handler);
    const count = diffAndEmitTabEvents(
      snapshot([], null),
      snapshot([{ id: 'a', title: 'Tab A' }], 'a'),
    );
    expect(count).toBe(2); // opened + activated
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as TabOpenedPayload;
    expect(payload.tabId).toBe('a');
    expect(payload.title).toBe('Tab A');
    expect(payload.index).toBe(0);
  });

  it('emits tab/closed for tabs removed from next', () => {
    const handler = vi.fn();
    eventBus.subscribe<TabClosedPayload>('t', TAB_CLOSED, handler);
    diffAndEmitTabEvents(
      snapshot([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], 'a'),
      snapshot([{ id: 'a', title: 'A' }], 'a'),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as TabClosedPayload).tabId).toBe('b');
  });

  it('emits tab/renamed when a same-id tab title changes', () => {
    const handler = vi.fn();
    eventBus.subscribe<TabRenamedPayload>('t', TAB_RENAMED, handler);
    diffAndEmitTabEvents(
      snapshot([{ id: 'a', title: 'Old' }], 'a'),
      snapshot([{ id: 'a', title: 'New' }], 'a'),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as TabRenamedPayload;
    expect(payload.previousTitle).toBe('Old');
    expect(payload.nextTitle).toBe('New');
  });

  it('emits tab/activated when activeTabId changes', () => {
    const handler = vi.fn();
    eventBus.subscribe<TabActivatedPayload>('t', TAB_ACTIVATED, handler);
    diffAndEmitTabEvents(
      snapshot([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], 'a'),
      snapshot([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], 'b'),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as TabActivatedPayload;
    expect(payload.tabId).toBe('b');
    expect(payload.previousTabId).toBe('a');
  });

  it('does NOT emit tab/activated when activeTabId is unchanged', () => {
    const handler = vi.fn();
    eventBus.subscribe('t', TAB_ACTIVATED, handler);
    diffAndEmitTabEvents(
      snapshot([{ id: 'a', title: 'A' }], 'a'),
      snapshot([{ id: 'a', title: 'A' }], 'a'),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('emits multiple events in one diff: opened + closed + renamed + activated', () => {
    const opened = vi.fn();
    const closed = vi.fn();
    const renamed = vi.fn();
    const activated = vi.fn();
    eventBus.subscribe('t', TAB_OPENED, opened);
    eventBus.subscribe('t', TAB_CLOSED, closed);
    eventBus.subscribe('t', TAB_RENAMED, renamed);
    eventBus.subscribe('t', TAB_ACTIVATED, activated);
    diffAndEmitTabEvents(
      snapshot([{ id: 'a', title: 'Old A' }, { id: 'b', title: 'B' }], 'a'),
      snapshot(
        [{ id: 'a', title: 'New A' }, { id: 'c', title: 'C' }],
        'c',
      ),
    );
    expect(opened).toHaveBeenCalledTimes(1); // c
    expect(closed).toHaveBeenCalledTimes(1); // b
    expect(renamed).toHaveBeenCalledTimes(1); // a's title
    expect(activated).toHaveBeenCalledTimes(1); // c
  });

  it('uses the supplied now() for timestamps (deterministic)', () => {
    const handler = vi.fn();
    eventBus.subscribe('t', TAB_OPENED, handler);
    diffAndEmitTabEvents(snapshot([], null), snapshot([{ id: 'a', title: 'A' }], 'a'), () => 4242);
    expect((handler.mock.calls[0]?.[1] as TabOpenedPayload).openedAt).toBe(4242);
  });
});

describe('useEmitTabEvents (I6.4)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => {
    cleanup();
    eventBus.__reset();
  });

  it('emits tab/opened + tab/activated for the initial store snapshot on mount', () => {
    const opened = vi.fn();
    const activated = vi.fn();
    eventBus.subscribe('t', TAB_OPENED, opened);
    eventBus.subscribe('t', TAB_ACTIVATED, activated);
    renderHook(() => useEmitTabEvents());
    // Initial tabs-store state has one default tab — initial fire
    // should emit one open + one activated for it.
    expect(opened.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(activated).toHaveBeenCalledTimes(1);
  });

  it('emits tab/opened when newTab() is called via the store', () => {
    const opened = vi.fn();
    eventBus.subscribe<TabOpenedPayload>('t', TAB_OPENED, opened);
    renderHook(() => useEmitTabEvents());
    const before = opened.mock.calls.length;
    act(() => {
      useTabsStore.getState().newTab();
    });
    expect(opened.mock.calls.length).toBeGreaterThan(before);
  });

  it('emits tab/closed when closeTab() drops a tab', () => {
    const closed = vi.fn();
    eventBus.subscribe<TabClosedPayload>('t', TAB_CLOSED, closed);
    renderHook(() => useEmitTabEvents());
    let extraId: string | null = null;
    act(() => {
      extraId = useTabsStore.getState().newTab();
    });
    expect(extraId).not.toBeNull();
    const beforeClose = closed.mock.calls.length;
    act(() => {
      useTabsStore.getState().closeTab(extraId!);
    });
    expect(closed.mock.calls.length).toBeGreaterThan(beforeClose);
  });

  it('emits tab/renamed when renameTab changes a title', () => {
    const renamed = vi.fn();
    eventBus.subscribe<TabRenamedPayload>('t', TAB_RENAMED, renamed);
    renderHook(() => useEmitTabEvents());
    const id = useTabsStore.getState().activeTabId;
    act(() => {
      useTabsStore.getState().renameTab(id, 'Renamed Title');
    });
    expect(renamed).toHaveBeenCalledTimes(1);
    const payload = renamed.mock.calls[0]?.[1] as TabRenamedPayload;
    expect(payload.nextTitle).toBe('Renamed Title');
  });

  it('emits tab/activated when setActive switches active tab', () => {
    const activated = vi.fn();
    eventBus.subscribe<TabActivatedPayload>('t', TAB_ACTIVATED, activated);
    renderHook(() => useEmitTabEvents());
    const originalId = useTabsStore.getState().activeTabId;
    let newId: string | null = null;
    act(() => {
      // newTab() activates the new tab, so this fires tab/activated.
      newId = useTabsStore.getState().newTab();
    });
    const beforeFlipBack = activated.mock.calls.length;
    // Flip back to the original tab — different from current active,
    // so the diff fires another tab/activated.
    act(() => {
      useTabsStore.getState().setActive(originalId);
    });
    expect(activated.mock.calls.length).toBeGreaterThan(beforeFlipBack);
    expect(
      (activated.mock.calls[activated.mock.calls.length - 1]?.[1] as TabActivatedPayload).tabId,
    ).toBe(originalId);
    expect(newId).not.toBe(originalId);
  });
});
