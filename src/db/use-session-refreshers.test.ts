// @vitest-environment jsdom

/**
 * The four post-connect reads.
 *
 * The plumbing is dull; the failure policy is not. Each of these fails
 * differently on purpose, and that is the part neither shell tested and
 * the part that would drift silently — a refresher that starts clearing
 * a value it used to leave alone changes what the user is told without
 * changing anything that looks like behaviour.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useSessionRefreshers,
  type SessionReadAdapter,
  type SessionRefreshPatch,
} from './use-session-refreshers.js';
import type { CryptState, Schema, TxStatus } from './types.js';

afterEach(cleanup);

const SCHEMA = { tables: [], procedures: [] } as unknown as Schema;
const TX = { mode: 'manual', open: true, pendingStatements: 2 } as unknown as TxStatus;
const CRYPT = 'encrypted' as unknown as CryptState;

function setup(adapterOverrides: Partial<SessionReadAdapter> = {}) {
  const patches: [string, SessionRefreshPatch][] = [];
  const adapter: SessionReadAdapter = {
    cryptState: vi.fn().mockResolvedValue(CRYPT),
    engineVersion: vi.fn().mockResolvedValue('5.0.4'),
    describeSchema: vi.fn().mockResolvedValue(SCHEMA),
    transactionStatus: vi.fn().mockResolvedValue(TX),
    ...adapterOverrides,
  };
  const rendered = renderHook(() =>
    useSessionRefreshers({ adapter, patchTab: (id, p) => patches.push([id, p]) }),
  );
  return { patches, adapter, rendered };
}

/** Everything written to a tab, flattened. */
function merged(patches: [string, SessionRefreshPatch][]): SessionRefreshPatch {
  return patches.reduce((acc, [, p]) => ({ ...acc, ...p }), {});
}

/** The schemaLoading lifecycle every describe follows: a `true` patch
 *  when it starts, a `false` patch when it settles (if it is still the
 *  newest describe for its tab). */
describe('refreshSchema', () => {
  it('marks the describe in flight, then stores the schema it read', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.refreshSchema('t1', 's1');
    });

    expect(h.adapter.describeSchema).toHaveBeenCalledWith('s1');
    expect(h.patches).toEqual([
      ['t1', { schemaLoading: true }],
      ['t1', { schema: SCHEMA, schemaLoading: false }],
    ]);
  });

  it('clears the loading flag when the describe fails', async () => {
    // The object list is how the user navigates. Losing it silently
    // leaves them looking at an empty sidebar with no explanation — and
    // leaving the spinner up forever after that failure is the same
    // non-answer with extra motion.
    const h = setup({ describeSchema: vi.fn().mockRejectedValue(new Error('no permission')) });
    await act(async () => {
      await h.rendered.result.current.refreshSchema('t1', 's1');
    });

    expect(merged(h.patches).error).toContain('no permission');
    expect(merged(h.patches).schemaLoading).toBe(false);
  });

  it('leaves the previous schema in place when a refresh fails', async () => {
    // Replacing a usable object list with nothing on a transient error
    // would be a worse answer than a slightly stale one.
    const h = setup({ describeSchema: vi.fn().mockRejectedValue(new Error('boom')) });
    await act(async () => {
      await h.rendered.result.current.refreshSchema('t1', 's1');
    });

    expect(merged(h.patches).schema).toBeUndefined();
  });

  it('does not let a stale describe overwrite a newer one', async () => {
    // Connect fires a describe; the user hits refresh before it lands.
    // Whichever finishes second wins — a slow first fetch settling late
    // must not replace the schema the newer one already stored, and
    // must not clear its loading flag out from under it.
    let resolveFirst: (s: Schema) => void = () => {};
    let resolveSecond: (s: Schema) => void = () => {};
    const first = new Promise<Schema>((r) => (resolveFirst = r));
    const second = new Promise<Schema>((r) => (resolveSecond = r));
    const describe = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second);
    const h = setup({ describeSchema: describe });

    let runFirst: Promise<void> = Promise.resolve();
    let runSecond: Promise<void> = Promise.resolve();
    act(() => {
      runFirst = h.rendered.result.current.refreshSchema('t1', 's1');
      runSecond = h.rendered.result.current.refreshSchema('t1', 's1');
    });

    const secondSchema = { tables: [], procedures: [] } as unknown as Schema;
    await act(async () => {
      resolveSecond(secondSchema);
      await runSecond;
    });
    const firstSchema = { tables: [], procedures: [] } as unknown as Schema;
    await act(async () => {
      resolveFirst(firstSchema);
      await runFirst;
    });

    // The stale (first) describe writes nothing at all.
    expect(merged(h.patches).schema).toBe(secondSchema);
    expect(merged(h.patches).schemaLoading).toBe(false);
  });

  it('keeps the loading flag up while an older fetch is still running', async () => {
    let resolveFirst: (s: Schema) => void = () => {};
    let resolveSecond: (s: Schema) => void = () => {};
    const first = new Promise<Schema>((r) => (resolveFirst = r));
    const second = new Promise<Schema>((r) => (resolveSecond = r));
    const describe = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second);
    const h = setup({ describeSchema: describe });

    let runFirst: Promise<void> = Promise.resolve();
    let runSecond: Promise<void> = Promise.resolve();
    act(() => {
      runFirst = h.rendered.result.current.refreshSchema('t1', 's1');
      runSecond = h.rendered.result.current.refreshSchema('t1', 's1');
    });

    const secondSchema = { tables: [], procedures: [] } as unknown as Schema;
    await act(async () => {
      resolveSecond(secondSchema);
      await runSecond;
    });
    // Newest describe settled — schema stored, loading done.
    expect(merged(h.patches).schemaLoading).toBe(false);

    const firstSchema = { tables: [], procedures: [] } as unknown as Schema;
    await act(async () => {
      resolveFirst(firstSchema);
      await runFirst;
    });
    // The stale settle changed nothing.
    expect(merged(h.patches).schema).toStrictEqual(secondSchema);
  });
});

