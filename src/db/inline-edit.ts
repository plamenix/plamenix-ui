/**
 * Helpers for the result-table inline cell editor.
 *
 * Three concerns, kept in one module so they evolve together:
 *
 *   1. `inferEditableTable` — given the SQL that produced the current
 *      result and the active schema, decide whether the rows are safe
 *      to edit inline. The bar is intentionally narrow: a single-table
 *      `SELECT` against a base table that ships every PK column in
 *      the projection.
 *
 *   2. `parseEditedValue` — turn the user's draft string back into a
 *      typed `ColumnValue`, taking the column's declared `sqlType` as
 *      the source of truth.
 *
 *   3. `buildUpdateSql` — emit the `UPDATE … WHERE pk = …` round-trip
 *      that commits the change. Literals are quoted in line with the
 *      Firebird dialect (single-quote string escape via doubling,
 *      ISO timestamps wrapped in single quotes, BLOBs out of scope).
 *
 * The module owns no React state and no IO; the host wires it into
 * `ResultTable` via two props (`editable`, `onCommit`).
 */

import { quoteIdent } from './schema-actions';
import { parseExactInt } from './exact-int';
import type { ColumnInfo, ColumnValue, Schema, TableInfo } from './types';

/** Per-result-column metadata required by the inline editor. */
export interface EditableContext {
  /** Table whose rows the result is sourced from (verified single-base
   *  SELECT against this name). */
  table: TableInfo;
  /** Result-column indices that make up the primary key, in declared
   *  segment order. */
  pkColIndices: number[];
  /** Lookup from result-column index → column info from the schema, or
   *  `null` when a projected column is not a declared table column (e.g.
   *  expression aliases). Edits to `null` entries are blocked. */
  columnInfoByIndex: (ColumnInfo | null)[];
}

/** Outcome of validating a user's draft string against a column type. */
export type ParsedValue =
  | { ok: true; value: ColumnValue; literal: string }
  | { ok: false; reason: string };

/** Sentinel string the typed editor uses for the NULL toggle. Picked
 *  to be unambiguous against any user-typed text: a NUL byte cannot
 *  appear in a normal text-mode input. Written as an escape rather
 *  than a literal NUL so this file stays plain text — an embedded NUL
 *  makes grep treat the whole module as binary and skip it. */
export const NULL_SENTINEL = '\u0000__plamenix_null__';

/** Sentinel string the typed editor uses for the DEFAULT toggle. The
 *  commit path detects this and emits the bare `DEFAULT` keyword so
 *  Firebird evaluates the declared default expression server-side. */
export const DEFAULT_SENTINEL = '\u0000__plamenix_default__';

/**
 * Decides whether the rows produced by `sql` are safe to edit inline.
 *
 * Returns `null` when:
 *   - The SQL is multi-statement or not a SELECT.
 *   - The FROM clause references zero or multiple relations (joins,
 *     comma-separated table lists, subqueries).
 *   - The named relation is not a base table.
 *   - The base table has no `PRIMARY KEY` constraint.
 *   - One or more PK columns are missing from the projection.
 *
 * Otherwise returns the context the editor needs to drive saves.
 */
export function inferEditableTable(
  sql: string,
  resultColumns: { name: string }[],
  schema: Schema | null,
): EditableContext | null {
  if (!schema) return null;
  const tableName = extractSingleFromTable(sql);
  if (!tableName) return null;
  const table = schema.tables.find((t) => t.name.toUpperCase() === tableName.toUpperCase());
  if (!table) return null;
  if (table.kind !== 'table') return null;
  const pkNames = table.primaryKey ?? [];
  if (pkNames.length === 0) return null;

  const columnInfoByIndex: (ColumnInfo | null)[] = resultColumns.map((c) => {
    const name = c.name.toUpperCase();
    return table.columns.find((ci) => ci.name.toUpperCase() === name) ?? null;
  });

  const pkColIndices: number[] = [];
  for (const pkName of pkNames) {
    const idx = resultColumns.findIndex((c) => c.name.toUpperCase() === pkName.toUpperCase());
    if (idx < 0) return null;
    pkColIndices.push(idx);
  }

  return { table, pkColIndices, columnInfoByIndex };
}

