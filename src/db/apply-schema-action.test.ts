/**
 * Schema actions, from menu click to event.
 *
 * Two claims here are worth stating rather than inferring, because both
 * are the kind that look like holes on a fast read:
 *
 * - the interceptor chain is skipped when there is no session
 * - the `schema.action-applied` event fires only on a real execution
 *
 * The first is safe because nothing reaches a database along that path.
 * The second is what makes the event mean "the schema changed" rather
 * than "someone opened a menu".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '../events/event-bus.js';
import { SCHEMA_ACTION_APPLIED } from '../events/schema-events.js';
import { schemaActionApplyingChain } from '../interceptors/schema-action-applying.js';
import type { InterceptorRegistration } from '../interceptors/chain.js';
import { applySchemaAction, type ApplySchemaActionOptions } from './apply-schema-action.js';
import type { SchemaAction } from './types.js';

const registered: InterceptorRegistration[] = [];
const disposers: { dispose: () => void }[] = [];

function intercept(handler: Parameters<typeof schemaActionApplyingChain.use>[0]): void {
  registered.push(schemaActionApplyingChain.use(handler, { priority: 10 }));
}

/** Collects every `schema/action-applied` payload emitted while a test
 *  runs. */
function collectApplied(): unknown[] {
  const seen: unknown[] = [];
  disposers.push(
    eventBus.subscribe('test.apply-schema-action', SCHEMA_ACTION_APPLIED, (_topic, payload) => {
      seen.push(payload);
    }),
  );
  return seen;
}

afterEach(() => {
  while (registered.length > 0) registered.pop()?.dispose();
  while (disposers.length > 0) disposers.pop()?.dispose();
});

const DROP_TABLE = {
  kind: 'table',
  action: 'drop',
  target: { name: 'CUSTOMERS' },
} as unknown as SchemaAction;

function setup(overrides: Partial<ApplySchemaActionOptions> = {}) {
  const patches: { error: string }[] = [];
  return {
    patches,
    options: {
      tabId: 't1',
      sessionId: 's1',
      dispatch: vi.fn().mockResolvedValue(true),
      patch: (p: { error: string }) => patches.push(p),
      now: () => 1_700_000_000_000,
      ...overrides,
    } as ApplySchemaActionOptions,
  };
}

describe('the happy path', () => {
  it('dispatches generated DDL and reports that it ran', async () => {
    const h = setup();
    await expect(applySchemaAction(DROP_TABLE, h.options)).resolves.toBe(true);

    expect(h.options.dispatch).toHaveBeenCalledTimes(1);
    const ddl = (h.options.dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ddl.sql).toContain('CUSTOMERS');
    expect(ddl.destructive).toBe(true);
  });

  it('announces what was applied, with the SQL that did it', async () => {
    // Plugins subscribe to this to invalidate their own caches. A
    // payload without the target name would tell them something changed
    // and not what.
    const applied = collectApplied();
    const h = setup();
    await applySchemaAction(DROP_TABLE, h.options);

    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      tabId: 't1',
      sessionId: 's1',
      kind: 'table',
      action: 'drop',
      targetName: 'CUSTOMERS',
      appliedAt: 1_700_000_000_000,
    });
    expect((applied[0] as { ddl: string }).ddl).toContain('CUSTOMERS');
  });
});

describe('the interceptor chain', () => {
  it('sees the action before anything is dispatched', async () => {
    const seen: unknown[] = [];
    intercept((ctx) => {
      seen.push(ctx);
      return { action: 'continue' };
    });
    const h = setup();

    await applySchemaAction(DROP_TABLE, h.options);

    expect(seen[0]).toMatchObject({
      tabId: 't1',
      sessionId: 's1',
      kind: 'table',
      action: 'drop',
      targetName: 'CUSTOMERS',
    });
  });

  it('stops the action when a handler refuses, and says why', async () => {
    const applied = collectApplied();
    intercept(() => ({ action: 'cancel', reason: 'CUSTOMERS is protected' }));
    const h = setup();

    await expect(applySchemaAction(DROP_TABLE, h.options)).resolves.toBe(false);

    expect(h.options.dispatch).not.toHaveBeenCalled();
    expect(h.patches).toEqual([{ error: 'CUSTOMERS is protected' }]);
    expect(applied).toEqual([]);
  });

  it('is skipped without a session, because nothing can reach a database', async () => {
    // Reads like a hole and is not one: with no session the dispatch
    // either pastes the statement into the editor, which applies
    // nothing, or prompts and then stops for want of a session.
    let ran = false;
    intercept(() => {
      ran = true;
      return { action: 'continue' };
    });
    const h = setup({ sessionId: null, dispatch: vi.fn().mockResolvedValue(false) });

    await applySchemaAction(DROP_TABLE, h.options);

    expect(ran).toBe(false);
    expect(h.options.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe('the applied event', () => {
  it('does not fire when the dispatch pasted rather than ran', async () => {
    // `dispatch` returns false for the paste path. A plugin listening
    // for this is told about schema changes, not about text appearing
    // in an editor.
    const applied = collectApplied();
    const h = setup({ dispatch: vi.fn().mockResolvedValue(false) });

    await expect(applySchemaAction(DROP_TABLE, h.options)).resolves.toBe(false);
    expect(applied).toEqual([]);
  });

  it('does not fire when the statement failed', async () => {
    const applied = collectApplied();
    const h = setup({ dispatch: vi.fn().mockResolvedValue(false) });

    await applySchemaAction(DROP_TABLE, h.options);
    expect(applied).toEqual([]);
  });

  it('carries a null session when the action ran without one', async () => {
    // Not reachable through the current dispatch, but the payload type
    // allows it, and a subscriber reading `sessionId` should get the
    // truth rather than a placeholder.
    const applied = collectApplied();
    const h = setup({ sessionId: null, dispatch: vi.fn().mockResolvedValue(true) });

    await applySchemaAction(DROP_TABLE, h.options);
    expect(applied[0]).toMatchObject({ sessionId: null });
  });
});
