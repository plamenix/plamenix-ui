import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __hasConfirmationProvider,
  installDestructiveDropInterceptor,
  isDestructiveSql,
  queryExecutingChain,
  setConfirmationProvider,
  type QueryExecutingContext,
} from './query-executing.js';

const ctx = (sql: string): QueryExecutingContext => ({
  tabId: 't1',
  sessionId: 's1',
  sql,
});

describe('isDestructiveSql (I6.12)', () => {
  it('matches DROP TABLE / VIEW / PROCEDURE / TRIGGER / GENERATOR / SEQUENCE / DOMAIN / INDEX', () => {
    expect(isDestructiveSql('DROP TABLE customers')).toBe(true);
    expect(isDestructiveSql('DROP VIEW v_active')).toBe(true);
    expect(isDestructiveSql('DROP PROCEDURE p_calc')).toBe(true);
    expect(isDestructiveSql('DROP TRIGGER bi_orders')).toBe(true);
    expect(isDestructiveSql('DROP GENERATOR gen_id')).toBe(true);
    expect(isDestructiveSql('DROP SEQUENCE seq_id')).toBe(true);
    expect(isDestructiveSql('DROP DOMAIN d_email')).toBe(true);
    expect(isDestructiveSql('DROP INDEX idx_name')).toBe(true);
  });

  it('matches TRUNCATE TABLE', () => {
    expect(isDestructiveSql('TRUNCATE TABLE orders')).toBe(true);
  });

  it('matches unconstrained DELETE FROM', () => {
    expect(isDestructiveSql('DELETE FROM orders')).toBe(true);
  });

  it('does NOT match DELETE FROM with WHERE', () => {
    expect(isDestructiveSql('DELETE FROM orders WHERE id = 1')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isDestructiveSql('drop table foo')).toBe(true);
    expect(isDestructiveSql('Drop Table foo')).toBe(true);
  });

  it('does NOT match plain SELECT / UPDATE / INSERT', () => {
    expect(isDestructiveSql('SELECT * FROM customers')).toBe(false);
    expect(isDestructiveSql('UPDATE customers SET name = ?')).toBe(false);
    expect(isDestructiveSql('INSERT INTO customers VALUES (1)')).toBe(false);
  });

  it('matches DROP anywhere in multi-statement batch', () => {
    const sql = `
      SELECT * FROM customers;
      DROP TABLE orders;
    `;
    expect(isDestructiveSql(sql)).toBe(true);
  });
});

describe('installDestructiveDropInterceptor (I6.12)', () => {
  beforeEach(() => {
    queryExecutingChain.__reset();
    setConfirmationProvider(null);
  });
  afterEach(() => {
    queryExecutingChain.__reset();
    setConfirmationProvider(null);
  });

  it('allows non-destructive SQL through without prompting', async () => {
    const provider = vi.fn(() => Promise.resolve(true));
    setConfirmationProvider(provider);
    installDestructiveDropInterceptor();
    const decision = await queryExecutingChain.run(ctx('SELECT * FROM customers'));
    expect(decision.action).toBe('continue');
    expect(provider).not.toHaveBeenCalled();
  });

  it('prompts via confirmation provider for destructive SQL', async () => {
    const provider = vi.fn(() => Promise.resolve(true));
    setConfirmationProvider(provider);
    installDestructiveDropInterceptor();
    const decision = await queryExecutingChain.run(ctx('DROP TABLE customers'));
    expect(provider).toHaveBeenCalledTimes(1);
    const req = provider.mock.calls[0]?.[0];
    expect(req?.severity).toBe('danger');
    expect(req?.title).toBe('Confirm destructive statement');
    expect(decision.action).toBe('continue');
  });

  it('cancels when user denies the confirmation prompt', async () => {
    setConfirmationProvider(() => Promise.resolve(false));
    installDestructiveDropInterceptor();
    const decision = await queryExecutingChain.run(ctx('DROP TABLE customers'));
    expect(decision.action).toBe('cancel');
    if (decision.action === 'cancel') {
      expect(decision.reason).toContain('Cancelled by user');
    }
  });

  it('cancels when destructive SQL hits the chain with no confirmation provider installed', async () => {
    installDestructiveDropInterceptor();
    expect(__hasConfirmationProvider()).toBe(false);
    const decision = await queryExecutingChain.run(ctx('DROP TABLE customers'));
    expect(decision.action).toBe('cancel');
    if (decision.action === 'cancel') {
      expect(decision.reason).toContain('no confirmation handler installed');
    }
  });

  it('uninstalls when its registration is disposed', async () => {
    const reg = installDestructiveDropInterceptor();
    reg.dispose();
    const decision = await queryExecutingChain.run(ctx('DROP TABLE customers'));
    expect(decision.action).toBe('continue');
  });
});

describe('setConfirmationProvider / __hasConfirmationProvider (I6.12)', () => {
  afterEach(() => setConfirmationProvider(null));

  it('reports false when no provider is installed', () => {
    setConfirmationProvider(null);
    expect(__hasConfirmationProvider()).toBe(false);
  });

  it('reports true after a provider is installed', () => {
    setConfirmationProvider(() => Promise.resolve(true));
    expect(__hasConfirmationProvider()).toBe(true);
  });

  it('reports false after un-installation', () => {
    setConfirmationProvider(() => Promise.resolve(true));
    setConfirmationProvider(null);
    expect(__hasConfirmationProvider()).toBe(false);
  });
});

describe('queryExecutingChain composition (I6.12)', () => {
  beforeEach(() => {
    queryExecutingChain.__reset();
    setConfirmationProvider(null);
  });
  afterEach(() => {
    queryExecutingChain.__reset();
    setConfirmationProvider(null);
  });

  it('plugin handler can veto independently of the destructive built-in', async () => {
    installDestructiveDropInterceptor();
    queryExecutingChain.use((c) =>
      c.sql.toLowerCase().includes('forbidden_table')
        ? { action: 'cancel', reason: 'policy: forbidden table' }
        : { action: 'continue' },
    );
    setConfirmationProvider(() => Promise.resolve(true));
    const decision = await queryExecutingChain.run(
      ctx('SELECT * FROM forbidden_table'),
    );
    expect(decision.action).toBe('cancel');
    if (decision.action === 'cancel') {
      expect(decision.reason).toContain('forbidden');
    }
  });
});
