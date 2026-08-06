// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  CONNECTION_CLOSED,
  CONNECTION_FAILED,
  CONNECTION_HEALTH_CHANGED,
  CONNECTION_OPENED,
  diffAndEmitConnectionEvents,
  useEmitConnectionEvents,
  type ConnectionClosedPayload,
  type ConnectionFailedPayload,
  type ConnectionHealthChangedPayload,
  type ConnectionOpenedPayload,
  type ConnectionSnapshot,
} from './connection-events.js';
import { eventBus } from './event-bus.js';
import { useTabsStore } from '../db/tabs-store.js';

const snap = (
  overrides: Partial<ConnectionSnapshot> & { id: string },
): ConnectionSnapshot => ({
  id: overrides.id,
  sessionId: overrides.sessionId ?? null,
  health: overrides.health ?? 'unknown',
  error: overrides.error ?? null,
  host: overrides.host ?? 'localhost',
  port: overrides.port ?? 3050,
  database: overrides.database ?? '/var/lib/firebird/data/test.fdb',
  user: overrides.user ?? 'SYSDBA',
});

describe('connection-events topic constants (I6.5)', () => {
  it('exposes the four expected topic literals', () => {
    expect(CONNECTION_OPENED).toBe('connection/opened');
    expect(CONNECTION_FAILED).toBe('connection/failed');
    expect(CONNECTION_CLOSED).toBe('connection/closed');
    expect(CONNECTION_HEALTH_CHANGED).toBe('connection/health-changed');
  });
});

