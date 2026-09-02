import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportStartingChain,
  type ExportStartingContext,
} from './export-starting.js';

const ctx = (overrides: Partial<ExportStartingContext> = {}): ExportStartingContext => ({
  tabId: 't1',
  sessionId: 's1',
  format: 'csv',
  scopeKind: 'statement',
  scopeLabel: 'SELECT * FROM CUSTOMERS',
  tables: ['CUSTOMERS'],
  ...overrides,
});

describe('exportStartingChain (I6.16)', () => {
  beforeEach(() => exportStartingChain.__reset());
  afterEach(() => exportStartingChain.__reset());

  it('empty chain allows the export (returns continue)', async () => {
    const decision = await exportStartingChain.run(ctx());
    expect(decision.action).toBe('continue');
  });

  it('handler can veto exports of a PII-flagged table', async () => {
    const PII = new Set(['CUSTOMERS', 'EMPLOYEES']);
    exportStartingChain.use((c) =>
      c.tables.some((t) => PII.has(t))
        ? { action: 'cancel', reason: 'Export of PII-flagged table requires approval.' }
        : { action: 'continue' },
    );
    const blocked = await exportStartingChain.run(ctx({ tables: ['CUSTOMERS'] }));
    expect(blocked.action).toBe('cancel');
    const allowed = await exportStartingChain.run(ctx({ tables: ['PRODUCTS'] }));
    expect(allowed.action).toBe('continue');
  });

  it('handler can veto by format (e.g. ban CSV)', async () => {
    exportStartingChain.use((c) =>
      c.format === 'csv'
        ? { action: 'cancel', reason: 'CSV export disallowed; use SQL.' }
        : { action: 'continue' },
    );
    const csv = await exportStartingChain.run(ctx({ format: 'csv' }));
    expect(csv.action).toBe('cancel');
    const sql = await exportStartingChain.run(ctx({ format: 'sql' }));
    expect(sql.action).toBe('continue');
  });

  it('handler can veto database-scope exports', async () => {
    exportStartingChain.use((c) =>
      c.scopeKind === 'database'
        ? { action: 'cancel', reason: 'Full-database export blocked outside business hours.' }
        : { action: 'continue' },
    );
    const db = await exportStartingChain.run(ctx({ scopeKind: 'database', tables: [] }));
    expect(db.action).toBe('cancel');
    const single = await exportStartingChain.run(ctx({ scopeKind: 'statement' }));
    expect(single.action).toBe('continue');
  });

  it('async handler can prompt + veto on user-deny', async () => {
    exportStartingChain.use(async () => {
      await Promise.resolve();
      return { action: 'cancel', reason: 'denied' };
    });
    const decision = await exportStartingChain.run(ctx());
    expect(decision.action).toBe('cancel');
  });

  it('multiple handlers run in registration order; first cancel wins', async () => {
    const second = vi.fn(() => ({ action: 'continue' as const }));
    exportStartingChain.use(() => ({ action: 'cancel', reason: 'first' }));
    exportStartingChain.use(second);
    const decision = await exportStartingChain.run(ctx());
    expect(decision).toEqual({ action: 'cancel', reason: 'first' });
    expect(second).not.toHaveBeenCalled();
  });

  it('tables is an empty array for database-scope exports', () => {
    const c = ctx({ scopeKind: 'database', tables: [] });
    expect(c.tables).toEqual([]);
  });

  it('handler can compose table + format policies', async () => {
    const PII = new Set(['CUSTOMERS']);
    exportStartingChain.use((c) => {
      if (c.tables.some((t) => PII.has(t)) && c.format !== 'sql') {
        return { action: 'cancel', reason: 'PII export must use SQL format.' };
      }
      return { action: 'continue' };
    });
    const piiCsv = await exportStartingChain.run(ctx({ tables: ['CUSTOMERS'], format: 'csv' }));
    expect(piiCsv.action).toBe('cancel');
    const piiSql = await exportStartingChain.run(ctx({ tables: ['CUSTOMERS'], format: 'sql' }));
    expect(piiSql.action).toBe('continue');
    const nonPiiCsv = await exportStartingChain.run(ctx({ tables: ['PRODUCTS'], format: 'csv' }));
    expect(nonPiiCsv.action).toBe('continue');
  });
});
