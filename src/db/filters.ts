/**
 * Per-column filter helpers for the result table.
 *
 * Filters compose into a single SQL predicate that the host injects
 * back into the outcome's SELECT, so the server returns the filtered
 * shape rather than the full result truncated to client memory.
 *
 * The module owns three concerns:
 *
 *   1. The `Operator` set and the `ColumnFilter` shape the UI passes
 *      around.
 *   2. `buildFilterPredicate` — composes the WHERE body from a list
 *      of active filters, with type-aware literal quoting.
 *   3. `injectWhereClause` — splices a new predicate into an existing
 *      SELECT statement, ANDing with the user's existing WHERE when
 *      one is present and respecting trailing `ORDER BY` / `GROUP BY`
 *      / `HAVING` / `ROWS` / `FETCH` clauses.
 */

import type { ColumnInfo } from './types';

/** Operators the column-filter popover exposes. The right-hand side
 *  varies: NULL-check operators carry no value; LIKE/NOT LIKE always
 *  treat the value as text; comparison operators take the column's
 *  declared type into account. */
export type FilterOperator =
  | '='
  | '<>'
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'NOT LIKE'
  | 'CONTAINING'
  | 'IS NULL'
  | 'IS NOT NULL';

/** All operators in display order. */
export const FILTER_OPERATORS: FilterOperator[] = [
  '=',
  '<>',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'NOT LIKE',
  'CONTAINING',
  'IS NULL',
  'IS NOT NULL',
];

export interface ColumnFilter {
  /** Result-column name as Firebird reports it. */
  columnName: string;
  operator: FilterOperator;
  /** User-supplied right-hand side (ignored for `IS NULL` / `IS NOT NULL`). */
  value: string;
}

/** `true` when the operator does not require a value (NULL checks). */
export function operatorIsUnary(op: FilterOperator): boolean {
  return op === 'IS NULL' || op === 'IS NOT NULL';
}

/** Returns the filter that targets `columnName`, or `null` when none
 *  is active. */
export function findFilter(filters: ColumnFilter[], columnName: string): ColumnFilter | null {
  return filters.find((f) => f.columnName === columnName) ?? null;
}

/** Returns a copy of `filters` with `next` replacing any existing
 *  filter for the same column. Passing `null` clears the column. */
export function setFilter(
  filters: ColumnFilter[],
  columnName: string,
  next: ColumnFilter | null,
): ColumnFilter[] {
  const remaining = filters.filter((f) => f.columnName !== columnName);
  return next ? [...remaining, next] : remaining;
}

/**
 * Builds the predicate body that the host injects after `WHERE`.
 *
 * `columnInfoByName` supplies the column type so numeric, boolean,
 * and string literals are quoted correctly. Columns whose info is
 * missing fall through to text quoting. Filters whose value is empty
 * (and operator non-unary) are skipped — the UI can show pending
 * inputs without forcing a re-query.
 *
 * Returns `null` when no filters contribute a clause.
 */
export function buildFilterPredicate(
  filters: ColumnFilter[],
  columnInfoByName: Map<string, ColumnInfo>,
): string | null {
  const parts: string[] = [];
  for (const filter of filters) {
    const fragment = renderFilter(filter, columnInfoByName.get(filter.columnName) ?? null);
    if (fragment !== null) parts.push(fragment);
  }
  if (parts.length === 0) return null;
  return parts.join(' AND ');
}

function renderFilter(filter: ColumnFilter, info: ColumnInfo | null): string | null {
  const ident = quoteIdent(filter.columnName);
  if (operatorIsUnary(filter.operator)) {
    return `${ident} ${filter.operator}`;
  }
  if (filter.value.length === 0) return null;
  const literal = renderLiteral(filter.value, filter.operator, info);
  return `${ident} ${filter.operator} ${literal}`;
}

/** Quotes a value as the right-hand side of a filter. LIKE/NOT LIKE
 *  always emit a string literal; comparison operators consult the
 *  column type. */
