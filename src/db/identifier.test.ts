/**
 * Quoting a table name into SQL, and reading a count back.
 *
 * The quoting rule is what stands between a table name and the
 * statement it is interpolated into, and it was inline in both shells
 * with no test in either.
 */

import { describe, expect, it } from 'vitest';
import { countFromCell, quoteIdentifier } from './identifier.js';
import type { ColumnValue } from './types.js';

describe('quoteIdentifier', () => {
  it('leaves an already-upper name bare', () => {
    // Firebird folds unquoted identifiers to upper case, so this is the
    // form a user would type by hand.
    expect(quoteIdentifier('CUSTOMERS')).toBe('CUSTOMERS');
    expect(quoteIdentifier('ORDER_ITEMS_2')).toBe('ORDER_ITEMS_2');
    expect(quoteIdentifier('_INTERNAL')).toBe('_INTERNAL');
  });

  it('quotes anything that would not resolve unquoted', () => {
    // A lower or mixed-case name only resolves when quoted; left bare
    // it would be folded and the table would appear not to exist.
    expect(quoteIdentifier('customers')).toBe('"customers"');
    expect(quoteIdentifier('Customers')).toBe('"Customers"');
    expect(quoteIdentifier('my table')).toBe('"my table"');
  });

  it('quotes a name starting with a digit', () => {
    expect(quoteIdentifier('2024_SALES')).toBe('"2024_SALES"');
  });

  it('doubles embedded quotes, so a name cannot end its own string', () => {
    // The injection this closes. Without doubling, a table named
    // `a" FROM x --` would terminate the quoted identifier and the rest
    // would be parsed as SQL.
    expect(quoteIdentifier('a" FROM x --')).toBe('"a"" FROM x --"');
  });

  it('produces something that survives being interpolated', () => {
    const hostile = 'x"; DROP TABLE CUSTOMERS; --';
    const sql = `SELECT COUNT(*) FROM ${quoteIdentifier(hostile)}`;
    // One quoted identifier, and the payload never escapes it: every
    // inner quote is doubled, so the only unescaped quotes are the
    // delimiters.
    expect(sql).toBe('SELECT COUNT(*) FROM "x""; DROP TABLE CUSTOMERS; --"');
    expect(sql.replace(/""/g, '').match(/"/g)).toHaveLength(2);
  });

  it('quotes an empty name rather than emitting nothing', () => {
    // `SELECT COUNT(*) FROM ` is a syntax error the server reports;
    // an unquoted empty name would be a confusing one.
    expect(quoteIdentifier('')).toBe('""');
  });
});

function cell(type: string, value: unknown): ColumnValue {
  return { type, value } as unknown as ColumnValue;
}

describe('countFromCell', () => {
  it('reads an integer that arrived as exact text', () => {
    // Integers cross the wire as decimal text so a BIGINT survives the
    // JSON hop; reading `value` as a number directly would be wrong.
    expect(countFromCell(cell('integer', '42'))).toBe(42);
  });

  it('reads a count past 2^53 as the nearest double', () => {
    // Deliberate and safe here in a way it is not for user data: a row
    // count is bounded by what the UI can page through. Recording the
    // narrowing so nobody re-derives whether it is a bug.
    expect(countFromCell(cell('integer', '9007199254740993'))).toBeCloseTo(9007199254740992, 0);
  });

  it('accepts a float count', () => {
    expect(countFromCell(cell('float', 7))).toBe(7);
  });

  it('reports an empty result rather than returning zero', () => {
    // Zero rows and no answer are different facts, and a silent zero
    // would show an empty table as genuinely empty.
    expect(() => countFromCell(undefined)).toThrow(/empty row/);
  });

  it('reports an unparseable value with the value in the message', () => {
    expect(() => countFromCell(cell('integer', 'not-a-number'))).toThrow(/not-a-number/);
  });

  it('reports an unexpected cell type by name', () => {
    expect(() => countFromCell(cell('text', 'CUSTOMERS'))).toThrow(/unexpected cell type: text/);
  });

  it('refuses a float cell whose value is not a number', () => {
    expect(() => countFromCell(cell('float', '7'))).toThrow(/unexpected cell type/);
  });
});