/**
 * Pulls the single base-relation name out of `sql` for SELECT
 * statements with a trivial FROM. Returns `null` for anything that
 * smells of joins, subqueries, comma-separated tables, or non-SELECTs.
 *
 * The check is deliberately conservative — the goal is to err toward
 * "not editable" rather than misroute an UPDATE.
 */
function extractSingleFromTable(sql: string): string | null {
  const stripped = stripCommentsAndStrings(sql).trim().toUpperCase();
  if (!/^SELECT\b/.test(stripped)) return null;
  const fromIdx = stripped.search(/\bFROM\b/);
  if (fromIdx < 0) return null;
  const afterFrom = stripped.slice(fromIdx + 'FROM'.length).trim();
  const tail = afterFrom.split(/\bWHERE\b|\bORDER\b|\bGROUP\b|\bHAVING\b|\bROWS\b|\bFETCH\b/)[0];
  if (!tail) return null;
  const trimmed = tail.trim();
  if (/[,()]/.test(trimmed)) return null;
  if (/\bJOIN\b/.test(trimmed)) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0];
  if (!first) return null;
  if (parts.length > 1) {
    const second = parts[1];
    if (second && second !== 'AS' && !/^\w+$/.test(second)) return null;
    if (second === 'AS' && parts.length > 3) return null;
  }
  return first.replace(/^"(.+)"$/, '$1');
}

/** Erases comment and string-literal regions so the FROM-scanner does
 *  not get confused by keywords appearing inside them. */
