// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  QUERY_EXECUTED,
  QUERY_FAILED,
  diffAndEmitQueryEvents,
  useEmitQueryEvents,
  type QueryExecutedPayload,
  type QueryFailedPayload,
  type QuerySnapshot,
} from './query-events.js';
import { eventBus } from './event-bus.js';
import { useTabsStore } from '../db/tabs-store.js';
import type { StatementOutcome } from '../db/types.js';

const okOutcome = (
  sql: string,
  rowCount = 1,
  durationMs = 5,
): StatementOutcome => ({
  status: 'ok',
  sql,
  durationMs,
  result: {
    Rows: {
      columns: [{ name: 'ID' }],
      rows: Array.from({ length: rowCount }, (_, i) => ({
        cells: [{ type: 'integer', value: i + 1 }],
      })),
    },
  },
});

const errOutcome = (
  sql: string,
  error = 'syntax error',
  durationMs = 2,
): StatementOutcome => ({
  status: 'err',
  sql,
  error,
  durationMs,
});

const snap = (
  overrides: Partial<QuerySnapshot> & { id: string },
): QuerySnapshot => ({
  id: overrides.id,
  sessionId: overrides.sessionId ?? 'sess-1',
  results: overrides.results ?? null,
});

describe('query-events topic constants (I6.6)', () => {
  it('exposes the two expected topic literals', () => {
    expect(QUERY_EXECUTED).toBe('query/executed');
    expect(QUERY_FAILED).toBe('query/failed');
  });
});

describe('diffAndEmitQueryEvents (I6.6)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emits query/executed once per ok outcome when results identity changes', () => {
    const handler = vi.fn();
    eventBus.subscribe<QueryExecutedPayload>('t', QUERY_EXECUTED, handler);
    diffAndEmitQueryEvents(
      [snap({ id: 'tab-1' })],
      [
        snap({
          id: 'tab-1',
          results: [okOutcome('SELECT 1', 1, 5), okOutcome('SELECT 2', 3, 7)],
        }),
      ],
    );
    expect(handler).toHaveBeenCalledTimes(2);
    const first = handler.mock.calls[0]?.[1] as QueryExecutedPayload;
    expect(first.sql).toBe('SELECT 1');
    expect(first.rowCount).toBe(1);
    expect(first.statementIndex).toBe(0);
    expect(first.durationMs).toBe(5);
    const second = handler.mock.calls[1]?.[1] as QueryExecutedPayload;
    expect(second.statementIndex).toBe(1);
    expect(second.rowCount).toBe(3);
  });

  it('emits query/failed for each err outcome', () => {
    const handler = vi.fn();
    eventBus.subscribe<QueryFailedPayload>('t', QUERY_FAILED, handler);
    diffAndEmitQueryEvents(
      [snap({ id: 'tab-1' })],
      [
        snap({
          id: 'tab-1',
          results: [errOutcome('SELECT bad', 'column unknown', 1)],
        }),
      ],
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as QueryFailedPayload;
    expect(payload.sql).toBe('SELECT bad');
    expect(payload.error).toBe('column unknown');
    expect(payload.statementIndex).toBe(0);
  });

  it('emits both executed + failed for a mixed batch (Firebird aborts after err)', () => {
    const executed = vi.fn();
    const failed = vi.fn();
    eventBus.subscribe('t', QUERY_EXECUTED, executed);
    eventBus.subscribe('t', QUERY_FAILED, failed);
    diffAndEmitQueryEvents(
      [snap({ id: 'tab-1' })],
      [
        snap({
          id: 'tab-1',
          results: [
            okOutcome('SELECT 1'),
            errOutcome('INSERT broken', 'constraint violation'),
          ],
        }),
      ],
    );
    expect(executed).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
    expect((failed.mock.calls[0]?.[1] as QueryFailedPayload).statementIndex).toBe(1);
  });

  it('does NOT re-emit when the same results identity is observed twice', () => {
    const handler = vi.fn();
    eventBus.subscribe('t', QUERY_EXECUTED, handler);
    const results = [okOutcome('SELECT 1')];
    const first = [snap({ id: 'tab-1', results })];
    const second = [snap({ id: 'tab-1', results })];
    diffAndEmitQueryEvents([snap({ id: 'tab-1' })], first);
    diffAndEmitQueryEvents(first, second);
    // Initial fire = 1, no second fire because identity matches.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit anything for tabs whose results stayed null', () => {
    const handler = vi.fn();
    eventBus.subscribe('t', QUERY_EXECUTED, handler);
    diffAndEmitQueryEvents(
      [snap({ id: 'tab-1' })],
      [snap({ id: 'tab-1' })],
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('walks multiple tabs independently in one diff', () => {
    const executed = vi.fn();
    eventBus.subscribe('t', QUERY_EXECUTED, executed);
    diffAndEmitQueryEvents(
      [snap({ id: 'tab-1' }), snap({ id: 'tab-2' })],
      [
        snap({ id: 'tab-1', results: [okOutcome('SELECT 1')] }),
        snap({ id: 'tab-2', results: [okOutcome('SELECT 2'), okOutcome('SELECT 3')] }),
      ],
    );
    expect(executed).toHaveBeenCalledTimes(3);
    const tabIds = executed.mock.calls.map((c) => (c[1] as QueryExecutedPayload).tabId);
    expect(tabIds.filter((t) => t === 'tab-1')).toHaveLength(1);
    expect(tabIds.filter((t) => t === 'tab-2')).toHaveLength(2);
  });

  it('uses the supplied now() for deterministic timestamps', () => {
    const handler = vi.fn();
    eventBus.subscribe<QueryExecutedPayload>('t', QUERY_EXECUTED, handler);
    diffAndEmitQueryEvents(
      [snap({ id: 'tab-1' })],
      [snap({ id: 'tab-1', results: [okOutcome('SELECT 1')] })],
      () => 7777,
    );
    expect((handler.mock.calls[0]?.[1] as QueryExecutedPayload).executedAt).toBe(7777);
  });
});

describe('useEmitQueryEvents (I6.6)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => {
    cleanup();
    eventBus.__reset();
  });

  it('emits query/executed when patchTab assigns a new results array', () => {
    const handler = vi.fn();
    eventBus.subscribe<QueryExecutedPayload>('t', QUERY_EXECUTED, handler);
    renderHook(() => useEmitQueryEvents());
    const tabId = useTabsStore.getState().activeTabId;
    act(() => {
      useTabsStore.getState().patchTab(tabId, {
        results: [okOutcome('SELECT 42')],
      });
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as QueryExecutedPayload).sql).toBe('SELECT 42');
  });

  it('emits query/failed when patchTab assigns an err outcome', () => {
    const handler = vi.fn();
    eventBus.subscribe<QueryFailedPayload>('t', QUERY_FAILED, handler);
    renderHook(() => useEmitQueryEvents());
    const tabId = useTabsStore.getState().activeTabId;
    act(() => {
      useTabsStore.getState().patchTab(tabId, {
        results: [errOutcome('SELECT bad', 'parse error')],
      });
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as QueryFailedPayload).error).toBe('parse error');
  });
});