describe('diffAndEmitConnectionEvents (I6.5)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emits connection/opened when sessionId goes null → string', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionOpenedPayload>('t', CONNECTION_OPENED, handler);
    diffAndEmitConnectionEvents(
      [snap({ id: 'tab-1' })],
      [snap({ id: 'tab-1', sessionId: 'sess-1' })],
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as ConnectionOpenedPayload;
    expect(payload.tabId).toBe('tab-1');
    expect(payload.sessionId).toBe('sess-1');
    expect(payload.host).toBe('localhost');
    expect(payload.user).toBe('SYSDBA');
  });

  it('emits connection/closed when sessionId goes string → null', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionClosedPayload>('t', CONNECTION_CLOSED, handler);
    diffAndEmitConnectionEvents(
      [snap({ id: 'tab-1', sessionId: 'sess-1' })],
      [snap({ id: 'tab-1', sessionId: null })],
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as ConnectionClosedPayload;
    expect(payload.tabId).toBe('tab-1');
    expect(payload.previousSessionId).toBe('sess-1');
  });

  it('emits connection/health-changed on health transitions with prev + next', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionHealthChangedPayload>(
      't',
      CONNECTION_HEALTH_CHANGED,
      handler,
    );
    diffAndEmitConnectionEvents(
      [snap({ id: 'tab-1', sessionId: 'sess-1', health: 'healthy' })],
      [snap({ id: 'tab-1', sessionId: 'sess-1', health: 'reconnecting' })],
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as ConnectionHealthChangedPayload;
    expect(payload.previousHealth).toBe('healthy');
    expect(payload.nextHealth).toBe('reconnecting');
    expect(payload.sessionId).toBe('sess-1');
  });

  it('emits connection/failed when error goes null → non-null while sessionId is null', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionFailedPayload>('t', CONNECTION_FAILED, handler);
    diffAndEmitConnectionEvents(
      [snap({ id: 'tab-1' })],
      [snap({ id: 'tab-1', error: 'host unreachable' })],
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as ConnectionFailedPayload;
    expect(payload.error).toBe('host unreachable');
    expect(payload.host).toBe('localhost');
  });

  it('does NOT emit connection/failed when error appears WITH an active session (different error kind)', () => {
    const handler = vi.fn();
    eventBus.subscribe('t', CONNECTION_FAILED, handler);
    diffAndEmitConnectionEvents(
      [snap({ id: 'tab-1', sessionId: 'sess-1' })],
      [snap({ id: 'tab-1', sessionId: 'sess-1', error: 'query failed' })],
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('emits both opened + health-changed when a tab connects + flips health in one diff', () => {
    const opened = vi.fn();
    const healthChanged = vi.fn();
    eventBus.subscribe('t', CONNECTION_OPENED, opened);
    eventBus.subscribe('t', CONNECTION_HEALTH_CHANGED, healthChanged);
    diffAndEmitConnectionEvents(
      [snap({ id: 'tab-1' })],
      [snap({ id: 'tab-1', sessionId: 'sess-1', health: 'healthy' })],
    );
    expect(opened).toHaveBeenCalledTimes(1);
    expect(healthChanged).toHaveBeenCalledTimes(1);
  });

  it('new tab already holding a session at first observation emits opened', () => {
    const handler = vi.fn();
    eventBus.subscribe('t', CONNECTION_OPENED, handler);
    diffAndEmitConnectionEvents(
      [],
      [snap({ id: 'tab-1', sessionId: 'sess-1' })],
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses the supplied now() for deterministic timestamps', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionOpenedPayload>('t', CONNECTION_OPENED, handler);
    diffAndEmitConnectionEvents(
      [snap({ id: 'tab-1' })],
      [snap({ id: 'tab-1', sessionId: 'sess-1' })],
      () => 9999,
    );
    expect((handler.mock.calls[0]?.[1] as ConnectionOpenedPayload).openedAt).toBe(9999);
  });
});

describe('useEmitConnectionEvents (I6.5)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => {
    cleanup();
    eventBus.__reset();
  });

  it('emits connection/opened when patchTab assigns a sessionId', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionOpenedPayload>('t', CONNECTION_OPENED, handler);
    renderHook(() => useEmitConnectionEvents());
    const tabId = useTabsStore.getState().activeTabId;
    const before = handler.mock.calls.length;
    act(() => {
      useTabsStore.getState().patchTab(tabId, { sessionId: 'sess-99' });
    });
    expect(handler.mock.calls.length).toBeGreaterThan(before);
    const payload = handler.mock.calls[handler.mock.calls.length - 1]?.[1] as ConnectionOpenedPayload;
    expect(payload.tabId).toBe(tabId);
    expect(payload.sessionId).toBe('sess-99');
  });

  it('emits connection/closed when sessionId is patched back to null', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionClosedPayload>('t', CONNECTION_CLOSED, handler);
    renderHook(() => useEmitConnectionEvents());
    const tabId = useTabsStore.getState().activeTabId;
    act(() => {
      useTabsStore.getState().patchTab(tabId, { sessionId: 'sess-99' });
    });
    act(() => {
      useTabsStore.getState().patchTab(tabId, { sessionId: null });
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as ConnectionClosedPayload).previousSessionId).toBe(
      'sess-99',
    );
  });

  it('emits connection/health-changed when patchTab flips health', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionHealthChangedPayload>(
      't',
      CONNECTION_HEALTH_CHANGED,
      handler,
    );
    renderHook(() => useEmitConnectionEvents());
    const tabId = useTabsStore.getState().activeTabId;
    act(() => {
      useTabsStore.getState().patchTab(tabId, { health: 'healthy' });
    });
    act(() => {
      useTabsStore.getState().patchTab(tabId, { health: 'reconnecting' });
    });
    expect(handler).toHaveBeenCalledTimes(2);
    const last = handler.mock.calls[1]?.[1] as ConnectionHealthChangedPayload;
    expect(last.previousHealth).toBe('healthy');
    expect(last.nextHealth).toBe('reconnecting');
  });

  it('emits connection/failed when patchTab sets an error while disconnected', () => {
    const handler = vi.fn();
    eventBus.subscribe<ConnectionFailedPayload>('t', CONNECTION_FAILED, handler);
    renderHook(() => useEmitConnectionEvents());
    const tabId = useTabsStore.getState().activeTabId;
    act(() => {
      useTabsStore.getState().patchTab(tabId, { error: 'host unreachable' });
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as ConnectionFailedPayload).error).toBe(
      'host unreachable',
    );
  });
});