function stripCommentsAndStrings(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'") {
      out += ' ';
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Turns a free-form draft string back into a typed `ColumnValue` plus
 * the SQL literal that would set the column to the same value.
 *
 * Two sentinel inputs short-circuit type-aware parsing:
 *   - {@link NULL_SENTINEL} → emits `NULL` regardless of column type
 *     (rejected on `NOT NULL` columns).
 *   - {@link DEFAULT_SENTINEL} → emits the bare `DEFAULT` keyword.
 *     Caller is expected to skip the optimistic `value` field since
 *     the post-update body comes from the server.
 *
 * Otherwise: empty strings become `NULL` for nullable columns;
 * BOOLEAN accepts `true`/`false`/`1`/`0`/`yes`/`no` (case-insensitive);
 * DATE / TIME / TIMESTAMP (with/without time zone) accept the
 * ISO-8601 forms the type-aware HTML inputs emit; integer kinds reject
 * non-whole numbers; float / NUMERIC / DECIMAL accept any parsable
 * number; everything else is treated as text. BLOB returns `ok: false`.
 */
export function parseEditedValue(draft: string, column: ColumnInfo): ParsedValue {
  if (draft === NULL_SENTINEL) {
    if (!column.nullable) {
      return { ok: false, reason: `${column.name} cannot be NULL.` };
    }
    return { ok: true, value: { type: 'null' }, literal: 'NULL' };
  }
  if (draft === DEFAULT_SENTINEL) {
    if (column.defaultExpr === undefined || column.defaultExpr === null) {
      return {
        ok: false,
        reason: `${column.name} has no DEFAULT to fall back to.`,
      };
    }
    // The post-update value can't be predicted without a follow-up
    // SELECT — fall back to `null` so the optimistic override doesn't
    // claim to know the new state. The host re-fetches on success.
    return { ok: true, value: { type: 'null' }, literal: 'DEFAULT' };
  }
  const sqlType = column.sqlType.toUpperCase();
  const trimmed = draft.trim();
  if (trimmed.length === 0) {
    if (!column.nullable) {
      return { ok: false, reason: `${column.name} cannot be NULL.` };
    }
    return { ok: true, value: { type: 'null' }, literal: 'NULL' };
  }
  if (sqlType.startsWith('BLOB')) {
    return { ok: false, reason: 'BLOB columns cannot be edited inline.' };
  }
  if (sqlType === 'BOOLEAN') {
    const lower = trimmed.toLowerCase();
    const truthy = ['true', 't', '1', 'yes', 'y'].includes(lower);
    const falsy = ['false', 'f', '0', 'no', 'n'].includes(lower);
    if (!truthy && !falsy) {
      return { ok: false, reason: `Boolean column needs true/false; got "${draft}".` };
    }
    return {
      ok: true,
      value: { type: 'bool', value: truthy },
      literal: truthy ? 'TRUE' : 'FALSE',
    };
  }
  if (isDateType(sqlType)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return {
        ok: false,
        reason: `DATE column expects YYYY-MM-DD; got "${draft}".`,
      };
    }
    return {
      ok: true,
      value: { type: 'text', value: trimmed },
      literal: `DATE '${trimmed}'`,
    };
  }
  if (isTimeType(sqlType)) {
    if (!/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
      return {
        ok: false,
        reason: `TIME column expects HH:MM[:SS[.fffff]]; got "${draft}".`,
      };
    }
    return {
      ok: true,
      value: { type: 'text', value: trimmed },
      literal: `TIME '${trimmed}'`,
    };
  }
  if (isTimestampType(sqlType)) {
    // `<input type="datetime-local">` emits `YYYY-MM-DDTHH:MM` (or
    // with seconds). Normalise the `T` separator that Firebird does
    // not accept inside a TIMESTAMP literal.
    const normalised = trimmed.replace('T', ' ');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalised)) {
      return {
        ok: false,
        reason: `TIMESTAMP column expects YYYY-MM-DD HH:MM[:SS[.fffff]]; got "${draft}".`,
      };
    }
    return {
      ok: true,
      value: { type: 'text', value: normalised },
      literal: `TIMESTAMP '${normalised}'`,
    };
  }
  if (isIntegerType(sqlType)) {
    if (!/^-?\d+$/.test(trimmed)) {
      return { ok: false, reason: `Integer column expects whole number; got "${draft}".` };
    }
    // Range-checked as a BigInt, not a Number: a BIGINT column accepts
    // values past 2^53, and routing them through Number would round the
    // literal this function is about to put into an UPDATE statement.
    const exact = parseExactInt(trimmed);
    if (exact === null) {
      return {
        ok: false,
        reason: `Integer column expects a 64-bit whole number; got "${draft}".`,
      };
    }
    return { ok: true, value: { type: 'integer', value: exact }, literal: exact };
  }
  if (isFixedPointType(sqlType)) {
    // NUMERIC/DECIMAL are exact. Keep the user's digits rather than
    // round-tripping through Number, which would put a rounded literal
    // into the UPDATE for anything past a double's precision. No
    // exponent form: Firebird stores these as a scaled integer.
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return {
        ok: false,
        reason: `Fixed-point column expects a plain decimal; got "${draft}".`,
      };
    }
    const normalised = trimmed.startsWith('.') ? `0${trimmed}` : trimmed;
    return {
      ok: true,
      value: { type: 'decimal', value: normalised },
      literal: normalised,
    };
  }
  if (isFloatType(sqlType)) {
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
      return {
        ok: false,
        reason: `Numeric column expects a number; got "${draft}".`,
      };
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, reason: `Numeric column expects a finite number; got "${draft}".` };
    }
    return { ok: true, value: { type: 'float', value: n }, literal: trimmed };
  }
  return {
    ok: true,
    value: { type: 'text', value: draft },
    literal: quoteString(draft),
  };
}

/**
 * Turns an existing `ColumnValue` back into its SQL-literal form for
 * use in a `WHERE` clause. NULL values would force `IS NULL` instead
 * of `=`, but PK columns are never nullable so we always emit `=`.
 */
export function cellToLiteral(cell: ColumnValue): string {
  switch (cell.type) {
    case 'null':
      return 'NULL';
    case 'text':
      return quoteString(cell.value);
    case 'integer':
    // Bare numeric literal. Both arrive as exact decimal text, so this
    // reproduces the stored value rather than a rounded double.
    case 'decimal':
      return String(cell.value);
    case 'float':
      return cell.value === null ? 'NULL' : String(cell.value);
    case 'bool':
      return cell.value ? 'TRUE' : 'FALSE';
    case 'blob':
      // BLOB columns are never primary keys in Firebird, so this
      // branch is theoretical. Use the cached peek bytes; the host's
      // round-trip will fail loudly if a non-PK BLOB ever reaches here.
      return `x'${cell.value.peekHex}'`;
  }
}

