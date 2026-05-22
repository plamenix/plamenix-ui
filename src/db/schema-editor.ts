/**
 * DDL generator for the visual schema editor.
 *
 * The editor lets users design a `CREATE TABLE` interactively and
 * emits the SQL on Apply. ALTER-style diff against an existing table
 * is intentionally out of scope for v1 — the JetBrains-style three-
 * way merge against the live schema is its own multi-week project.
 */

import { quoteIdent } from './schema-actions';

/** One column row in the editor. */
export interface ColumnDraft {
  /** Local stable identifier so React rows don't churn on reorder. */
  id: string;
  /** Identifier; quoted when emitted. */
  name: string;
  /** Free-form Firebird type expression (`INTEGER`, `VARCHAR(50)`,
   *  `NUMERIC(18,2)`, `BLOB SUB_TYPE TEXT`, or a user-defined domain
   *  reference like `D_EMAIL`). */
  sqlType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  /** Verbatim DEFAULT expression — emitted with no quoting so the
   *  user can write `CURRENT_TIMESTAMP`, `0`, `'pending'`, etc. */
  defaultValue: string;
}

/** Stock type presets surfaced in the type input's datalist. Users
 *  can override the value at will; this is just an autocomplete. */
export const STOCK_TYPES: string[] = [
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'INT128',
  'NUMERIC(18,2)',
  'DECIMAL(18,2)',
  'FLOAT',
  'DOUBLE PRECISION',
  'BOOLEAN',
  'CHAR(10)',
  'VARCHAR(50)',
  'VARCHAR(255)',
  'DATE',
  'TIME',
  'TIME WITH TIME ZONE',
  'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE',
  'BLOB',
  'BLOB SUB_TYPE TEXT',
];

/** Outcome of {@link validateDraft}. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Surface-level checks before SQL emission. Catches the obvious
 *  mistakes (empty table name, duplicate columns, no columns at all)
 *  so the user gets a friendly inline error rather than a Firebird
 *  parser blow-up. */
export function validateDraft(
  tableName: string,
  columns: ColumnDraft[],
): ValidationResult {
  if (tableName.trim().length === 0) {
    return { ok: false, reason: 'Table name is required.' };
  }
  if (columns.length === 0) {
    return { ok: false, reason: 'Add at least one column.' };
  }
  const seen = new Set<string>();
  for (const col of columns) {
    const name = col.name.trim();
    if (name.length === 0) {
      return { ok: false, reason: 'Every column needs a name.' };
    }
    if (col.sqlType.trim().length === 0) {
      return { ok: false, reason: `Column ${name} is missing a type.` };
    }
    const key = name.toUpperCase();
    if (seen.has(key)) {
      return { ok: false, reason: `Duplicate column name: ${name}.` };
    }
    seen.add(key);
  }
  return { ok: true };
}

/** Builds the `CREATE TABLE` body for the supplied draft. Callers
 *  must validate first; bad shapes produce malformed SQL. */
export function buildCreateTableSql(
  tableName: string,
  columns: ColumnDraft[],
): string {
  const lines: string[] = [];
  const ident = quoteIdent(tableName.trim());
  lines.push(`CREATE TABLE ${ident} (`);
  const pkCols = columns
    .filter((c) => c.isPrimaryKey)
    .map((c) => quoteIdent(c.name.trim()));
  columns.forEach((c, i) => {
    const isLastBody = i === columns.length - 1 && pkCols.length === 0;
    const pieces: string[] = [`    ${quoteIdent(c.name.trim())}`, c.sqlType.trim()];
    const defaultExpr = c.defaultValue.trim();
    if (defaultExpr.length > 0) pieces.push(`DEFAULT ${defaultExpr}`);
    if (!c.nullable) pieces.push('NOT NULL');
    lines.push(`${pieces.join(' ')}${isLastBody ? '' : ','}`);
  });
  if (pkCols.length > 0) {
    lines.push(`    PRIMARY KEY (${pkCols.join(', ')})`);
  }
  lines.push(');');
  return lines.join('\n');
}

/** Factory for a fresh blank row. */
export function freshColumnDraft(): ColumnDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    sqlType: 'INTEGER',
    nullable: true,
    isPrimaryKey: false,
    defaultValue: '',
  };
}
