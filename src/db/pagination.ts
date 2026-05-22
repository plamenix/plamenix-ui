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
 * Wraps `sql` in `SELECT * FROM (<sql>)` and appends `ORDER BY` /
 * `ROWS` clauses when supplied. Trailing semicolons are stripped from
 * the input. When both `orderBy` and `pagination` are `null` the
 * function returns `sql` verbatim so the result-execution pipeline
 * can short-circuit out of the wrap.
 */
export function wrapWithSortAndLimit(
  sql: string,
  orderBy: OrderBy | null,
  pagination: Pagination | null,
): string {
  if (!orderBy && !pagination) return sql;
  const inner = sql.replace(/;+\s*$/, '').trim();
  const parts = [`SELECT * FROM (${inner})`];
  if (orderBy) {
    parts.push(`ORDER BY ${quoteIdent(orderBy.columnName)} ${orderBy.direction}`);
  }
  if (pagination) {
    parts.push(`ROWS ${pagination.offset + 1} TO ${pagination.offset + pagination.limit}`);
  }
  return parts.join(' ');
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
