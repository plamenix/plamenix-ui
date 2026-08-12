/**
 * The veto and the reporting around an export.
 *
 * Export is how rows leave the database and land on somebody's disk,
 * and `export.starting` is what a deployment uses to say "not this
 * table". Neither shell tested it, and it existed twice — a veto
 * enforced in one edition and not the other is worse than no veto,
 * because it reads as covered.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '../events/event-bus.js';
import { exportStartingChain } from '../interceptors/export-starting.js';
import type { InterceptorRegistration } from '../interceptors/chain.js';
import { describeExportScope, runGuardedExport } from './guarded-export.js';
import type { StreamedExportRequest, StreamedExportResult } from './streamed-export.js';

const registered: InterceptorRegistration[] = [];
const disposers: { dispose: () => void }[] = [];

function intercept(handler: Parameters<typeof exportStartingChain.use>[0]): void {
  registered.push(exportStartingChain.use(handler, { priority: 10 }));
}

/** Records every export event emitted during a test, in order. */
function collectExportEvents(): { topic: string; payload: unknown }[] {
  const seen: { topic: string; payload: unknown }[] = [];
  disposers.push(
    eventBus.subscribe('test.guarded-export', 'export/*', (topic, payload) => {
      seen.push({ topic, payload });
    }),
  );
  return seen;
}

afterEach(() => {
  while (registered.length > 0) registered.pop()?.dispose();
  while (disposers.length > 0) disposers.pop()?.dispose();
});

const RESULT: StreamedExportResult = {
  blob: new Blob(['abcdef']),
  suggestedFilename: 'export.csv',
};

function request(overrides: Partial<StreamedExportRequest> = {}): StreamedExportRequest {
  return {
    sessionId: 's1',
    format: 'csv',
    scope: { kind: 'tables', tables: [{ name: 'CUSTOMERS' }, { name: 'ORDERS' }] },
    ...overrides,
  } as StreamedExportRequest;
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    tabId: 't1',
    transfer: vi.fn().mockResolvedValue(RESULT),
    now: () => 1_000,
    makeExportId: () => 'exp-1',
    ...overrides,
  } as Parameters<typeof runGuardedExport>[1];
}

describe('describeExportScope', () => {
  it('lists the tables for a whole-table export', () => {
    expect(
      describeExportScope({
        kind: 'tables',
        tables: [{ name: 'A' }, { name: 'B' }],
      } as StreamedExportRequest['scope']),
    ).toEqual({ scopeLabel: 'A, B', tables: ['A', 'B'] });
  });

  it('prefers a statement’s own label', () => {
    expect(
      describeExportScope({
        kind: 'statement',
        label: 'Quarterly report',
        sql: 'SELECT ...',
        table: { name: 'SALES' },
      } as StreamedExportRequest['scope']).scopeLabel,
    ).toBe('Quarterly report');
  });

  it('falls back to the table, then to the SQL', () => {
    const byTable = describeExportScope({
      kind: 'statement',
      sql: 'SELECT * FROM SALES',
      table: { name: 'SALES' },
    } as StreamedExportRequest['scope']);
    expect(byTable.scopeLabel).toBe('SALES');
    expect(byTable.tables).toEqual(['SALES']);

    const bySql = describeExportScope({
      kind: 'statement',
      sql: 'SELECT 1 FROM RDB$DATABASE',
    } as StreamedExportRequest['scope']);
    expect(bySql.scopeLabel).toBe('SELECT 1 FROM RDB$DATABASE');
    // No table means nothing for a table-scoped policy to match on,
    // which is the honest answer rather than a guess.
    expect(bySql.tables).toEqual([]);
  });

  it('truncates a long statement rather than putting a whole query in a label', () => {
    const sql = `SELECT ${'x'.repeat(200)}`;
    const described = describeExportScope({
      kind: 'statement',
      sql,
    } as StreamedExportRequest['scope']);
    expect(described.scopeLabel).toHaveLength(80);
  });
});

describe('the export.starting veto', () => {
  it('shows a handler what is about to leave, before anything is read', () => {
    const seen: unknown[] = [];
    intercept((ctx) => {
      seen.push(ctx);
      return { action: 'continue' };
    });

    return runGuardedExport(request(), options()).then(() => {
      expect(seen[0]).toMatchObject({
        tabId: 't1',
        sessionId: 's1',
        format: 'csv',
        scopeKind: 'tables',
        scopeLabel: 'CUSTOMERS, ORDERS',
        tables: ['CUSTOMERS', 'ORDERS'],
      });
    });
  });

  it('refuses before the transfer runs, so no rows are read', async () => {
    const events = collectExportEvents();
    const opts = options();
    intercept(() => ({ action: 'cancel', reason: 'CUSTOMERS may not be exported' }));

    await expect(runGuardedExport(request(), opts)).rejects.toThrow(
      /CUSTOMERS may not be exported/,
    );
    expect(opts.transfer).not.toHaveBeenCalled();
    // Nothing started, so nothing is announced — a refusal is not a
    // fault for a listener to alert on.
    expect(events).toEqual([]);
  });

  it('throws rather than returning an empty result', async () => {
    // The caller is a file-save flow. A refusal that looked like a
    // successful empty export would write an empty file.
    intercept(() => ({ action: 'cancel', reason: 'nope' }));
    await expect(runGuardedExport(request(), options())).rejects.toBeInstanceOf(Error);
  });
});

describe('the lifecycle events', () => {
  it('announces the start with what is being exported', async () => {
    const events = collectExportEvents();
    await runGuardedExport(request(), options());

    expect(events[0]?.payload).toMatchObject({
      exportId: 'exp-1',
      tabId: 't1',
      sessionId: 's1',
      format: 'csv',
      scopeLabel: 'CUSTOMERS, ORDERS',
      startedAt: 1_000,
    });
  });

  it('announces completion with the size that actually left', async () => {
    const events = collectExportEvents();
    await runGuardedExport(request(), options());

    const completed = events.at(-1)?.payload as { byteSize: number; exportId: string };
    expect(completed.exportId).toBe('exp-1');
    expect(completed.byteSize).toBe(6);
  });

  it('announces a failure and lets the original error through', async () => {
    // The caller's error handling is not this wrapper's to change.
    const events = collectExportEvents();
    const boom = new Error('session closed mid-export');

    await expect(
      runGuardedExport(request(), options({ transfer: vi.fn().mockRejectedValue(boom) })),
    ).rejects.toBe(boom);

    const failed = events.at(-1)?.payload as { error: string; exportId: string };
    expect(failed.exportId).toBe('exp-1');
    expect(failed.error).toContain('session closed mid-export');
  });

  it('never reports both a completion and a failure', async () => {
    const events = collectExportEvents();
    await runGuardedExport(request(), options({ transfer: vi.fn().mockRejectedValue(new Error('x')) })).catch(
      () => undefined,
    );

    const topics = events.map((e) => e.topic);
    expect(topics.filter((t) => t.includes('completed'))).toHaveLength(0);
    expect(topics.filter((t) => t.includes('failed'))).toHaveLength(1);
  });

  it('gives the transfer the same export id it announced', async () => {
    // The desktop shell filters streamed chunks by this id. A mismatch
    // would silently drop every chunk and produce an empty file.
    const opts = options();
    await runGuardedExport(request(), opts);

    expect(opts.transfer).toHaveBeenCalledWith(expect.anything(), 'exp-1');
  });
});
