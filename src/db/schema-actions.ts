/**
 * SQL templates for the schema-browser right-click actions.
 *
 * The browser emits a {@link SchemaAction}; the host calls
 * {@link schemaDdl} to turn that into a {@link SchemaDdl}: the SQL text
 * to drop into the editor (or execute, for destructive operations), the
 * confirm prompt to surface for destructive ones, and a flag the host
 * checks before deciding to auto-run vs. wait for the user to click
 * Execute.
 *
 * Kept in `@plamenix/ui` so both editions share the exact same
 * Firebird-dialect templates and DROP-confirm wording.
 */

import type { SchemaAction } from './types';

/** Renderable outcome of a schema-browser DDL action. */
export interface SchemaDdl {
  /** SQL text to insert into the editor (or execute, for `runImmediately` actions). */
  sql: string;
  /** When `true`, the host should prompt the user before executing
   *  this statement. Set for every DROP / RESET-style action. */
  destructive: boolean;
  /** Wording for the confirm dialog. Only meaningful when
   *  `destructive` is `true`. */
  confirmPrompt?: string;
  /** When `true`, the host should execute the statement immediately
   *  (no confirm, no paste into the editor) and refresh the schema
   *  afterwards. Used for cheap reversible toggles like trigger
   *  ACTIVE/INACTIVE. Mutually exclusive with `destructive`. */
  autoExecute?: boolean;
}

/** Kinds that carry a source text the read-only DDL viewer can surface.
 *  Tables, generators, and domains have no `*_SOURCE` column in
 *  Firebird's metadata and are excluded. */
export type DdlSourceKind = 'view' | 'procedure' | 'trigger';

/** Builds the metadata SELECT that returns the source text for a
 *  `view`, `procedure`, or `trigger`. The driver decodes the BLOB
 *  SUB_TYPE TEXT column to a plain Text cell so the caller can unwrap
 *  it with no blob fetch. */
