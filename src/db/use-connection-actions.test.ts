// @vitest-environment jsdom

/**
 * The connection lifecycle, which had no tests in either shell.
 *
 * These are the first. They exist because 1,124 lines of shell
 * orchestration were about to move into this library, and moving
 * untested code is a rewrite with no safety net — so the behaviour is
 * pinned here against the shells' current semantics before anything
 * else changes.
 *
 * What is worth pinning is the *sequence*, not the calls: which fields
 * land on the tab and in what order, which failures set `error` versus
 * `health: 'dead'`, and whether an attempt happens at all. Those are the
 * parts that drifted between the two copies.
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionOpeningChain } from '../interceptors/connection-opening.js';
import type { InterceptorRegistration } from '../interceptors/chain.js';
import {
  useConnectionActions,
  type ConnectionAdapter,
  type ConnectionPatch,
  type ConnectionTab,
  type UseConnectionActionsOptions,
} from './use-connection-actions.js';
import type { ConnectionForm } from './types.js';

/** The chain is a module singleton, so a handler left registered would
 *  leak into every later test in this file. */
const registered: InterceptorRegistration[] = [];

function intercept(handler: Parameters<typeof connectionOpeningChain.use>[0]): void {
  registered.push(connectionOpeningChain.use(handler, { priority: 10 }));
}

afterEach(() => {
  cleanup();
  while (registered.length > 0) registered.pop()?.dispose();
});

const FORM: ConnectionForm = {
  host: 'localhost',
  port: 3050,
  database: '/data/test.fdb',
  user: 'SYSDBA',
  password: 'pw',
  pureRust: false,
  encryptionKey: '',
  encryptionRequired: false,
  fbclientPath: '',
  charset: 'UTF8',
  embedded: false,
} as ConnectionForm;

function tab(overrides: Partial<ConnectionTab> = {}): ConnectionTab {
  return {
    id: 't1',
    sessionId: null,
    form: FORM,
    selectedProfileId: null,
    profileName: '',
    busy: false,
    health: 'unknown',
    ...overrides,
  };
}

interface Harness {
  patches: [string, ConnectionPatch][];
  renames: [string, string][];
  connected: [string, string][];
  adapter: ConnectionAdapter;
}

/** Renders the hook and records everything it writes back. */
function setup(
  overrides: Partial<UseConnectionActionsOptions> = {},
  adapterOverrides: Partial<ConnectionAdapter> = {},
) {
  const h: Harness = {
    patches: [],
    renames: [],
    connected: [],
    adapter: {
      connect: vi.fn().mockResolvedValue({ sessionId: 'sess-1' }),
      testConnection: vi
        .fn()
        .mockResolvedValue({ ok: true, firebirdVersion: '5.0.4', error: null, durationMs: 12 }),
      pingSession: vi.fn().mockResolvedValue('5.0.4'),
      ...adapterOverrides,
    },
  };
  const rendered = renderHook(() =>
    useConnectionActions({
      adapter: h.adapter,
      activeTab: tab(),
      tabs: [],
      patchTab: (id, patch) => h.patches.push([id, patch]),
      renameTab: (id, title) => h.renames.push([id, title]),
      deriveTitle: (form) => `${form.host}/derived`,
      onConnected: (id, session) => h.connected.push([id, session]),
      autoReconnect: false,
      // Far beyond any test's lifetime; the probe loop is exercised
      // deliberately in its own case rather than by accident here.
      probeIntervalMs: 10_000_000,
      ...overrides,
    }),
  );
  return { ...h, rendered };
}

/** Merges the recorded patches for one tab, in order. */
function merged(patches: [string, ConnectionPatch][], tabId = 't1'): ConnectionPatch {
  return patches.filter(([id]) => id === tabId).reduce((acc, [, p]) => ({ ...acc, ...p }), {});
}

