import type { ColumnValue } from './types.js';

/**
 * Putting a table name into generated SQL, and reading a count back out.
 *
 * Both were inline and byte-identical in each shell, and both are the
 * kind of small rule that is only obviously right until it is not.
 */

/** An identifier Firebird stores unquoted: all upper case, starting
 *  with a letter or underscore. */
const BARE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Quotes a table or column name for interpolation into SQL.
 *
 * Firebird folds unquoted identifiers to upper case and stores them
 * that way, so an already-upper name is left bare — quoting it would
 * work but would make every generated statement noisier than the SQL a
 * user writes by hand. Anything else is quoted, because a lower-case or
 * mixed-case name only resolves when quoted.
 *
 * Embedded double quotes are doubled, which is what closes the
 * injection: a table literally named `a" FROM x --` cannot end its own
 * quoted string.
 */
export function quoteIdentifier(name: string): string {
  return BARE.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

/**
 * Reads a row count out of the single cell a `COUNT(*)` returns.
 *
 * Integers cross the wire as exact decimal *text* so a BIGINT survives
 * the JSON hop — that is the whole point of the exact-integer work — so
 * this cannot simply read `cell.value` as a number. A row count is
 * bounded by what the UI can page through, so narrowing it here is safe
 * in a way it would not be for user data.
 *
 * @throws When the cell is missing or carries something a count cannot
 * be read from. Named in the message, because this runs behind a button
 * and the user needs to know which of their tables answered oddly.
 */
export function countFromCell(cell: ColumnValue | undefined): number {
  if (!cell) throw new Error('COUNT(*) returned an empty row.');
  if (cell.type === 'integer') {
    const parsed = Number(cell.value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`COUNT(*) returned an unparseable value: ${cell.value}.`);
    }
    return parsed;
  }
  if (cell.type === 'float' && typeof cell.value === 'number') {
    return cell.value;
  }
  throw new Error(`COUNT(*) returned an unexpected cell type: ${cell.type}.`);
}
