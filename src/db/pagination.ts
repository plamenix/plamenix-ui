/**
 * Helpers for server-side sort and pagination of result outcomes.
 *
 * Both transforms are emitted by wrapping the user's SQL in a
 * subquery and adding an outer `ORDER BY` / `ROWS m TO n` clause.
 * This avoids the complexity of editing the user's SQL in place
 * (parsing existing ORDER BY, detecting clause boundaries) and
 * keeps the predicate stack composable with
 * {@link injectWhereClause}.
 *
 * Trade-off: column names from the inner SELECT must be unique
 * across the outer projection, which Firebird already enforces for
 * SELECTs against a single relation.
 */

export type SortDirection = 'ASC' | 'DESC';

export interface OrderBy {
  columnName: string;
  direction: SortDirection;
}

export interface Pagination {
  /** Zero-based row offset; `0` is the first row. */
  offset: number;
  /** Maximum rows per page. */
  limit: number;
}

/** Default page size used as the hard fallback when neither the host
 *  nor the persisted user preference supplies one. React contexts
 *  should prefer reading `useDisplayStore(s => s.defaultPageSize)`. */
export const DEFAULT_PAGE_SIZE = 100;
/** Page-size choices exposed in the result-table footer + the
 *  settings panel. Keep in ascending order. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000];

/**
 * Appends `ORDER BY` / `ROWS` clauses to `sql`, inlining them directly
 * for simple `SELECT … FROM …` statements (no UNION / EXCEPT /
 * INTERSECT / CTE / outer subquery) and falling back to a
 * `SELECT * FROM (<sql>) AS t` wrap when the input is something the
 * inline rewrite can't safely modify.
 *
 * Trailing semicolons are stripped from the input. When both `orderBy`
 * and `pagination` are `null` the function returns `sql` verbatim so
 * the result-execution pipeline can short-circuit out of the wrap.
 *
 * Pre-existing trailing `ORDER BY` and `ROWS` clauses on the input
 * are STRIPPED before the new ones are appended. The new clauses
 * always win.
 */
export function wrapWithSortAndLimit(
  sql: string,
  orderBy: OrderBy | null,
  pagination: Pagination | null,
): string {
  if (!orderBy && !pagination) return sql;
  let inner = sql.replace(/;+\s*$/, '').trim();
  inner = stripTrailingRowsClause(inner);
  inner = stripTrailingOrderByClause(inner);

  const clauses: string[] = [];
  if (orderBy) {
    clauses.push(`ORDER BY ${quoteIdent(orderBy.columnName)} ${orderBy.direction}`);
  }
  if (pagination) {
    clauses.push(`ROWS ${pagination.offset + 1} TO ${pagination.offset + pagination.limit}`);
  }

  if (canInlineAppend(inner)) {
    return [inner, ...clauses].join(' ');
  }
  return [`SELECT * FROM (${inner}) AS t`, ...clauses].join(' ');
}

/**
 * Strips a trailing `ROWS n [TO m]` clause from `sql` if present.
 * Match is anchored at the end + balanced-paren-aware to avoid
 * touching a clause inside a subquery.
 */
function stripTrailingRowsClause(sql: string): string {
  const match = /\sROWS\s+\d+(\s+TO\s+\d+)?\s*$/i.exec(sql);
  if (!match) return sql;
  // Trailing ROWS can only belong to the outer SELECT if its position
  // is outside every set of parentheses.
  if (parenDepthAt(sql, match.index) !== 0) return sql;
  return sql.slice(0, match.index).trimEnd();
}

/**
 * Strips a trailing `ORDER BY <...>` clause from `sql` if it belongs
 * to the outermost SELECT. Skips clauses inside subqueries so
 * `WHERE EXISTS (SELECT 1 FROM X ORDER BY 1)` survives.
 */
function stripTrailingOrderByClause(sql: string): string {
  const upper = sql.toUpperCase();
  let pos = -1;
  let from = upper.length;
  while (from > 0) {
    const found = upper.lastIndexOf('ORDER BY', from);
    if (found < 0) break;
    if (parenDepthAt(sql, found) === 0) {
      pos = found;
      break;
    }
    from = found - 1;
  }
  if (pos < 0) return sql;
  return sql.slice(0, pos).trimEnd();
}

/** Computes the parenthesis nesting depth of `sql` at `index`. */
function parenDepthAt(sql: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    const ch = sql[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * True when the SQL is a single SELECT whose ORDER BY / ROWS clauses
 * can be appended inline. False for queries that need the
 * subquery-wrap fallback — UNION / EXCEPT / INTERSECT, CTEs, EXECUTE
 * BLOCK, multi-statement scripts, etc.
 */
function canInlineAppend(sql: string): boolean {
  const upper = sql.toUpperCase();
  // Reject anything that isn't a top-level SELECT. The first
  // non-whitespace token must be SELECT.
  if (!/^\s*SELECT\b/i.test(sql)) return false;
  // Reject set operations + CTE + DECLARE block at the OUTER level.
  // Naive substring matches are fine for the typical shapes; a
  // misclassification only forces the safe subquery wrap, never
  // produces invalid SQL.
  const hazards = [' UNION ', ' EXCEPT ', ' INTERSECT '];
  for (const haz of hazards) {
    let from = 0;
    while (from < upper.length) {
      const pos = upper.indexOf(haz, from);
      if (pos < 0) break;
      if (parenDepthAt(sql, pos) === 0) return false;
      from = pos + 1;
    }
  }
  return true;
}

/** Cycles a column header click between asc → desc → cleared. */
export function nextOrderBy(
  current: OrderBy | null,
  columnName: string,
): OrderBy | null {
  if (current === null || current.columnName !== columnName) {
    return { columnName, direction: 'ASC' };
  }
  if (current.direction === 'ASC') {
    return { columnName, direction: 'DESC' };
  }
  return null;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