/**
 * Builds the `UPDATE` round-trip for a single-cell edit. Quotes every
 * identifier and emits a `=`-style equality predicate against each PK
 * column.
 */
export function buildUpdateSql(args: {
  table: string;
  columnName: string;
  newLiteral: string;
  pkValues: { name: string; literal: string }[];
}): string {
  const setClause = `${quoteIdent(args.columnName)} = ${args.newLiteral}`;
  const where = args.pkValues.map((p) => `${quoteIdent(p.name)} = ${p.literal}`).join(' AND ');
  return `UPDATE ${quoteIdent(args.table)} SET ${setClause} WHERE ${where}`;
}

/**
 * Emits a WHERE predicate that matches exactly the rows whose PK
 * values are listed in `rows`. Single-column PKs use an `IN (...)`
 * shortcut; composite PKs degrade to an OR-of-AND-equality expansion
 * (Firebird does not accept row-value `IN` syntax).
 *
 * The returned string is the body that follows `WHERE` — callers are
 * responsible for prepending the keyword.
 */
export function buildPrimaryKeyWhere(args: {
  pkColumns: string[];
  rows: { literals: string[] }[];
}): string {
  if (args.rows.length === 0) {
    throw new Error('buildPrimaryKeyWhere needs at least one row.');
  }
  if (args.pkColumns.length === 1) {
    const col = quoteIdent(args.pkColumns[0]!);
    const values = args.rows.map((r) => r.literals[0]!).join(', ');
    return `${col} IN (${values})`;
  }
  const clauses = args.rows.map((row) => {
    const pieces = args.pkColumns.map((name, i) => `${quoteIdent(name)} = ${row.literals[i]!}`);
    return `(${pieces.join(' AND ')})`;
  });
  return clauses.join(' OR ');
}

/**
 * Builds a bulk `DELETE FROM table WHERE pk IN (...)` for the rows
 * selected in the result table.
 */
export function buildBulkDeleteSql(args: {
  table: string;
  pkColumns: string[];
  rows: { literals: string[] }[];
}): string {
  const where = buildPrimaryKeyWhere({ pkColumns: args.pkColumns, rows: args.rows });
  return `DELETE FROM ${quoteIdent(args.table)} WHERE ${where}`;
}

/**
 * Builds a bulk `UPDATE table SET col = lit WHERE pk IN (...)` for
 * the rows selected in the result table. The new literal applies to
 * every targeted row.
 */
export function buildBulkUpdateSql(args: {
  table: string;
  columnName: string;
  newLiteral: string;
  pkColumns: string[];
  rows: { literals: string[] }[];
}): string {
  const where = buildPrimaryKeyWhere({ pkColumns: args.pkColumns, rows: args.rows });
  return `UPDATE ${quoteIdent(args.table)} SET ${quoteIdent(args.columnName)} = ${args.newLiteral} WHERE ${where}`;
}

/**
 * Builds a `DELETE FROM table [WHERE predicate]` for the
 * "all rows in database" bulk scope. When `predicate` is `null`, the
 * statement is unbounded and wipes every row in the table — callers
 * are expected to surface a confirm prompt that names this scope.
 */
export function buildAllRowsDeleteSql(args: { table: string; predicate: string | null }): string {
  const base = `DELETE FROM ${quoteIdent(args.table)}`;
  return args.predicate ? `${base} WHERE ${args.predicate}` : base;
}

/**
 * Builds an `UPDATE table SET col = lit [WHERE predicate]` for the
 * "all rows in database" bulk scope. Same warning as
 * {@link buildAllRowsDeleteSql} — without a predicate every row in
 * the table is rewritten.
 */
