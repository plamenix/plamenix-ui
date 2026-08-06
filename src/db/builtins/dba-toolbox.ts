/**
 * Built-in DBA toolbox (I4.8) — extracts the existing TABLE-only
 * `RECREATE TABLE` + `SET STATISTICS INDEX` actions from
 * `schema-actions.ts` into a `schema_actions` contribution registered
 * under `@plamenix-builtin/dba-toolbox`.
 *
 * Visual + behaviour parity with the legacy hardcoded actions: same
 * SQL emission, same destructive flag on RECREATE, same confirm
 * prompt. The existing `schemaDdl` switch in `schema-actions.ts`
 * keeps emitting those cases — built-in registration is additive,
 * SchemaBrowser consumer wiring is later work. Once the consumer
 * reads from the registry, the legacy cases in `schemaDdl` become
 * the residual fallback.
 *
 * Third-party DBA-toolbox plugins (rebuild indexes, force write,
 * sweep interval, fragmentation check, repair commands, etc.) plug
 * in alongside the built-in through the same contribution point.
 */

import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import { quoteIdent } from '../schema-actions.js';
import type { SchemaActionContributionPayload } from '../schema-action-contract.js';

const BUILTIN_NAME = 'dba-toolbox';

/** RECREATE TABLE — destructive, requires confirm. Drops + recreates
 *  the table with its declared columns. Existing rows lost. */
const recreateTablePayload: SchemaActionContributionPayload = {
  label: 'RECREATE TABLE',
  hint: 'Drop and recreate the table with its declared columns. ALL ROWS ARE LOST.',
  applicableKinds: ['table'],
  destructive: true,
  confirmPrompt: (ctx) =>
    `RECREATE TABLE ${ctx.target.name} will drop ALL rows. Continue?`,
  buildSql: (ctx) => {
    const cols = ctx.target.columns ?? [];
    const ident = quoteIdent(ctx.target.name);
    const lines = [
      `-- RECREATE TABLE drops and recreates ${ctx.target.name}.`,
      `-- Existing rows are lost; dependent FKs are dropped first.`,
      `RECREATE TABLE ${ident} (`,
      ...cols.map(
        (c, i) =>
          `    ${quoteIdent(c.name)} ${c.sqlType}${c.nullable ? '' : ' NOT NULL'}${i === cols.length - 1 ? '' : ','}`,
      ),
      `);`,
    ];
    return lines.join('\n');
  },
};

/** SET STATISTICS INDEX — recomputes selectivity for every user
 *  index on the table. Non-destructive. */
const recomputeStatisticsPayload: SchemaActionContributionPayload = {
  label: 'SET STATISTICS for every index',
  hint: 'Recompute index selectivity for every user index on this table.',
  applicableKinds: ['table'],
  destructive: false,
  buildSql: (ctx) => {
    // Escape single quotes in the literal table name fed to the
    // generated EXECUTE STATEMENT.
    const safeName = ctx.target.name.replace(/'/g, "''");
    return [
      `-- Recompute index selectivity for every user index on ${ctx.target.name}.`,
      `EXECUTE BLOCK`,
      `AS`,
      `    DECLARE V_NAME VARCHAR(63);`,
      `BEGIN`,
      `    FOR SELECT TRIM(RDB$INDEX_NAME)`,
      `        FROM RDB$INDICES`,
      `        WHERE RDB$RELATION_NAME = '${safeName}'`,
      `          AND COALESCE(RDB$SYSTEM_FLAG, 0) = 0`,
      `        INTO :V_NAME`,
      `    DO`,
      `        EXECUTE STATEMENT 'SET STATISTICS INDEX "' || :V_NAME || '"';`,
      `END;`,
    ].join('\n');
  },
};

/**
 * Registers the built-in DBA toolbox actions. Idempotent at the
 * caller level (returns a teardown closure that unregisters); pair
 * with the cleanup in a `useEffect` if the host needs deterministic
 * mount/unmount lifecycle.
 */
export function registerBuiltinDbaToolbox(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    schema_actions: [
      {
        id: 'recreate-table',
        priority: 100,
        payload: recreateTablePayload,
      },
      {
        id: 'recompute-statistics',
        priority: 100,
        payload: recomputeStatisticsPayload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

/** Explicit teardown — alternative to the returned closure. */
export function unregisterBuiltinDbaToolbox(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
