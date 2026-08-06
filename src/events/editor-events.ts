/**
 * Editor events (I6.11) — four topics covering the SQL editor
 * lifecycle. Mixed-mode family (same shape as I6.8 schema-events):
 *
 *   - `editor/changed`            — diff-on-subscribe against
 *                                    `tab.sql`. Fires once per text
 *                                    change. Frequency = CodeMirror's
 *                                    batched-update rate (typically
 *                                    one event per keystroke or per
 *                                    paste). Subscribers wanting
 *                                    debounced semantics should
 *                                    debounce in their handler.
 *   - `editor/saved`              — diff-on-subscribe against
 *                                    `tab.executedSql`. Fires when
 *                                    the user runs the query (the
 *                                    only persistence event Plamenix
 *                                    has — there's no separate save
 *                                    action).
 *   - `editor/focused`            — imperative emit. SqlEditor wires
 *                                    a DOM focus listener + calls
 *                                    `emitEditorFocused` directly.
 *   - `editor/selection-changed`  — imperative emit. CodeMirror
 *                                    update-listener calls
 *                                    `emitEditorSelectionChanged`
 *                                    with the new selection range.
 *
 * The two store-backed events ship a `useEmitEditorEvents()` hook
 * that subscribes to `useTabsStore` and walks the diff. The two
 * imperative events have emit helpers only — wiring lives in
 * `SqlEditor` (deferred — see tracker).
 */

import { useEffect, useRef } from 'react';
import { eventBus } from './event-bus.js';
import { useTabsStore, type TabState } from '../db/tabs-store.js';

/** Topic literals. */
export const EDITOR_CHANGED = 'editor/changed' as const;
export const EDITOR_SAVED = 'editor/saved' as const;
export const EDITOR_FOCUSED = 'editor/focused' as const;
export const EDITOR_SELECTION_CHANGED = 'editor/selection-changed' as const;

export interface EditorChangedPayload {
  tabId: string;
  /** Previous text (entire document). Useful for diff-tracking
   *  subscribers; subscribers that only need the current text read
   *  `tab.sql` from the store. */
  previousText: string;
  nextText: string;
  changedAt: number;
}

export interface EditorSavedPayload {
  tabId: string;
  /** The SQL that was executed (now the new `executedSql`). Same
   *  string subscribers see in `query/executed` for each statement
   *  in the batch — but `editor/saved` fires once per execute call,
   *  not per statement, so it's the cleaner topic for "user ran a
   *  query" subscribers (history, recent-queries persistence). */
  sql: string;
  savedAt: number;
}

export interface EditorFocusedPayload {
  tabId: string;
  focusedAt: number;
}

export interface EditorSelectionChangedPayload {
  tabId: string;
  /** Selection anchor offset (the side the user clicked first). */
  anchor: number;
  /** Selection head offset (the side the cursor is at). Same as
   *  `anchor` when the selection is empty (cursor-only). */
  head: number;
  /** `head - anchor`. Positive when forward-selected, negative when
   *  backward-selected, zero for cursor-only. */
  length: number;
  changedAt: number;
}

export function emitEditorChanged(payload: EditorChangedPayload): void {
  eventBus.emit<EditorChangedPayload>(EDITOR_CHANGED, payload);
}

export function emitEditorSaved(payload: EditorSavedPayload): void {
  eventBus.emit<EditorSavedPayload>(EDITOR_SAVED, payload);
}

export function emitEditorFocused(payload: EditorFocusedPayload): void {
  eventBus.emit<EditorFocusedPayload>(EDITOR_FOCUSED, payload);
}

export function emitEditorSelectionChanged(
  payload: EditorSelectionChangedPayload,
): void {
  eventBus.emit<EditorSelectionChangedPayload>(
    EDITOR_SELECTION_CHANGED,
    payload,
  );
}

/** Per-tab snapshot for the diff. Carries the two fields the diff
 *  compares (sql + executedSql); decouples test fixtures from the
 *  full `TabState`. */
export interface EditorSnapshot {
  id: string;
  sql: string;
  executedSql: string | null;
}

/** Pure diff — emits `editor/changed` for each tab whose `sql`
 *  changed and `editor/saved` for each tab whose `executedSql`
 *  changed to a non-null value. Returns total event count. */
export function diffAndEmitEditorEvents(
  prev: ReadonlyArray<EditorSnapshot>,
  next: ReadonlyArray<EditorSnapshot>,
  now: () => number = Date.now,
): number {
  let count = 0;
  const prevById = new Map(prev.map((t) => [t.id, t]));
  for (const t of next) {
    const before = prevById.get(t.id);
    if (!before) continue; // new tabs are reported by tab/opened
    if (before.sql !== t.sql) {
      emitEditorChanged({
        tabId: t.id,
        previousText: before.sql,
        nextText: t.sql,
        changedAt: now(),
      });
      count++;
    }
    // `executedSql` is `null` before first execute; emit `saved` on
    // every replacement (including null → string) but not on the
    // identity-match case (no re-emit).
    if (before.executedSql !== t.executedSql && t.executedSql !== null) {
      emitEditorSaved({
        tabId: t.id,
        sql: t.executedSql,
        savedAt: now(),
      });
      count++;
    }
  }
  return count;
}

function toSnapshot(state: { tabs: ReadonlyArray<TabState> }): EditorSnapshot[] {
  return state.tabs.map((t) => ({
    id: t.id,
    sql: t.sql,
    executedSql: t.executedSql,
  }));
}

/** React hook that subscribes to `useTabsStore` + emits
 *  `editor/changed` + `editor/saved` events on every relevant
 *  transition. Mount once at the App component:
 *
 *    useEmitEditorEvents();
 *
 *  Initial mount captures the current store snapshot without
 *  emitting — editor text is user-state, not a "first-observation
 *  event"; replaying it on mount would create false-positives for
 *  long-running plugins that re-mount. */
export function useEmitEditorEvents(): void {
  const prevRef = useRef<EditorSnapshot[] | null>(null);
  useEffect(() => {
    prevRef.current = toSnapshot(useTabsStore.getState());
    const unsubscribe = useTabsStore.subscribe((state) => {
      const next = toSnapshot(state);
      if (prevRef.current) {
        diffAndEmitEditorEvents(prevRef.current, next);
      }
      prevRef.current = next;
    });
    return () => unsubscribe();
  }, []);
}
