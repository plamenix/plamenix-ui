import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerBuiltinDbaToolbox,
  unregisterBuiltinDbaToolbox,
} from './dba-toolbox.js';
import {
  pluginContributionsToSchemaActions,
  type SchemaActionContext,
  type SchemaActionContributionPayload,
} from '../schema-action-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';

function tableCtx(name = 'CUSTOMERS'): SchemaActionContext {
  return {
    kind: 'table',
    target: {
      name,
      kind: 'table',
      columns: [
        { name: 'ID', sqlType: 'INTEGER', nullable: false },
        { name: 'EMAIL', sqlType: 'VARCHAR(255)', nullable: true },
      ],
      primaryKey: ['ID'],
    },
  };
}

function viewCtx(name = 'V_ACTIVE'): SchemaActionContext {
  return { kind: 'view', target: { name, kind: 'view', columns: [], primaryKey: [] } };
}

function actions(ctx: SchemaActionContext) {
  return pluginContributionsToSchemaActions(
    registry.getContributions<SchemaActionContributionPayload>('schema_actions'),
    ctx,
  );
}

describe('builtin DBA toolbox (I4.8)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinDbaToolbox();
    registry.__reset();
  });

  it('registers both actions under the built-in namespace', () => {
    registerBuiltinDbaToolbox();
    const contributions = registry.getContributions('schema_actions');
    expect(contributions).toHaveLength(2);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/dba-toolbox');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions.map((c) => c.contribution.id).sort()).toEqual([
      'recompute-statistics',
      'recreate-table',
    ]);
  });

  it('RECREATE TABLE: applicable to tables, destructive, confirm prompt interpolates target name', () => {
    registerBuiltinDbaToolbox();
    const ctx = tableCtx('ORDERS');
    const all = actions(ctx);
    const recreate = all.find((a) => a.id.endsWith(':recreate-table'));
    expect(recreate).toBeDefined();
    expect(recreate?.destructive).toBe(true);
    expect(recreate?.confirmPrompt).toBe(
      'RECREATE TABLE ORDERS will drop ALL rows. Continue?',
    );
    const sql = recreate!.buildSql();
    // `quoteIdent` leaves all-uppercase-ASCII identifiers bare
    // (Firebird's case-folding convention) — matches the legacy
    // `schema-actions.ts` behaviour. Mixed-case identifiers would
    // surface as `"quoted"`, but ORDERS / ID / EMAIL stay bare.
    expect(sql).toContain('RECREATE TABLE ORDERS');
    expect(sql).toContain('ID INTEGER NOT NULL,');
    expect(sql).toContain('EMAIL VARCHAR(255)');
  });

  it('SET STATISTICS: applicable to tables, non-destructive, emits EXECUTE BLOCK loop with safely-escaped name', () => {
    registerBuiltinDbaToolbox();
    const ctx = tableCtx("WEIRD'S_NAME");
    const recompute = actions(ctx).find((a) => a.id.endsWith(':recompute-statistics'));
    expect(recompute).toBeDefined();
    expect(recompute?.destructive).toBe(false);
    expect(recompute?.confirmPrompt).toBeNull();
    const sql = recompute!.buildSql();
    expect(sql).toContain('EXECUTE BLOCK');
    expect(sql).toContain('FROM RDB$INDICES');
    // Single quote in name doubled per SQL literal escaping rules.
    expect(sql).toContain("'WEIRD''S_NAME'");
    expect(sql).toContain("EXECUTE STATEMENT 'SET STATISTICS INDEX");
  });

  it('does NOT surface either action on non-table targets', () => {
    registerBuiltinDbaToolbox();
    const viewActions = actions(viewCtx());
    expect(viewActions).toEqual([]);
  });

  it('third-party action interleaves alongside the built-in (priority sort + kind filter)', () => {
    registerBuiltinDbaToolbox();
    registerContributions('com.example.dba-pack', {
      schema_actions: [
        {
          id: 'rebuild-indexes',
          priority: 50, // appears before the builtins (priority 100)
          payload: {
            label: 'Rebuild all indexes',
            applicableKinds: ['table'],
            destructive: false,
            buildSql: (ctx) => `-- rebuild ${ctx.target.name} indexes`,
          },
        },
      ],
    });
    const all = actions(tableCtx());
    // Priority 50 first, then both builtins at 100 — tie-breaker
    // sorts within the built-in's two entries by contribution id
    // alphabetically, so `recompute-statistics` precedes
    // `recreate-table`.
    expect(all.map((a) => a.id)).toEqual([
      'com.example.dba-pack:rebuild-indexes',
      '@plamenix-builtin/dba-toolbox:recompute-statistics',
      '@plamenix-builtin/dba-toolbox:recreate-table',
    ]);
  });

  it('third-party action declaring a non-table kind does not surface on tables', () => {
    registerBuiltinDbaToolbox();
    registerContributions('com.example.proc-tools', {
      schema_actions: [
        {
          id: 'recompile-procedure',
          payload: {
            label: 'Recompile procedure',
            applicableKinds: ['procedure'],
            buildSql: () => '-- recompile',
          },
        },
      ],
    });
    const tableSide = actions(tableCtx());
    expect(tableSide.map((a) => a.id)).not.toContain(
      'com.example.proc-tools:recompile-procedure',
    );
  });

  it('teardown unregisters cleanly + re-register works (re-init safe)', () => {
    const teardown = registerBuiltinDbaToolbox();
    teardown();
    expect(registry.getContributions('schema_actions')).toHaveLength(0);
    expect(() => registerBuiltinDbaToolbox()).not.toThrow();
    expect(registry.getContributions('schema_actions')).toHaveLength(2);
  });

  it('confirm prompt accepts both static-string and function forms', () => {
    registerContributions('com.example.confirm-static', {
      schema_actions: [
        {
          id: 'static-confirm',
          payload: {
            label: 'Static',
            applicableKinds: ['table'],
            confirmPrompt: 'Are you sure?',
            buildSql: () => '-- noop',
          },
        },
      ],
    });
    registerContributions('com.example.confirm-fn', {
      schema_actions: [
        {
          id: 'fn-confirm',
          payload: {
            label: 'Fn',
            applicableKinds: ['table'],
            confirmPrompt: (ctx) => `Touching ${ctx.target.name}?`,
            buildSql: () => '-- noop',
          },
        },
      ],
    });
    const all = actions(tableCtx('FOO'));
    const staticOne = all.find((a) => a.id.endsWith(':static-confirm'));
    const fnOne = all.find((a) => a.id.endsWith(':fn-confirm'));
    expect(staticOne?.confirmPrompt).toBe('Are you sure?');
    expect(fnOne?.confirmPrompt).toBe('Touching FOO?');
  });
});