export function buildAllRowsUpdateSql(args: {
  table: string;
  columnName: string;
  newLiteral: string;
  predicate: string | null;
}): string {
  const base = `UPDATE ${quoteIdent(args.table)} SET ${quoteIdent(args.columnName)} = ${args.newLiteral}`;
  return args.predicate ? `${base} WHERE ${args.predicate}` : base;
}

/**
 * Builds an `INSERT INTO table (col, …) VALUES (lit, …)` statement.
 * `values` must be non-empty — columns the user left untouched should
 * be omitted entirely so Firebird applies the declared default (or
 * NULL when the column is nullable).
 */
export function buildInsertSql(args: {
  table: string;
  values: { name: string; literal: string }[];
}): string {
  if (args.values.length === 0) {
    throw new Error('buildInsertSql needs at least one column-value pair.');
  }
  const columns = args.values.map((v) => quoteIdent(v.name)).join(', ');
  const literals = args.values.map((v) => v.literal).join(', ');
  return `INSERT INTO ${quoteIdent(args.table)} (${columns}) VALUES (${literals})`;
}

/** `true` for column types whose runtime values are whole numbers
 *  (no fractional portion). NUMERIC/DECIMAL without a comma in the
 *  precision clause is also integral (`NUMERIC(18)` etc.). */
export function isIntegerType(sqlType: string): boolean {
  if (
    sqlType === 'SMALLINT' ||
    sqlType === 'INTEGER' ||
    sqlType === 'BIGINT' ||
    sqlType === 'INT128'
  ) {
    return true;
  }
  if (sqlType.startsWith('NUMERIC') || sqlType.startsWith('DECIMAL')) {
    return !sqlType.includes(',');
  }
  return false;
}

/** `true` for exact fixed-point columns — scaled `NUMERIC` and
 *  `DECIMAL`. Firebird stores these as a scaled integer, so they hold
 *  their digits exactly and must not be routed through a JS number.
 *
 *  Checked before {@link isFloatType}, which also matches them for the
 *  sake of callers that only care whether a fractional part exists. */
export function isFixedPointType(sqlType: string): boolean {
  if (sqlType.startsWith('NUMERIC') || sqlType.startsWith('DECIMAL')) {
    return sqlType.includes(',');
  }
  return false;
}

/** `true` for column types whose runtime values carry a fractional
 *  portion. Includes scaled NUMERIC/DECIMAL and IEEE-754 floats. */
export function isFloatType(sqlType: string): boolean {
  if (sqlType === 'FLOAT' || sqlType === 'DOUBLE PRECISION' || sqlType === 'REAL') {
    return true;
  }
  if (sqlType.startsWith('NUMERIC') || sqlType.startsWith('DECIMAL')) {
    return sqlType.includes(',');
  }
  if (sqlType.startsWith('DECFLOAT')) {
    return true;
  }
  return false;
}

/** `true` for `DATE` columns. */
export function isDateType(sqlType: string): boolean {
  return sqlType === 'DATE';
}

/** `true` for `TIME` and `TIME WITH TIME ZONE` columns. */
export function isTimeType(sqlType: string): boolean {
  return sqlType === 'TIME' || sqlType === 'TIME WITH TIME ZONE';
}

/** `true` for `TIMESTAMP` and `TIMESTAMP WITH TIME ZONE` columns. */
export function isTimestampType(sqlType: string): boolean {
  return sqlType === 'TIMESTAMP' || sqlType === 'TIMESTAMP WITH TIME ZONE';
}

/** Decimal-scale step value for `<input type="number">` based on the
 *  NUMERIC/DECIMAL declaration (e.g. `NUMERIC(10,2)` → `"0.01"`).
 *  Returns `"any"` when the scale cannot be inferred. */
export function numericStepFor(sqlType: string): string {
  const match = /\((\d+)\s*,\s*(\d+)\)/.exec(sqlType);
  if (!match) return 'any';
  const scale = Number(match[2]);
  if (!Number.isFinite(scale) || scale <= 0) return '1';
  return `0.${'0'.repeat(scale - 1)}1`;
}

function quoteString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
