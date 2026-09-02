/**
 * Tab events (I6.4) — emit family covering the four tab-strip
 * lifecycle transitions:
 *
 *   - `tab/opened`     — a new tab joined `useTabsStore.tabs`
 *   - `tab/activated`  — `useTabsStore.activeTabId` changed
 *   - `tab/closed`     — a tab disappeared from `useTabsStore.tabs`
 *   - `tab/renamed`    — an existing tab's `title` changed
 *
 * Source of truth is `useTabsStore` (Zustand). The
 * `useEmitTabEvents()` hook subscribes to the store with `subscribe`
 * + a previous-state ref + a small diff function. Mounting the hook
 * once at the App component is the only wiring needed — every store
 * mutation (newTab / closeTab / setActive / renameTab / patchTab
 * with a title patch) flows through the diff and emits the right
 * event(s).
 *
 * Rationale for the diff-on-subscribe shape (vs. emitting from
 * inside the store actions): keeps the store free of event-bus
 * coupling, makes the bridge unit-testable in isolation, and works
 * uniformly whether mutations come from a user action or a
 * programmatic patch from elsewhere in the host.
 */

import { useEffect, useRef } from 'react';
import { eventBus } from './event-bus.js';
import { useTabsStore, type TabState } from '../db/tabs-store.js';

/** Topic literals. */
export const TAB_OPENED = 'tab/opened' as const;
export const TAB_ACTIVATED = 'tab/activated' as const;
export const TAB_CLOSED = 'tab/closed' as const;
export const TAB_RENAMED = 'tab/renamed' as const;

export interface TabOpenedPayload {
  tabId: string;
  title: string;
  /** Index in the tab strip at emit time. */
  index: number;
  openedAt: number;
}

export interface TabActivatedPayload {
  tabId: string;
  /** Tab id that was active before this transition, or `null` on
   *  first emit (initial mount). */
  previousTabId: string | null;
  activatedAt: number;
}

export interface TabClosedPayload {
  tabId: string;
  title: string;
  closedAt: number;
}

export interface TabRenamedPayload {
  tabId: string;
  previousTitle: string;
  nextTitle: string;
  renamedAt: number;
}

export function emitTabOpened(payload: TabOpenedPayload): void {
  eventBus.emit<TabOpenedPayload>(TAB_OPENED, payload);
}
export function emitTabActivated(payload: TabActivatedPayload): void {
  eventBus.emit<TabActivatedPayload>(TAB_ACTIVATED, payload);
}
export function emitTabClosed(payload: TabClosedPayload): void {
  eventBus.emit<TabClosedPayload>(TAB_CLOSED, payload);
}
export function emitTabRenamed(payload: TabRenamedPayload): void {
  eventBus.emit<TabRenamedPayload>(TAB_RENAMED, payload);
}

/** Snapshot shape used by `diffAndEmitTabEvents`. Decoupled from
 *  the full `TabState` so unit tests can drive the diff with a
 *  minimal fixture. */
export interface TabSnapshot {
  id: string;
  title: string;
}

export interface TabStateSnapshot {
  tabs: ReadonlyArray<TabSnapshot>;
  activeTabId: string | null;
}

/** Pure diff function — exposed for unit tests. Emits at most one
 *  event per delta detected between `prev` and `next`. The order is:
 *  opened → closed → renamed → activated (so subscribers that read
 *  the registry / store inside their handler see a consistent state
 *  after each transition). Returns the count of events emitted. */
export function diffAndEmitTabEvents(
  prev: TabStateSnapshot,
  next: TabStateSnapshot,
  now: () => number = Date.now,
): number {
  let count = 0;
  const prevById = new Map(prev.tabs.map((t) => [t.id, t]));
  const nextById = new Map(next.tabs.map((t) => [t.id, t]));

  // Opens: tabs in next but not prev.
  next.tabs.forEach((t, i) => {
    if (!prevById.has(t.id)) {
      emitTabOpened({ tabId: t.id, title: t.title, index: i, openedAt: now() });
      count++;
    }
  });

  // Closes: tabs in prev but not next.
  for (const t of prev.tabs) {
    if (!nextById.has(t.id)) {
      emitTabClosed({ tabId: t.id, title: t.title, closedAt: now() });
      count++;
    }
  }

  // Renames: same id in both, title changed.
  for (const t of next.tabs) {
    const before = prevById.get(t.id);
    if (before && before.title !== t.title) {
      emitTabRenamed({
        tabId: t.id,
        previousTitle: before.title,
        nextTitle: t.title,
        renamedAt: now(),
      });
      count++;
    }
  }

  // Active-tab change.
  if (prev.activeTabId !== next.activeTabId && next.activeTabId !== null) {
    emitTabActivated({
      tabId: next.activeTabId,
      previousTabId: prev.activeTabId,
      activatedAt: now(),
    });
    count++;
  }

  return count;
}

/** React hook that subscribes to `useTabsStore` + emits tab events
 *  on every relevant transition. Mount once at the App component:
 *
 *    useEmitTabEvents();
 *
 *  The hook captures the initial store snapshot at mount and emits
 *  one `tab/activated` for the initial active tab so subscribers
 *  that mount AFTER the App can observe the current active tab from
 *  their first event (instead of polling the store). */
export function useEmitTabEvents(): void {
  // Snapshot ref starts as a dummy "no tabs" state so the initial
  // subscribe-fire emits one tab/opened per tab + one tab/activated
  // for the initial active tab. Matches what plugins would see if
  // they subscribed via `useEventSubscription` on first render.
  const prevRef = useRef<TabStateSnapshot>({ tabs: [], activeTabId: null });
  useEffect(() => {
    // Initial fire — capture current store, diff against empty.
    const initial: TabStateSnapshot = toSnapshot(useTabsStore.getState());
    diffAndEmitTabEvents(prevRef.current, initial);
    prevRef.current = initial;

    const unsubscribe = useTabsStore.subscribe((state) => {
      const next = toSnapshot(state);
      diffAndEmitTabEvents(prevRef.current, next);
      prevRef.current = next;
    });
    return () => unsubscribe();
  }, []);
}

function toSnapshot(state: {
  tabs: ReadonlyArray<TabState>;
  activeTabId: string;
}): TabStateSnapshot {
  return {
    tabs: state.tabs.map((t) => ({ id: t.id, title: t.title })),
    activeTabId: state.activeTabId,
  };
}