describe('handleConnect', () => {
  it('opens a session and reports it healthy', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(h.adapter.connect).toHaveBeenCalledWith({ form: FORM, profileId: null });
    expect(merged(h.patches)).toMatchObject({
      sessionId: 'sess-1',
      health: 'healthy',
      error: null,
      busy: false,
    });
    expect(h.connected).toEqual([['t1', 'sess-1']]);
  });

  it('clears the previous crypt badge before the attempt, not after', async () => {
    // Leaving the old badge up while a new connection is in flight
    // shows an encryption state belonging to a database the user may no
    // longer be talking to.
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    const beforeSession = h.patches.findIndex(([, p]) => p.cryptState === null);
    const withSession = h.patches.findIndex(([, p]) => p.sessionId === 'sess-1');
    expect(beforeSession).toBeGreaterThanOrEqual(0);
    expect(beforeSession).toBeLessThan(withSession);
  });

  it('drops the previous results when the session changes', async () => {
    // The grid belongs to the old session. Leaving it up after
    // reconnecting to a different database shows rows that cannot be
    // refetched and may not exist.
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(merged(h.patches).results).toBeNull();
  });

  it('titles the tab from the profile name when there is one', async () => {
    const h = setup({ activeTab: tab({ profileName: '  Production  ' }) });
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(h.renames).toEqual([['t1', 'Production']]);
  });

  it('falls back to the derived title for a whitespace-only name', async () => {
    const h = setup({ activeTab: tab({ profileName: '   ' }) });
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(h.renames).toEqual([['t1', 'localhost/derived']]);
  });

  it('passes the profile id through so the host can take the profile route', async () => {
    // The two editions route this to different endpoints, and the
    // profile route deliberately never sends a password the host
    // already holds.
    const h = setup({ activeTab: tab({ selectedProfileId: 'p1' }) });
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(h.adapter.connect).toHaveBeenCalledWith({ form: FORM, profileId: 'p1' });
  });

  it('reports a refused connection without marking the tab dead', async () => {
    // `dead` means a session that was working stopped. A connection
    // that never opened is an error to show, and the health dot should
    // not claim a session exists to have died.
    const h = setup({}, { connect: vi.fn().mockRejectedValue(new Error('bad password')) });
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    const m = merged(h.patches);
    expect(m.error).toContain('bad password');
    expect(m.health).toBeUndefined();
    expect(h.connected).toEqual([]);
  });

  it('always clears busy, even when the connect throws', async () => {
    // A stuck spinner with no way out is worse than the failure itself.
    const h = setup({}, { connect: vi.fn().mockRejectedValue(new Error('nope')) });
    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(merged(h.patches).busy).toBe(false);
  });

  it('lets an interceptor cancel the connection before anything opens', async () => {
    const h = setup();
    intercept(() => ({ action: 'cancel', reason: 'production is read-only today' }));

    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(h.adapter.connect).not.toHaveBeenCalled();
    expect(merged(h.patches).error).toBe('production is read-only today');
    // Not merely unopened — the tab must not be left spinning either.
    expect(h.patches.some(([, p]) => p.busy === true)).toBe(false);
  });

  it('shows the interceptor the connection it is being asked about', async () => {
    const h = setup({ activeTab: tab({ selectedProfileId: 'p1' }) });
    const seen: unknown[] = [];
    intercept((ctx) => {
      seen.push(ctx);
      return { action: 'continue' };
    });

    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(seen[0]).toMatchObject({
      tabId: 't1',
      profileId: 'p1',
      host: 'localhost',
      database: '/data/test.fdb',
      user: 'SYSDBA',
    });
  });

  it('never shows the interceptor the password', async () => {
    // The chain is plugin-reachable. A credential in the context would
    // be handed to every registered handler.
    const h = setup();
    const seen: Record<string, unknown>[] = [];
    intercept((ctx) => {
      seen.push(ctx as unknown as Record<string, unknown>);
      return { action: 'continue' };
    });

    await act(async () => {
      await h.rendered.result.current.handleConnect();
    });

    expect(JSON.stringify(seen[0])).not.toContain('pw');
  });
});

