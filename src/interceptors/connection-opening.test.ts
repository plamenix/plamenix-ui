import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectionOpeningChain,
  type ConnectionOpeningContext,
} from './connection-opening.js';

const ctx = (overrides: Partial<ConnectionOpeningContext> = {}): ConnectionOpeningContext => ({
  tabId: 't1',
  profileId: 'prof-1',
  host: 'localhost',
  port: 3050,
  database: '/var/lib/firebird/data/test.fdb',
  user: 'SYSDBA',
  pureRust: false,
  encryptionRequired: false,
  charset: 'UTF8',
  ...overrides,
});

describe('connectionOpeningChain (I6.15)', () => {
  beforeEach(() => connectionOpeningChain.__reset());
  afterEach(() => connectionOpeningChain.__reset());

  it('empty chain allows the attach (returns continue)', async () => {
    const decision = await connectionOpeningChain.run(ctx());
    expect(decision.action).toBe('continue');
  });

  it('handler receives host + port + database for deployment gating', async () => {
    const seen = vi.fn(() => ({ action: 'continue' as const }));
    connectionOpeningChain.use(seen);
    await connectionOpeningChain.run(ctx({ host: 'prod-fb-01.internal', port: 3051 }));
    const got = seen.mock.calls[0]?.[0] as ConnectionOpeningContext;
    expect(got.host).toBe('prod-fb-01.internal');
    expect(got.port).toBe(3051);
  });

  it('handler can veto production-host attaches without a tunnel flag', async () => {
    connectionOpeningChain.use((c) =>
      c.host.endsWith('.prod.internal')
        ? { action: 'cancel', reason: 'Direct attach to prod-* hosts blocked; use the SSH-tunnel workflow.' }
        : { action: 'continue' },
    );
    const prod = await connectionOpeningChain.run(ctx({ host: 'fb-01.prod.internal' }));
    expect(prod.action).toBe('cancel');
    const dev = await connectionOpeningChain.run(ctx({ host: 'fb-01.dev.internal' }));
    expect(dev.action).toBe('continue');
  });

  it('handler can veto when encryptionRequired is false on production hosts', async () => {
    connectionOpeningChain.use((c) =>
      c.host.startsWith('prod-') && !c.encryptionRequired
        ? { action: 'cancel', reason: 'Production attach requires encryptionRequired = true.' }
        : { action: 'continue' },
    );
    const insecure = await connectionOpeningChain.run(ctx({ host: 'prod-fb', encryptionRequired: false }));
    expect(insecure.action).toBe('cancel');
    const secure = await connectionOpeningChain.run(ctx({ host: 'prod-fb', encryptionRequired: true }));
    expect(secure.action).toBe('continue');
  });

  it('async handler can prompt + veto on user-deny', async () => {
    connectionOpeningChain.use(async () => {
      await Promise.resolve();
      return { action: 'cancel', reason: 'denied' };
    });
    const decision = await connectionOpeningChain.run(ctx());
    expect(decision.action).toBe('cancel');
  });

  it('multiple handlers run in registration order; first cancel wins', async () => {
    const second = vi.fn(() => ({ action: 'continue' as const }));
    connectionOpeningChain.use(() => ({ action: 'cancel', reason: 'first' }));
    connectionOpeningChain.use(second);
    const decision = await connectionOpeningChain.run(ctx());
    expect(decision).toEqual({ action: 'cancel', reason: 'first' });
    expect(second).not.toHaveBeenCalled();
  });

  it('context does NOT carry password (regression guard)', () => {
    const c = ctx();
    expect('password' in c).toBe(false);
    expect('encryptionKey' in c).toBe(false);
  });

  it('profileId is null for ad-hoc connections', async () => {
    const seen = vi.fn(() => ({ action: 'continue' as const }));
    connectionOpeningChain.use(seen);
    await connectionOpeningChain.run(ctx({ profileId: null }));
    const got = seen.mock.calls[0]?.[0] as ConnectionOpeningContext;
    expect(got.profileId).toBeNull();
  });
});