export function sourceQuery(kind: DdlSourceKind, name: string): string {
  const escaped = name.replace(/'/g, "''");
  switch (kind) {
    case 'view':
      return `SELECT RDB$VIEW_SOURCE FROM RDB$RELATIONS WHERE TRIM(RDB$RELATION_NAME) = '${escaped}';`;
    case 'procedure':
      return `SELECT RDB$PROCEDURE_SOURCE FROM RDB$PROCEDURES WHERE TRIM(RDB$PROCEDURE_NAME) = '${escaped}';`;
    case 'trigger':
      return `SELECT RDB$TRIGGER_SOURCE FROM RDB$TRIGGERS WHERE TRIM(RDB$TRIGGER_NAME) = '${escaped}';`;
  }
}

/** Quotes a Firebird identifier only when the bare form would change
 *  meaning (lowercase letters, leading digit, special chars). All-upper
 *  ASCII identifiers stay bare to match Firebird's case-folding
 *  convention. */
export function quoteIdent(name: string): string {
  if (/^[A-Z_][A-Z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

/** Builds the SQL template for a {@link SchemaAction}. */
export function schemaDdl(action: SchemaAction): SchemaDdl {
  switch (action.kind) {
    case 'table':
      return tableDdl(action);
    case 'view':
      return viewDdl(action);
    case 'procedure':
      return procDdl(action);
    case 'trigger':
      return triggerDdl(action);
    case 'generator':
      return generatorDdl(action);
    case 'domain':
      return domainDdl(action);
  }
}

function tableDdl(a: Extract<SchemaAction, { kind: 'table' }>): SchemaDdl {
  const ident = quoteIdent(a.target.name);
  switch (a.action) {
    case 'drop':
      return {
        sql: `DROP TABLE ${ident};`,
        destructive: true,
        confirmPrompt: `Drop table ${a.target.name}? This cannot be undone.`,
      };
    case 'alter':
      return {
        sql: [
          `ALTER TABLE ${ident}`,
          `    ADD <column_name> <data_type>;`,
          ``,
          `-- Replace with the change you want. Firebird also supports:`,
          `--   DROP <column_name>`,
          `--   ALTER <column_name> TYPE <data_type>`,
          `--   ALTER <column_name> SET DEFAULT <expr> / DROP DEFAULT`,
          `--   ADD CONSTRAINT <name> ...`,
        ].join('\n'),
        destructive: false,
      };
    case 'create-index': {
      const firstCol = a.target.columns[0]?.name ?? 'column_name';
      const idxName = `IDX_${a.target.name}_${firstCol}`;
      return {
        sql: `CREATE INDEX ${quoteIdent(idxName)} ON ${ident} (${quoteIdent(firstCol)});`,
        destructive: false,
      };
    }
    case 'recreate':
      return {
        sql: [
          `-- RECREATE TABLE drops and recreates ${a.target.name}.`,
          `-- Existing rows are lost; dependent FKs are dropped first.`,
          `RECREATE TABLE ${ident} (`,
          ...a.target.columns.map(
            (c, i) =>
              `    ${quoteIdent(c.name)} ${c.sqlType}${c.nullable ? '' : ' NOT NULL'}${i === a.target.columns.length - 1 ? '' : ','}`,
          ),
          `);`,
        ].join('\n'),
        destructive: true,
        confirmPrompt: `RECREATE TABLE ${a.target.name} will drop ALL rows. Continue?`,
      };
    case 'recompute-statistics':
      return {
        sql: [
          `-- Recompute index selectivity for every user index on ${a.target.name}.`,
          `EXECUTE BLOCK`,
          `AS`,
          `    DECLARE V_NAME VARCHAR(63);`,
          `BEGIN`,
          `    FOR SELECT TRIM(RDB$INDEX_NAME)`,
          `        FROM RDB$INDICES`,
          `        WHERE RDB$RELATION_NAME = '${a.target.name.replace(/'/g, "''")}'`,
          `          AND COALESCE(RDB$SYSTEM_FLAG, 0) = 0`,
          `        INTO :V_NAME`,
          `    DO`,
          `        EXECUTE STATEMENT 'SET STATISTICS INDEX "' || :V_NAME || '"';`,
          `END;`,
        ].join('\n'),
        destructive: false,
      };
  }
}

function viewDdl(a: Extract<SchemaAction, { kind: 'view' }>): SchemaDdl {
  const ident = quoteIdent(a.target.name);
  switch (a.action) {
    case 'drop':
      return {
        sql: `DROP VIEW ${ident};`,
        destructive: true,
        confirmPrompt: `Drop view ${a.target.name}? This cannot be undone.`,
      };
    case 'alter':
      return {
        sql: [
          `ALTER VIEW ${ident} (<column_list>)`,
          `AS`,
          `    SELECT <expr_list>`,
          `    FROM <relation>;`,
        ].join('\n'),
        destructive: false,
      };
    case 'show-source':
      return {
        sql: `SELECT RDB$VIEW_SOURCE\nFROM RDB$RELATIONS\nWHERE TRIM(RDB$RELATION_NAME) = '${a.target.name.replace(/'/g, "''")}';`,
        destructive: false,
      };
  }
}

function procDdl(a: Extract<SchemaAction, { kind: 'procedure' }>): SchemaDdl {
  const ident = quoteIdent(a.target.name);
  switch (a.action) {
    case 'execute':
      return {
        sql:
          a.target.outputCount > 0
            ? `SELECT * FROM ${ident}(<inputs>);`
            : `EXECUTE PROCEDURE ${ident}(<inputs>);`,
        destructive: false,
      };
    case 'alter':
      return {
        sql: [
          `ALTER PROCEDURE ${ident}`,
          `    (<input_params>)`,
          `    RETURNS (<output_params>)`,
          `AS`,
          `BEGIN`,
          `    <body>`,
          `END;`,
        ].join('\n'),
        destructive: false,
      };
    case 'show-source':
      return {
        sql: `SELECT RDB$PROCEDURE_SOURCE\nFROM RDB$PROCEDURES\nWHERE TRIM(RDB$PROCEDURE_NAME) = '${a.target.name.replace(/'/g, "''")}';`,
        destructive: false,
      };
    case 'drop':
      return {
        sql: `DROP PROCEDURE ${ident};`,
        destructive: true,
        confirmPrompt: `Drop procedure ${a.target.name}? This cannot be undone.`,
      };
  }
}

function triggerDdl(a: Extract<SchemaAction, { kind: 'trigger' }>): SchemaDdl {
  const ident = quoteIdent(a.target.name);
  switch (a.action) {
    case 'toggle-active':
      return {
        sql: `ALTER TRIGGER ${ident} ${a.target.active ? 'INACTIVE' : 'ACTIVE'};`,
        destructive: false,
        autoExecute: true,
      };
    case 'show-source':
      return {
        sql: `SELECT RDB$TRIGGER_SOURCE\nFROM RDB$TRIGGERS\nWHERE TRIM(RDB$TRIGGER_NAME) = '${a.target.name.replace(/'/g, "''")}';`,
        destructive: false,
      };
    case 'drop':
      return {
        sql: `DROP TRIGGER ${ident};`,
        destructive: true,
        confirmPrompt: `Drop trigger ${a.target.name}? This cannot be undone.`,
      };
  }
}

function generatorDdl(a: Extract<SchemaAction, { kind: 'generator' }>): SchemaDdl {
  const ident = quoteIdent(a.target.name);
  switch (a.action) {
    case 'next-value':
      return {
        sql: `SELECT NEXT VALUE FOR ${ident} FROM RDB$DATABASE;`,
        destructive: false,
      };
    case 'reset':
      return {
        sql: `SET GENERATOR ${ident} TO 0;`,
        destructive: true,
        confirmPrompt: `Reset generator ${a.target.name} to 0? Existing rows may collide with new ones.`,
      };
    case 'set-value':
      return {
        sql: legacyGeneratorDialect(a.engineVersion)
          ? `SET GENERATOR ${ident} TO ${a.value};`
          : `ALTER SEQUENCE ${ident} RESTART WITH ${a.value};`,
        destructive: false,
        autoExecute: true,
      };
    case 'drop':
      return {
        sql: `DROP GENERATOR ${ident};`,
        destructive: true,
        confirmPrompt: `Drop generator ${a.target.name}? Dependent triggers will break.`,
      };
  }
}

/** Returns `true` when the engine reports a major version older than 3,
 *  where `ALTER SEQUENCE … RESTART WITH` is unavailable and the legacy
 *  `SET GENERATOR … TO` syntax is the only portable form. */
function legacyGeneratorDialect(engineVersion: string | null): boolean {
  if (engineVersion === null) return false;
  const major = parseInt(engineVersion.split('.')[0] ?? '0', 10);
  return Number.isFinite(major) && major > 0 && major < 3;
}

function domainDdl(a: Extract<SchemaAction, { kind: 'domain' }>): SchemaDdl {
  const ident = quoteIdent(a.target.name);
  switch (a.action) {
    case 'alter-type':
      return {
        sql: `ALTER DOMAIN ${ident} TYPE <new_type>;`,
        destructive: false,
      };
    case 'drop':
      return {
        sql: `DROP DOMAIN ${ident};`,
        destructive: true,
        confirmPrompt: `Drop domain ${a.target.name}? Columns built on it will need a TYPE change first.`,
      };
  }
}
