// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  EDITOR_CHANGED,
  EDITOR_FOCUSED,
  EDITOR_SAVED,
  EDITOR_SELECTION_CHANGED,
  diffAndEmitEditorEvents,
  emitEditorChanged,
  emitEditorFocused,
  emitEditorSaved,
  emitEditorSelectionChanged,
  useEmitEditorEvents,
  type EditorChangedPayload,
  type EditorFocusedPayload,
  type EditorSavedPayload,
  type EditorSelectionChangedPayload,
  type EditorSnapshot,
} from './editor-events.js';
import { eventBus } from './event-bus.js';
import { useTabsStore } from '../db/tabs-store.js';

const snap = (
  id: string,
  sql: string,
  executedSql: string | null = null,
): EditorSnapshot => ({ id, sql, executedSql });

describe('editor-events topic constants (I6.11)', () => {
  it('exposes the four expected topic literals', () => {
    expect(EDITOR_CHANGED).toBe('editor/changed');
    expect(EDITOR_SAVED).toBe('editor/saved');
    expect(EDITOR_FOCUSED).toBe('editor/focused');
    expect(EDITOR_SELECTION_CHANGED).toBe('editor/selection-changed');
  });
});

describe('diffAndEmitEditorEvents (I6.11)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emits editor/changed when sql differs between prev and next', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorChangedPayload>('p', EDITOR_CHANGED, handler);
    const count = diffAndEmitEditorEvents(
      [snap('a', 'SELECT 1')],
      [snap('a', 'SELECT 2')],
    );
    expect(count).toBe(1);
    const payload = handler.mock.calls[0]?.[1] as EditorChangedPayload;
    expect(payload.previousText).toBe('SELECT 1');
    expect(payload.nextText).toBe('SELECT 2');
  });

  it('emits editor/saved when executedSql transitions null → non-null', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorSavedPayload>('p', EDITOR_SAVED, handler);
    diffAndEmitEditorEvents(
      [snap('a', 'SELECT 1', null)],
      [snap('a', 'SELECT 1', 'SELECT 1')],
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as EditorSavedPayload).sql).toBe('SELECT 1');
  });

  it('emits editor/saved when executedSql changes string → string', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorSavedPayload>('p', EDITOR_SAVED, handler);
    diffAndEmitEditorEvents(
      [snap('a', 'SELECT 2', 'SELECT 1')],
      [snap('a', 'SELECT 2', 'SELECT 2')],
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as EditorSavedPayload).sql).toBe('SELECT 2');
  });

  it('does NOT emit editor/saved when executedSql becomes null (no false fires)', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', EDITOR_SAVED, handler);
    diffAndEmitEditorEvents(
      [snap('a', 'X', 'X')],
      [snap('a', 'X', null)],
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT emit for new tabs (tab/opened owns first-observation semantics)', () => {
    const changed = vi.fn();
    const saved = vi.fn();
    eventBus.subscribe('p', EDITOR_CHANGED, changed);
    eventBus.subscribe('p', EDITOR_SAVED, saved);
    diffAndEmitEditorEvents([], [snap('a', 'SELECT 1', 'SELECT 1')]);
    expect(changed).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });

  it('does NOT re-emit when sql + executedSql stay the same', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', EDITOR_CHANGED, handler);
    eventBus.subscribe('p', EDITOR_SAVED, handler);
    const t = snap('a', 'SELECT 1', 'SELECT 1');
    diffAndEmitEditorEvents([t], [t]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('uses the supplied now() for timestamps (deterministic)', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorChangedPayload>('p', EDITOR_CHANGED, handler);
    diffAndEmitEditorEvents(
      [snap('a', 'X')],
      [snap('a', 'Y')],
      () => 5555,
    );
    expect((handler.mock.calls[0]?.[1] as EditorChangedPayload).changedAt).toBe(5555);
  });

  it('emits multiple events across multiple tabs in one diff', () => {
    const changed = vi.fn();
    const saved = vi.fn();
    eventBus.subscribe('p', EDITOR_CHANGED, changed);
    eventBus.subscribe('p', EDITOR_SAVED, saved);
    diffAndEmitEditorEvents(
      [snap('a', 'X', null), snap('b', 'Y', null)],
      [snap('a', 'X2', null), snap('b', 'Y', 'Y')],
    );
    expect(changed).toHaveBeenCalledTimes(1); // a's text changed
    expect(saved).toHaveBeenCalledTimes(1); // b just executed
  });
});