describe('handleReconnect', () => {
  it('marks the tab reconnecting, then healthy', async () => {
    const h = setup({ activeTab: tab({ health: 'dead' }) });
    await act(async () => {
      await h.rendered.result.current.handleReconnect();
    });

    expect(h.patches[0]?.[1]).toMatchObject({ health: 'reconnecting', error: null });
    expect(merged(h.patches)).toMatchObject({ sessionId: 'sess-1', health: 'healthy' });
  });

  it('refuses to start a second attempt while one is in flight', async () => {
    // Two attempts would race two sessions into one tab and leak
    // whichever lost.
    const h = setup({ activeTab: tab({ health: 'reconnecting' }) });
    await act(async () => {
      await h.rendered.result.current.handleReconnect();
    });

    expect(h.adapter.connect).not.toHaveBeenCalled();
    expect(h.patches).toEqual([]);
  });

  it('does not run the interceptor chain', async () => {
    // The user approved this connection when they opened it.
    // Re-prompting on every network blip trains them to click through.
    const h = setup({ activeTab: tab({ health: 'dead' }) });
    let ran = false;
    intercept(() => {
      ran = true;
      return { action: 'continue' };
    });

    await act(async () => {
      await h.rendered.result.current.handleReconnect();
    });

    expect(ran).toBe(false);
    expect(h.adapter.connect).toHaveBeenCalledTimes(1);
  });

  it('marks the tab dead when the reattach fails', async () => {
    const h = setup(
      { activeTab: tab({ health: 'dead' }) },
      { connect: vi.fn().mockRejectedValue(new Error('server gone')) },
    );
    await act(async () => {
      await h.rendered.result.current.handleReconnect();
    });

    const m = merged(h.patches);
    expect(m.health).toBe('dead');
    expect(m.error).toContain('server gone');
  });

  it('records the engine version reported by the new session', async () => {
    const h = setup({ activeTab: tab({ health: 'dead' }) });
    await act(async () => {
      await h.rendered.result.current.handleReconnect();
    });

    await waitFor(() => expect(merged(h.patches).engineVersion).toBe('5.0.4'));
  });

  it('clears the engine version when the version probe fails', async () => {
    // A stale version beside a fresh session is a worse answer than no
    // version: it describes a server that is no longer on the other end.
    const h = setup(
      { activeTab: tab({ health: 'dead' }) },
      { pingSession: vi.fn().mockRejectedValue(new Error('timeout')) },
    );
    await act(async () => {
      await h.rendered.result.current.handleReconnect();
    });

    await waitFor(() => expect(merged(h.patches).engineVersion).toBeNull());
    // The session itself still opened; a failed version probe is not a
    // failed reconnect.
    expect(merged(h.patches).health).toBe('healthy');
  });

  it('treats a blank engine version as absent', async () => {
    const h = setup(
      { activeTab: tab({ health: 'dead' }) },
      { pingSession: vi.fn().mockResolvedValue('   ') },
    );
    await act(async () => {
      await h.rendered.result.current.handleReconnect();
    });

    await waitFor(() => expect(merged(h.patches).engineVersion).toBeNull());
  });
});

describe('handleTestConnection', () => {
  it('records the probe result and always clears the spinner', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleTestConnection();
    });

    expect(h.patches[0]?.[1]).toMatchObject({ testing: true, testResult: null });
    expect(merged(h.patches)).toMatchObject({
      testing: false,
      testResult: { ok: true, firebirdVersion: '5.0.4' },
    });
  });

  it('renders a rejected probe as a failed test, not a broken button', async () => {
    const h = setup({}, { testConnection: vi.fn().mockRejectedValue(new Error('no route')) });
    await act(async () => {
      await h.rendered.result.current.handleTestConnection();
    });

    const m = merged(h.patches);
    expect(m.testResult).toMatchObject({ ok: false, firebirdVersion: null, durationMs: 0 });
    expect(m.testResult?.error).toContain('no route');
    expect(m.testing).toBe(false);
  });

  it('never opens a session', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleTestConnection();
    });

    expect(h.adapter.connect).not.toHaveBeenCalled();
    expect(merged(h.patches).sessionId).toBeUndefined();
  });
});