describe('refreshCryptState', () => {
  it('stores what it read', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.refreshCryptState('t1', 's1');
    });

    expect(h.patches).toEqual([['t1', { cryptState: CRYPT }]]);
  });

  it('clears the badge on failure rather than leaving a stale one', async () => {
    // The badge asserts something about the database on the other end.
    // Keeping the last known value after a failed read would keep
    // asserting it about a database that may no longer be there.
    const h = setup({ cryptState: vi.fn().mockRejectedValue(new Error('gone')) });
    await act(async () => {
      await h.rendered.result.current.refreshCryptState('t1', 's1');
    });

    expect(h.patches).toEqual([['t1', { cryptState: null }]]);
  });

  it('never sets a tab error — a missing badge is cosmetic', async () => {
    const h = setup({ cryptState: vi.fn().mockRejectedValue(new Error('gone')) });
    await act(async () => {
      await h.rendered.result.current.refreshCryptState('t1', 's1');
    });

    expect(merged(h.patches).error).toBeUndefined();
  });
});

describe('refreshEngineVersion', () => {
  it('stores the version and stamps the tab as recently seen', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.refreshEngineVersion('t1', 's1');
    });

    const m = merged(h.patches);
    expect(m.engineVersion).toBe('5.0.4');
    expect(m.lastPingAt).toBeGreaterThan(0);
  });

  it('trims what the server reported', async () => {
    const h = setup({ engineVersion: vi.fn().mockResolvedValue('  5.0.4\n') });
    await act(async () => {
      await h.rendered.result.current.refreshEngineVersion('t1', 's1');
    });

    expect(merged(h.patches).engineVersion).toBe('5.0.4');
  });

  it('treats a blank version as absent', async () => {
    const h = setup({ engineVersion: vi.fn().mockResolvedValue('   ') });
    await act(async () => {
      await h.rendered.result.current.refreshEngineVersion('t1', 's1');
    });

    expect(merged(h.patches).engineVersion).toBeNull();
  });

  it('does not stamp lastPingAt when the read failed', async () => {
    // This read doubles as a liveness probe. Stamping it after a
    // failure would make a dead session look recently seen, and the
    // health dot reads that field.
    const h = setup({ engineVersion: vi.fn().mockRejectedValue(new Error('timeout')) });
    await act(async () => {
      await h.rendered.result.current.refreshEngineVersion('t1', 's1');
    });

    expect(h.patches).toEqual([['t1', { engineVersion: null }]]);
  });
});

describe('refreshTxStatus', () => {
  it('stores the status it read', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.refreshTxStatus('t1', 's1');
    });

    expect(h.patches).toEqual([['t1', { txStatus: TX }]]);
  });

  it('writes nothing at all when the read fails', async () => {
    // Not even a clear. Telling the user their transaction is gone on
    // the strength of one failed status read is the worse of the two
    // mistakes: an open transaction they believe is closed outlives the
    // misunderstanding.
    const h = setup({ transactionStatus: vi.fn().mockRejectedValue(new Error('busy')) });
    await act(async () => {
      await h.rendered.result.current.refreshTxStatus('t1', 's1');
    });

    expect(h.patches).toEqual([]);
  });
});

describe('the refreshers themselves', () => {
  it('keep a stable identity across renders', async () => {
    // They are dependencies of effects and callbacks in both shells; an
    // identity that changed every render would re-run those.
    const h = setup();
    const before = h.rendered.result.current;
    h.rendered.rerender();
    expect(h.rendered.result.current.refreshSchema).toBe(before.refreshSchema);
    expect(h.rendered.result.current.refreshTxStatus).toBe(before.refreshTxStatus);
  });

  it('address whichever tab they are given', async () => {
    const h = setup();
    await act(async () => {
      await h.rendered.result.current.refreshSchema('other-tab', 's9');
    });

    expect(h.patches[0]?.[0]).toBe('other-tab');
    expect(h.adapter.describeSchema).toHaveBeenCalledWith('s9');
  });
});
