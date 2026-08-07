/**
 * The three-way fork every schema action goes through.
 *
 * Neither shell tested it, and the two copies had drifted. It is also
 * where the product's destructive operations live: a DROP reaches the
 * database through this function, so which path a flag combination
 * selects, and whether the confirm is asked before anything runs, are
 * worth stating rather than inferring.
 */

import { describe, expect, it, vi } from 'vitest';
import { dispatchSchemaDdl, type DdlDispatchOptions, type DdlTabPatch } from './dispatch-ddl.js';
import type { SchemaDdl } from './schema-actions.js';
import type { StatementOutcome } from './types.js';

const OUTCOMES = [
  {
    status: 'ok',
    sql: 'DROP TABLE T',
    durationMs: 4,
    result: { Affected: { rows: 1 } },
  },
] as unknown as StatementOutcome[];

interface Harness {
  patches: DdlTabPatch[];
  records: [string, StatementOutcome[] | null, string | null][];
  options: DdlDispatchOptions;
}

function setup(overrides: Partial<DdlDispatchOptions> = {}): Harness {
  const patches: DdlTabPatch[] = [];
  const records: [string, StatementOutcome[] | null, string | null][] = [];
  return {
    patches,
    records,
    options: {
      sessionId: 's1',
      execute: vi.fn().mockResolvedValue(OUTCOMES),
      patch: (p) => patches.push(p),
      record: (sql, _startedAt, outcomes, error) => records.push([sql, outcomes, error]),
      refreshSchema: vi.fn(),
      confirm: vi.fn().mockReturnValue(true),
      now: () => 1_000,
      ...overrides,
    },
  };
}

/** Everything written to the tab, flattened in order. */
function merged(patches: DdlTabPatch[]): DdlTabPatch {
  return patches.reduce((acc, p) => ({ ...acc, ...p }), {});
}

const PASTE: SchemaDdl = { sql: 'ALTER TABLE T ADD C INTEGER', destructive: false };
const DROP: SchemaDdl = {
  sql: 'DROP TABLE T',
  destructive: true,
  confirmPrompt: 'Really drop T?',
};
const TOGGLE: SchemaDdl = { sql: 'ALTER TRIGGER X INACTIVE', destructive: false, autoExecute: true };

describe('the paste path', () => {
  it('puts the statement in the editor and runs nothing', async () => {
    const h = setup();
    await expect(dispatchSchemaDdl(PASTE, h.options)).resolves.toBe(false);

    expect(h.options.execute).not.toHaveBeenCalled();
    expect(merged(h.patches)).toEqual({ sql: PASTE.sql });
  });

  it('never asks for confirmation — nothing is happening yet', async () => {
    const h = setup();
    await dispatchSchemaDdl(PASTE, h.options);
    expect(h.options.confirm).not.toHaveBeenCalled();
  });

  it('pastes even without a session, so the user can read it', async () => {
    const h = setup({ sessionId: null });
    await dispatchSchemaDdl(PASTE, h.options);
    expect(merged(h.patches)).toEqual({ sql: PASTE.sql });
  });
});

