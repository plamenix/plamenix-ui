import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXPORT_COMPLETED,
  EXPORT_FAILED,
  EXPORT_STARTED,
  __resetExportIds,
  emitExportCompleted,
  emitExportFailed,
  emitExportStarted,
  newExportId,
  type ExportCompletedPayload,
  type ExportFailedPayload,
  type ExportStartedPayload,
} from './export-events.js';
import { eventBus } from './event-bus.js';

describe('export-events topic constants (I6.9)', () => {
  it('exposes the three expected topic literals', () => {
    expect(EXPORT_STARTED).toBe('export/started');
    expect(EXPORT_COMPLETED).toBe('export/completed');
    expect(EXPORT_FAILED).toBe('export/failed');
  });
});

describe('newExportId (I6.9)', () => {
  beforeEach(() => __resetExportIds());

  it('generates unique ids per call', () => {
    const a = newExportId();
    const b = newExportId();
    expect(a).not.toBe(b);
  });

  it('embeds the timestamp from the injected now()', () => {
    const id = newExportId(() => 1717000000000);
    expect(id).toMatch(/^exp_1717000000000_\d+$/);
  });

  it('counter resets via __resetExportIds for deterministic test runs', () => {
    newExportId(() => 100);
    newExportId(() => 100);
    __resetExportIds();
    const id = newExportId(() => 100);
    expect(id).toBe('exp_100_1');
  });
});

describe('emit helpers (I6.9)', () => {
  beforeEach(() => {
    eventBus.__reset();
    __resetExportIds();
  });
  afterEach(() => eventBus.__reset());

  it('emitExportStarted dispatches with full payload', () => {
    const handler = vi.fn();
    eventBus.subscribe<ExportStartedPayload>('p', EXPORT_STARTED, handler);
    const payload: ExportStartedPayload = {
      exportId: 'exp_1_1',
      tabId: 't1',
      sessionId: 's1',
      format: 'csv',
      scopeKind: 'statement',
      scopeLabel: 'SELECT * FROM CUSTOMERS',
      startedAt: 100,
    };
    emitExportStarted(payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toEqual(payload);
  });

  it('emitExportCompleted dispatches with full payload', () => {
    const handler = vi.fn();
    eventBus.subscribe<ExportCompletedPayload>('p', EXPORT_COMPLETED, handler);
    const payload: ExportCompletedPayload = {
      exportId: 'exp_1_1',
      durationMs: 250,
      byteSize: 4096,
      rowCount: 42,
      completedAt: 350,
    };
    emitExportCompleted(payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toEqual(payload);
  });

  it('emitExportCompleted accepts null byteSize + rowCount (runner-not-surfacing path)', () => {
    const handler = vi.fn();
    eventBus.subscribe<ExportCompletedPayload>('p', EXPORT_COMPLETED, handler);
    emitExportCompleted({
      exportId: 'exp_1_1',
      durationMs: 100,
      byteSize: null,
      rowCount: null,
      completedAt: 200,
    });
    const payload = handler.mock.calls[0]?.[1] as ExportCompletedPayload;
    expect(payload.byteSize).toBeNull();
    expect(payload.rowCount).toBeNull();
  });

  it('emitExportFailed dispatches with error string', () => {
    const handler = vi.fn();
    eventBus.subscribe<ExportFailedPayload>('p', EXPORT_FAILED, handler);
    emitExportFailed({
      exportId: 'exp_1_1',
      durationMs: 50,
      error: 'Disk full',
      failedAt: 150,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as ExportFailedPayload).error).toBe('Disk full');
  });

  it('start ↔ completed pair correlates by exportId', () => {
    const startedHandler = vi.fn();
    const completedHandler = vi.fn();
    eventBus.subscribe<ExportStartedPayload>('p', EXPORT_STARTED, startedHandler);
    eventBus.subscribe<ExportCompletedPayload>('p', EXPORT_COMPLETED, completedHandler);
    const id = newExportId(() => 1);
    emitExportStarted({
      exportId: id, tabId: 't', sessionId: 's', format: 'csv',
      scopeKind: 'statement', scopeLabel: 'q', startedAt: 1,
    });
    emitExportCompleted({
      exportId: id, durationMs: 10, byteSize: 100, rowCount: 5, completedAt: 11,
    });
    expect((startedHandler.mock.calls[0]?.[1] as ExportStartedPayload).exportId).toBe(id);
    expect((completedHandler.mock.calls[0]?.[1] as ExportCompletedPayload).exportId).toBe(id);
  });

  it('wildcard subscriber `export/*` sees all three events', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', 'export/*', handler);
    emitExportStarted({
      exportId: 'a', tabId: 't', sessionId: 's', format: 'csv',
      scopeKind: 'tables', scopeLabel: 'T1, T2', startedAt: 1,
    });
    emitExportCompleted({
      exportId: 'a', durationMs: 5, byteSize: 10, rowCount: 1, completedAt: 6,
    });
    emitExportFailed({
      exportId: 'b', durationMs: 2, error: 'fail', failedAt: 3,
    });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('scopeKind discriminates statement / tables / database', () => {
    const handler = vi.fn();
    eventBus.subscribe<ExportStartedPayload>('p', EXPORT_STARTED, handler);
    const base = {
      exportId: 'e', tabId: 't', sessionId: 's', format: 'sql', scopeLabel: 'L', startedAt: 0,
    };
    emitExportStarted({ ...base, scopeKind: 'statement' });
    emitExportStarted({ ...base, scopeKind: 'tables' });
    emitExportStarted({ ...base, scopeKind: 'database' });
    const kinds = handler.mock.calls.map((c) => (c[1] as ExportStartedPayload).scopeKind);
    expect(kinds).toEqual(['statement', 'tables', 'database']);
  });
});
