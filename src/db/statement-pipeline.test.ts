/**
 * The interceptor pipeline and the outcome unwraps.
 *
 * `resolveStatement` is where a plugin can change what SQL the user's
 * database actually receives, or refuse it. Neither shell had a test for
 * it, so the ordering of the two chains — which decides whether a
 * formatter and a policy check compose or one silently discards the
 * other — rested on both copies happening to be written the same way.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { editorSavingChain } from '../interceptors/editor-saving.js';
import { queryExecutingChain } from '../interceptors/query-executing.js';
import type { InterceptorRegistration } from '../interceptors/chain.js';
import { firstAffected, firstRows, resolveStatement } from './statement-pipeline.js';
import type { StatementOutcome } from './types.js';

const registered: InterceptorRegistration[] = [];

function onEditor(handler: Parameters<typeof editorSavingChain.use>[0]): void {
  registered.push(editorSavingChain.use(handler, { priority: 10 }));
}

function onQuery(handler: Parameters<typeof queryExecutingChain.use>[0]): void {
  registered.push(queryExecutingChain.use(handler, { priority: 10 }));
}

afterEach(() => {
  while (registered.length > 0) registered.pop()?.dispose();
});

const INTENT = { tabId: 't1', sessionId: 's1', sql: 'SELECT 1 FROM RDB$DATABASE' };

describe('resolveStatement', () => {
  it('runs the user’s SQL when nothing intercepts', async () => {
    await expect(resolveStatement(INTENT)).resolves.toEqual({
      action: 'run',
      sql: INTENT.sql,
      replaced: false,
    });
  });

  it('carries a rewrite from the editor chain through to the result', async () => {
    onEditor((ctx) => ({ action: 'replace', ctx: { ...ctx, sql: 'SELECT 2' }, reason: 'formatted' }));

    await expect(resolveStatement(INTENT)).resolves.toEqual({
      action: 'run',
      sql: 'SELECT 2',
      replaced: true,
    });
  });

  it('carries a rewrite from the query chain', async () => {
    onQuery((ctx) => ({ action: 'replace', ctx: { ...ctx, sql: 'SELECT 3' }, reason: 'policy' }));

    await expect(resolveStatement(INTENT)).resolves.toMatchObject({
      action: 'run',
      sql: 'SELECT 3',
    });
  });

  it('shows the query chain what the editor chain produced, not the original', async () => {
    // The load-bearing ordering claim. Running both against the original
    // would silently discard one of the two rewrites — a formatter and a
    // policy check would fight instead of compose, and which one won
    // would depend on registration order rather than on intent.
    const seen: string[] = [];
    onEditor((ctx) => ({ action: 'replace', ctx: { ...ctx, sql: 'FORMATTED' }, reason: 'fmt' }));
    onQuery((ctx) => {
      seen.push(ctx.sql);
      return { action: 'continue' };
    });

    await resolveStatement(INTENT);

    expect(seen).toEqual(['FORMATTED']);
  });

  it('lets the query chain rewrite what the editor chain already rewrote', async () => {
    onEditor((ctx) => ({ action: 'replace', ctx: { ...ctx, sql: 'STEP1' }, reason: 'a' }));
    onQuery((ctx) => ({ action: 'replace', ctx: { ...ctx, sql: `${ctx.sql}+STEP2` }, reason: 'b' }));

    await expect(resolveStatement(INTENT)).resolves.toMatchObject({ sql: 'STEP1+STEP2' });
  });

  it('cancels on the editor chain and never reaches the query chain', async () => {
    let queryRan = false;
    onEditor(() => ({ action: 'cancel', reason: 'buffer has unsaved conflicts' }));
    onQuery(() => {
      queryRan = true;
      return { action: 'continue' };
    });

    await expect(resolveStatement(INTENT)).resolves.toEqual({
      action: 'cancel',
      reason: 'buffer has unsaved conflicts',
    });
    expect(queryRan).toBe(false);
  });

  it('cancels on the query chain', async () => {
    onQuery(() => ({ action: 'cancel', reason: 'production is read-only' }));

    await expect(resolveStatement(INTENT)).resolves.toEqual({
      action: 'cancel',
      reason: 'production is read-only',
    });
  });

  it('reports replaced=false when a rewrite lands back on the original', async () => {
    // `replaced` answers "is this the SQL the user wrote", not "did a
    // handler touch it". A round trip through a formatter that changed
    // nothing should not tell the user their statement was altered.
    onEditor((ctx) => ({ action: 'replace', ctx: { ...ctx, sql: INTENT.sql }, reason: 'noop' }));

    await expect(resolveStatement(INTENT)).resolves.toMatchObject({ replaced: false });
  });

  it('shows both chains the tab and session the statement belongs to', async () => {
    const contexts: { tabId: string; sessionId: string }[] = [];
    onEditor((ctx) => {
      contexts.push({ tabId: ctx.tabId, sessionId: ctx.sessionId });
      return { action: 'continue' };
    });
    onQuery((ctx) => {
      contexts.push({ tabId: ctx.tabId, sessionId: ctx.sessionId });
      return { action: 'continue' };
    });

    await resolveStatement(INTENT);

    expect(contexts).toEqual([
      { tabId: 't1', sessionId: 's1' },
      { tabId: 't1', sessionId: 's1' },
    ]);
  });
});

function rows(count: number): StatementOutcome {
  return {
    status: 'ok',
    result: {
      Rows: { columns: [{ name: 'A' }], rows: Array.from({ length: count }, () => ({ cells: [] })) },
    },
  } as unknown as StatementOutcome;
}

function affected(n: number): StatementOutcome {
  return { status: 'ok', result: { Affected: { rows: n } } } as unknown as StatementOutcome;
}

function failed(error: string): StatementOutcome {
  return { status: 'err', error } as unknown as StatementOutcome;
}

describe('firstRows', () => {
  it('returns the columns and rows of the first statement', () => {
    expect(firstRows([rows(3)], 'CUSTOMERS')).toMatchObject({
      columns: [{ name: 'A' }],
      rows: expect.any(Array),
    });
    expect(firstRows([rows(3)], 'CUSTOMERS').rows).toHaveLength(3);
  });

  it('accepts an empty result set — no rows is an answer', () => {
    // A SELECT that matched nothing succeeded. Treating it as a failure
    // would turn every empty table into an error banner.
    expect(firstRows([rows(0)], 'CUSTOMERS').rows).toEqual([]);
  });

  it('names what was running when the batch is empty', () => {
    expect(() => firstRows([], 'COUNT(*)')).toThrow(/COUNT\(\*\): produced no outcome/);
  });

  it('carries the server’s message and the subject when the statement failed', () => {
    expect(() => firstRows([failed('Table unknown NOPE')], 'CUSTOMERS')).toThrow(
      /CUSTOMERS: Table unknown NOPE/,
    );
  });

  it('refuses an affected-rows result where rows were expected', () => {
    // Reaching into `.Rows` on this shape is how a background fetch
    // turns into an undefined-property crash rather than a message.
    expect(() => firstRows([affected(4)], 'Scoped fetch')).toThrow(
      /Scoped fetch: did not return rows/,
    );
  });

  it('ignores later statements in the batch', () => {
    expect(firstRows([rows(1), failed('boom')], 'CUSTOMERS').rows).toHaveLength(1);
  });
});

describe('firstAffected', () => {
  it('returns the affected-row count', () => {
    expect(firstAffected([affected(4)], 'UPDATE')).toBe(4);
  });

  it('treats zero matched rows as a failure', () => {
    // Every caller is a write against a row the user was looking at.
    // Zero means the row moved or vanished under them, and reporting
    // success would leave them believing an edit landed that did not.
    expect(() => firstAffected([affected(0)], 'UPDATE')).toThrow(/UPDATE: matched zero rows/);
  });

  it('surfaces the server’s error verbatim', () => {
    // Firebird's constraint messages name the constraint. Prefixing
    // them buries the part the user needs at the end of the line.
    expect(() => firstAffected([failed('violation of FOREIGN KEY')], 'DELETE')).toThrow(
      /^violation of FOREIGN KEY$/,
    );
  });

  it('names what was running when the batch is empty', () => {
    expect(() => firstAffected([], 'UPDATE')).toThrow(/UPDATE: produced no outcome/);
  });

  it('refuses a result set where an affected count was expected', () => {
    expect(() => firstAffected([rows(2)], 'UPDATE')).toThrow(/UPDATE: did not report affected rows/);
  });
});