describe('the destructive path', () => {
  it('asks first, using the action’s own wording', async () => {
    const h = setup();
    await dispatchSchemaDdl(DROP, h.options);
    expect(h.options.confirm).toHaveBeenCalledWith('Really drop T?');
  });

  it('falls back to a generic prompt when the action supplies none', async () => {
    const h = setup();
    await dispatchSchemaDdl({ sql: 'DROP TABLE T', destructive: true }, h.options);
    expect(h.options.confirm).toHaveBeenCalledWith(expect.stringContaining('destructive'));
  });

  it('runs nothing when the user declines', async () => {
    // The whole point of the prompt.
    const h = setup({ confirm: vi.fn().mockReturnValue(false) });
    await expect(dispatchSchemaDdl(DROP, h.options)).resolves.toBe(false);

    expect(h.options.execute).not.toHaveBeenCalled();
    expect(h.patches).toEqual([]);
    expect(h.records).toEqual([]);
  });

  it('shows the results and records which SQL produced them', async () => {
    // Writing `results` without `executedSql` leaves the tab strip's
    // dirty-buffer dot lit for a statement that just ran — the two are
    // read together.
    const h = setup();
    await expect(dispatchSchemaDdl(DROP, h.options)).resolves.toBe(true);

    const m = merged(h.patches);
    expect(m.results).toBe(OUTCOMES);
    expect(m.executedSql).toBe('DROP TABLE T');
    expect(m.sql).toBe('DROP TABLE T');
  });

  it('puts the statement in the editor before running it', async () => {
    // So a failure leaves the user with the text that failed rather
    // than with whatever they had typed before.
    const h = setup({ execute: vi.fn().mockRejectedValue(new Error('in use')) });
    await dispatchSchemaDdl(DROP, h.options);

    expect(merged(h.patches).sql).toBe('DROP TABLE T');
    expect(merged(h.patches).error).toContain('in use');
  });

  it('reports a failure without claiming the action happened', async () => {
    const h = setup({ execute: vi.fn().mockRejectedValue(new Error('FK violation')) });
    await expect(dispatchSchemaDdl(DROP, h.options)).resolves.toBe(false);

    expect(h.options.refreshSchema).not.toHaveBeenCalled();
    expect(merged(h.patches).results).toBeUndefined();
  });

  it('records the attempt whether it worked or not', async () => {
    // A DROP that failed is exactly the statement a user goes looking
    // for afterwards.
    const ok = setup();
    await dispatchSchemaDdl(DROP, ok.options);
    expect(ok.records).toEqual([['DROP TABLE T', OUTCOMES, null]]);

    const bad = setup({ execute: vi.fn().mockRejectedValue(new Error('nope')) });
    await dispatchSchemaDdl(DROP, bad.options);
    expect(bad.records[0]?.[1]).toBeNull();
    expect(bad.records[0]?.[2]).toContain('nope');
  });

  it('always clears busy', async () => {
    for (const execute of [
      vi.fn().mockResolvedValue(OUTCOMES),
      vi.fn().mockRejectedValue(new Error('boom')),
    ]) {
      const h = setup({ execute });
      await dispatchSchemaDdl(DROP, h.options);
      expect(merged(h.patches).busy).toBe(false);
    }
  });

  it('refuses to run against no session, after having asked', async () => {
    // The prompt comes first deliberately: a confirm that silently does
    // nothing is worse than one that leads to a message.
    const h = setup({ sessionId: null });
    await expect(dispatchSchemaDdl(DROP, h.options)).resolves.toBe(false);

    expect(h.options.confirm).toHaveBeenCalled();
    expect(h.options.execute).not.toHaveBeenCalled();
    expect(h.patches).toEqual([]);
  });

  it('reloads the schema after a successful drop', async () => {
    const h = setup();
    await dispatchSchemaDdl(DROP, h.options);
    expect(h.options.refreshSchema).toHaveBeenCalledTimes(1);
  });
});

describe('the auto-execute path', () => {
  it('runs without asking', async () => {
    // Cheap reversible toggles. A confirm on every trigger enable would
    // be noise the user learns to click through.
    const h = setup();
    await expect(dispatchSchemaDdl(TOGGLE, h.options)).resolves.toBe(true);

    expect(h.options.confirm).not.toHaveBeenCalled();
    expect(h.options.execute).toHaveBeenCalledWith(TOGGLE.sql);
  });

  it('does not replace what the user was looking at', async () => {
    // They clicked a toggle, not "run this". Swapping the grid out from
    // under them would be a surprise.
    const h = setup();
    await dispatchSchemaDdl(TOGGLE, h.options);

    const m = merged(h.patches);
    expect(m.results).toBeUndefined();
    expect(m.executedSql).toBeUndefined();
    expect(m.sql).toBeUndefined();
  });

  it('still records the statement and reloads the schema', async () => {
    const h = setup();
    await dispatchSchemaDdl(TOGGLE, h.options);

    expect(h.records).toEqual([[TOGGLE.sql, OUTCOMES, null]]);
    expect(h.options.refreshSchema).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a session', async () => {
    const h = setup({ sessionId: null });
    await expect(dispatchSchemaDdl(TOGGLE, h.options)).resolves.toBe(false);

    expect(h.options.execute).not.toHaveBeenCalled();
    expect(h.patches).toEqual([]);
  });

  it('reports a failure without claiming the toggle flipped', async () => {
    const h = setup({ execute: vi.fn().mockRejectedValue(new Error('locked')) });
    await expect(dispatchSchemaDdl(TOGGLE, h.options)).resolves.toBe(false);
    expect(merged(h.patches).error).toContain('locked');
  });
});