describe('emit helpers + wildcards (I6.11)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emitEditorFocused dispatches with full payload', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorFocusedPayload>('p', EDITOR_FOCUSED, handler);
    emitEditorFocused({ tabId: 't', focusedAt: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as EditorFocusedPayload).tabId).toBe('t');
  });

  it('emitEditorSelectionChanged dispatches with anchor/head/length', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorSelectionChangedPayload>(
      'p',
      EDITOR_SELECTION_CHANGED,
      handler,
    );
    emitEditorSelectionChanged({
      tabId: 't', anchor: 10, head: 25, length: 15, changedAt: 1,
    });
    const payload = handler.mock.calls[0]?.[1] as EditorSelectionChangedPayload;
    expect(payload.anchor).toBe(10);
    expect(payload.head).toBe(25);
    expect(payload.length).toBe(15);
  });

  it('emitEditorSelectionChanged accepts negative length (backward selection)', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorSelectionChangedPayload>(
      'p',
      EDITOR_SELECTION_CHANGED,
      handler,
    );
    emitEditorSelectionChanged({
      tabId: 't', anchor: 25, head: 10, length: -15, changedAt: 1,
    });
    expect((handler.mock.calls[0]?.[1] as EditorSelectionChangedPayload).length).toBe(-15);
  });

  it('emitEditorChanged + emitEditorSaved fire imperatively too', () => {
    const c = vi.fn();
    const s = vi.fn();
    eventBus.subscribe('p', EDITOR_CHANGED, c);
    eventBus.subscribe('p', EDITOR_SAVED, s);
    emitEditorChanged({ tabId: 't', previousText: 'A', nextText: 'B', changedAt: 1 });
    emitEditorSaved({ tabId: 't', sql: 'B', savedAt: 2 });
    expect(c).toHaveBeenCalledTimes(1);
    expect(s).toHaveBeenCalledTimes(1);
  });

  it('wildcard subscriber `editor/*` sees all four events', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', 'editor/*', handler);
    emitEditorChanged({ tabId: 't', previousText: '', nextText: 'A', changedAt: 1 });
    emitEditorSaved({ tabId: 't', sql: 'A', savedAt: 2 });
    emitEditorFocused({ tabId: 't', focusedAt: 3 });
    emitEditorSelectionChanged({ tabId: 't', anchor: 0, head: 0, length: 0, changedAt: 4 });
    expect(handler).toHaveBeenCalledTimes(4);
  });
});

describe('useEmitEditorEvents (I6.11)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => {
    cleanup();
    eventBus.__reset();
  });

  it('emits editor/changed when patchTab({sql}) fires', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorChangedPayload>('p', EDITOR_CHANGED, handler);
    renderHook(() => useEmitEditorEvents());
    const id = useTabsStore.getState().activeTabId;
    const originalSql = useTabsStore.getState().tabs.find((t) => t.id === id)!.sql;
    const nextSql = originalSql + ' -- edited';
    act(() => useTabsStore.getState().patchTab(id, { sql: nextSql }));
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as EditorChangedPayload;
    expect(payload.previousText).toBe(originalSql);
    expect(payload.nextText).toBe(nextSql);
    // restore
    act(() => useTabsStore.getState().patchTab(id, { sql: originalSql }));
  });

  it('emits editor/saved when patchTab({executedSql}) fires', () => {
    const handler = vi.fn();
    eventBus.subscribe<EditorSavedPayload>('p', EDITOR_SAVED, handler);
    renderHook(() => useEmitEditorEvents());
    const id = useTabsStore.getState().activeTabId;
    act(() => useTabsStore.getState().patchTab(id, { executedSql: 'SELECT 1' }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as EditorSavedPayload).sql).toBe('SELECT 1');
    // restore
    act(() => useTabsStore.getState().patchTab(id, { executedSql: null }));
  });
});