function renderLiteral(
  value: string,
  op: FilterOperator,
  info: ColumnInfo | null,
): string {
  if (op === 'LIKE' || op === 'NOT LIKE' || op === 'CONTAINING') {
    return quoteString(value);
  }
  if (!info) return quoteString(value);
  const sqlType = info.sqlType.toUpperCase();
  if (sqlType === 'BOOLEAN') {
    const lower = value.trim().toLowerCase();
    if (['true', 't', '1', 'yes', 'y'].includes(lower)) return 'TRUE';
    if (['false', 'f', '0', 'no', 'n'].includes(lower)) return 'FALSE';
    return quoteString(value);
  }
  if (isNumericType(sqlType)) {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    return quoteString(value);
  }
  return quoteString(value);
}

function isNumericType(sqlType: string): boolean {
  if (
    sqlType === 'SMALLINT' ||
    sqlType === 'INTEGER' ||
    sqlType === 'BIGINT' ||
    sqlType === 'INT128' ||
    sqlType === 'FLOAT' ||
    sqlType === 'DOUBLE PRECISION' ||
    sqlType === 'REAL'
  ) {
    return true;
  }
  return sqlType.startsWith('NUMERIC') || sqlType.startsWith('DECIMAL');
}

function quoteString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Splices `predicate` into `sql` as an additional WHERE clause.
 *
 * Implementation strategy:
 *   - Build a "shadow" string with comments and string literals
 *     erased so keyword scans cannot match content inside them.
 *   - Find the boundary keyword (`ORDER`, `GROUP`, `HAVING`, `ROWS`,
 *     `FETCH`, `PLAN`, `UNION`, `FOR UPDATE`) that ends the WHERE
 *     region — splice just before it.
 *   - If a WHERE already exists, wrap the original body in
 *     parentheses and AND-attach the new predicate.
 *
 * The function falls back to appending ` WHERE <predicate>` to the
 * end of the trimmed SQL when no boundary is detected — safe for the
 * simplest `SELECT * FROM table` case.
 */
export function injectWhereClause(sql: string, predicate: string): string {
  const shadow = shadowSql(sql);
  const trimmed = sql.replace(/;+\s*$/, '');
  const shadowTrimmed = shadow.replace(/;+\s*$/, '');
  const upper = shadowTrimmed.toUpperCase();

  const whereIdx = findKeyword(upper, ['WHERE']);
  if (whereIdx >= 0) {
    const tail = trimmed.slice(whereIdx + 5);
    const head = trimmed.slice(0, whereIdx);
    const upperTail = shadowTrimmed.slice(whereIdx + 5).toUpperCase();
    const boundary = findKeyword(upperTail, BOUNDARY_KEYWORDS);
    if (boundary >= 0) {
      const existing = tail.slice(0, boundary).trim();
      const rest = tail.slice(boundary);
      return `${head}WHERE (${existing}) AND (${predicate}) ${rest.trim()}`.trim();
    }
    return `${head}WHERE (${tail.trim()}) AND (${predicate})`;
  }

  const boundary = findKeyword(upper, BOUNDARY_KEYWORDS);
  if (boundary >= 0) {
    return `${trimmed.slice(0, boundary).trimEnd()} WHERE ${predicate} ${trimmed.slice(boundary).trim()}`.trim();
  }
  return `${trimmed.trimEnd()} WHERE ${predicate}`;
}

const BOUNDARY_KEYWORDS = [
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'PLAN',
  'UNION',
  'ROWS',
  'FETCH',
  'FOR UPDATE',
];

/** Finds the earliest position where any of `keywords` appears as a
 *  whole word (preceded and followed by whitespace or string bounds).
 *  Returns `-1` when no match. */
function findKeyword(upper: string, keywords: string[]): number {
  let best = -1;
  for (const kw of keywords) {
    const re = new RegExp(`(^|\\s)${escapeRegex(kw)}(\\s|$)`, 'i');
    const m = upper.match(re);
    if (m && m.index !== undefined) {
      const at = m.index + (m[1]?.length ?? 0);
      if (best < 0 || at < best) best = at;
    }
  }
  return best;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces comments and string literals with whitespace of equal
 *  length so keyword scans cannot match content hidden inside them. */
function shadowSql(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i + 1 < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        out += sql[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (ch === "'") {
      out += ' ';
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += '  ';
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          out += ' ';
          i += 1;
          break;
        }
        out += sql[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
