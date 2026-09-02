import { afterEach, describe, expect, it, vi } from 'vitest';

import { installPluginInterceptors } from './plugin-bridge.js';
import type {
  ExtensionPoint,
  PluginInterceptorOutcome,
  PluginInterceptorTransport,
} from './plugin-bridge.js';
import { queryExecutingChain } from './query-executing.js';
import { editorSavingChain } from './editor-saving.js';

/** A transport whose answers the test controls, with call counting so
 *  "was the host consulted at all" is assertable. */
function fakeTransport(
  points: ExtensionPoint[],
  outcome: PluginInterceptorOutcome = { verdict: { action: 'proceed' }, skipped: [] },
): PluginInterceptorTransport & { calls: Array<[ExtensionPoint, string]> } {
  const calls: Array<[ExtensionPoint, string]> = [];
  return {
    calls,
    listInterceptors: () =>
      Promise.resolve(points.map((extensionPoint) => ({ extensionPoint }))),
    runInterceptors: (extensionPoint, contextJson) => {
      calls.push([extensionPoint, contextJson]);
      return Promise.resolve(outcome);
    },
  };
}

const queryCtx = { tabId: 't1', sessionId: 's1', sql: 'SELECT 1' };

let installed: { dispose(): void } | null = null;

afterEach(() => {
  // The chains are module singletons, so a handler left behind leaks
  // into the next test.
  installed?.dispose();
  installed = null;
});

describe('installPluginInterceptors', () => {
  it('lets a plugin cancel an operation', async () => {
    const transport = fakeTransport(['query.executing'], {
      verdict: { action: 'cancel', reason: 'no DROP in production' },
      skipped: [],
    });
    installed = await installPluginInterceptors(transport);

    const decision = await queryExecutingChain.run(queryCtx);

    expect(decision).toEqual({
      action: 'cancel',
      reason: 'no DROP in production',
    });
  });

  it('lets a plugin rewrite the context', async () => {
    const rewritten = { tabId: 't1', buffer: 'SELECT 1 -- formatted' };
    const transport = fakeTransport(['editor.saving'], {
      verdict: { action: 'replace', contextJson: JSON.stringify(rewritten) },
      skipped: [],
    });
    installed = await installPluginInterceptors(transport);

    const decision = await editorSavingChain.run({
      tabId: 't1',
      buffer: 'SELECT 1',
    } as never);

    expect(decision.action).toBe('replace');
    if (decision.action === 'replace') {
      expect(decision.ctx).toEqual(rewritten);
    }
  });

  it('passes the chain context to the host as JSON', async () => {
    // Without this, a bridge that sent `{}` would satisfy every other
    // assertion here while giving plugins nothing to decide on.
    const transport = fakeTransport(['query.executing']);
    installed = await installPluginInterceptors(transport);

    await queryExecutingChain.run(queryCtx);

    expect(transport.calls).toHaveLength(1);
    expect(JSON.parse(transport.calls[0]![1])).toEqual(queryCtx);
  });

  it('does not touch chains no plugin registered for', async () => {
    // query.executing guards every statement the user runs; a chain
    // nobody contributes to must not cost a round trip.
    const transport = fakeTransport(['editor.saving']);
    installed = await installPluginInterceptors(transport);

    const decision = await queryExecutingChain.run(queryCtx);

    expect(decision).toEqual({ action: 'continue' });
    expect(transport.calls).toHaveLength(0);
  });

  it('reports skipped plugins instead of hiding them', async () => {
    // Fail-open is correct and silent fail-open is not: a policy gate
    // that quietly stopped running still looks installed.
    const onSkipped = vi.fn();
    const transport = fakeTransport(['query.executing'], {
      verdict: { action: 'proceed' },
      skipped: [{ pluginId: 'dev.broken', reason: 'trapped: unreachable' }],
    });
    installed = await installPluginInterceptors(transport, { onSkipped });

    await queryExecutingChain.run(queryCtx);

    expect(onSkipped).toHaveBeenCalledWith(
      'dev.broken',
      'trapped: unreachable',
    );
  });

  it('survives a host that names a point this build does not know', async () => {
    const onSkipped = vi.fn();
    const transport = fakeTransport([
      'query.executing',
      'from.the.future' as ExtensionPoint,
    ]);
    installed = await installPluginInterceptors(transport, { onSkipped });

    // The known chain still works.
    await queryExecutingChain.run(queryCtx);
    expect(transport.calls).toHaveLength(1);
    expect(onSkipped).toHaveBeenCalledWith(
      '(host)',
      expect.stringContaining('from.the.future'),
    );
  });

  it('disposing removes every handler it installed', async () => {
    const transport = fakeTransport(['query.executing']);
    const handle = await installPluginInterceptors(transport);
    handle.dispose();

    await queryExecutingChain.run(queryCtx);

    expect(transport.calls).toHaveLength(0);
  });
});