describe('auto-reconnect', () => {
  it('makes exactly one attempt when a tab dies', async () => {
    // The gate is the whole point: a host that stays down would
    // otherwise turn every failed attach into the trigger for the next.
    const h = setup({ activeTab: tab({ health: 'dead' }), autoReconnect: true });

    await waitFor(() => expect(h.adapter.connect).toHaveBeenCalledTimes(1));
    h.rendered.rerender();
    h.rendered.rerender();
    expect(h.adapter.connect).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the preference is off', async () => {
    const h = setup({ activeTab: tab({ health: 'dead' }), autoReconnect: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.adapter.connect).not.toHaveBeenCalled();
  });

  it('does not fire for a healthy tab', async () => {
    const h = setup({ activeTab: tab({ health: 'healthy' }), autoReconnect: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.adapter.connect).not.toHaveBeenCalled();
  });

  it('waits rather than racing a connect the user already started', async () => {
    const h = setup({ activeTab: tab({ health: 'dead', busy: true }), autoReconnect: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.adapter.connect).not.toHaveBeenCalled();
  });

  it('re-arms once the tab recovers, so a later death is retried', async () => {
    const h = setup({ activeTab: tab({ health: 'dead' }), autoReconnect: true });
    await waitFor(() => expect(h.adapter.connect).toHaveBeenCalledTimes(1));

    h.rendered.rerender();
    await act(async () => {
      h.rendered.unmount();
    });

    const again = setup({ activeTab: tab({ health: 'healthy' }), autoReconnect: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(again.adapter.connect).not.toHaveBeenCalled();
  });
});

describe('the health probe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings connected tabs and leaves disconnected ones alone', async () => {
    const h = setup({
      tabs: [
        tab({ id: 'connected', sessionId: 'sess-9', health: 'healthy' }),
        tab({ id: 'fresh', sessionId: null }),
      ],
      probeIntervalMs: 1000,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(h.adapter.pingSession).toHaveBeenCalledWith('sess-9');
    expect(h.adapter.pingSession).toHaveBeenCalledTimes(1);
    expect(merged(h.patches, 'connected')).toMatchObject({ health: 'healthy' });
  });

  it('marks a tab dead when its ping fails', async () => {
    const h = setup(
      {
        tabs: [tab({ id: 'connected', sessionId: 'sess-9', health: 'healthy' })],
        probeIntervalMs: 1000,
      },
      { pingSession: vi.fn().mockRejectedValue(new Error('gone')) },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(merged(h.patches, 'connected')).toMatchObject({
      health: 'dead',
      lastPingAt: null,
      engineVersion: null,
    });
  });
});

describe('handleQuickConnect', () => {
  const PROFILE = {
    id: 'p1',
    name: 'Production',
    host: 'db.example.com',
    port: 3051,
    database: '/data/prod.fdb',
    user: 'APP',
    pureRust: true,
    encryptionRequired: true,
    fbclientPath: null,
    charset: 'WIN1250',
    embedded: false,
    color: null,
  } as unknown as Parameters<
    ReturnType<typeof useConnectionActions>['handleQuickConnect']
  >[0];

  it('runs the connection.opening chain, like the connect button does', async () => {
    // The gap this closes. Quick-connect reaches the same databases with
    // the same credentials, so a production gate that stops one has to
    // stop the other — otherwise the policy is enforced by which button
    // the user happened to click.
    const h = setup();
    const seen: unknown[] = [];
    intercept((ctx) => {
      seen.push(ctx);
      return { action: 'continue' };
    });

    await act(async () => {
      await h.rendered.result.current.handleQuickConnect(PROFILE);
    });

    expect(seen[0]).toMatchObject({
      profileId: 'p1',
      host: 'db.example.com',
      database: '/data/prod.fdb',
      user: 'APP',
    });
  });

  it('opens nothing when a handler refuses', async () => {
    const h = setup();
    intercept(() => ({ action: 'cancel', reason: 'production is gated' }));

    await act(async () => {
      await h.rendered.result.current.handleQuickConnect(PROFILE);
    });

    expect(h.adapter.connect).not.toHaveBeenCalled();
    expect(merged(h.patches).error).toBe('production is gated');
    expect(h.patches.some(([, p]) => p.busy === true)).toBe(false);
  });

  it('selects the profile and takes its connection details', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleQuickConnect(PROFILE);
    });

    const m = merged(h.patches);
    expect(m.selectedProfileId).toBe('p1');
    expect(m.profileName).toBe('Production');
    expect(m.form).toMatchObject({
      host: 'db.example.com',
      port: 3051,
      database: '/data/prod.fdb',
      user: 'APP',
      pureRust: true,
      encryptionRequired: true,
      charset: 'WIN1250',
    });
  });

  it('keeps a password the user already typed', async () => {
    // Discarding it would make the fast path slower than the slow one.
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleQuickConnect(PROFILE);
    });

    expect(merged(h.patches).form?.password).toBe('pw');
  });

  it('titles the tab after the profile', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.handleQuickConnect(PROFILE);
    });

    expect(h.renames).toEqual([['t1', 'Production']]);
  });

  it('reports a refusal without marking the tab dead', async () => {
    const h = setup({}, { connect: vi.fn().mockRejectedValue(new Error('bad password')) });
    await act(async () => {
      await h.rendered.result.current.handleQuickConnect(PROFILE);
    });

    const m = merged(h.patches);
    expect(m.error).toContain('bad password');
    expect(m.health).toBeUndefined();
    expect(m.busy).toBe(false);
  });
});
