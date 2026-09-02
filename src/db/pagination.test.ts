import { describe, expect, it } from 'vitest';
import { wrapWithSortAndLimit } from './pagination.js';

describe('wrapWithSortAndLimit', () => {
  it('returns sql verbatim when no sort + no pagination', () => {
    expect(wrapWithSortAndLimit('SELECT * FROM T', null, null)).toBe('SELECT * FROM T');
  });

  it('inlines ORDER BY into a simple SELECT', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT * FROM EMPLOYEE_PROJECT',
        { columnName: 'ROLE_NAME', direction: 'ASC' },
        null,
      ),
    ).toBe('SELECT * FROM EMPLOYEE_PROJECT ORDER BY "ROLE_NAME" ASC');
  });

  it('inlines pagination into a simple SELECT', () => {
    expect(
      wrapWithSortAndLimit('SELECT * FROM T', null, { offset: 0, limit: 50 }),
    ).toBe('SELECT * FROM T ROWS 1 TO 50');
  });

  it('combines ORDER BY + pagination for a simple SELECT', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT * FROM T',
        { columnName: 'ID', direction: 'DESC' },
        { offset: 50, limit: 25 },
      ),
    ).toBe('SELECT * FROM T ORDER BY "ID" DESC ROWS 51 TO 75');
  });

  it('strips a trailing user-supplied ORDER BY before adding the new one', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT * FROM T ORDER BY "X" DESC',
        { columnName: 'Y', direction: 'ASC' },
        null,
      ),
    ).toBe('SELECT * FROM T ORDER BY "Y" ASC');
  });

  it('strips a trailing ROWS clause before adding the new one', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT * FROM T ROWS 1 TO 10',
        null,
        { offset: 0, limit: 50 },
      ),
    ).toBe('SELECT * FROM T ROWS 1 TO 50');
  });

  it('preserves an ORDER BY inside a subquery (not top-level)', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT * FROM T WHERE EXISTS (SELECT 1 FROM X ORDER BY "A")',
        { columnName: 'B', direction: 'ASC' },
        null,
      ),
    ).toBe('SELECT * FROM T WHERE EXISTS (SELECT 1 FROM X ORDER BY "A") ORDER BY "B" ASC');
  });

  it('wraps UNION queries in a subquery alias', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT A FROM X UNION SELECT A FROM Y',
        { columnName: 'A', direction: 'ASC' },
        null,
      ),
    ).toBe('SELECT * FROM (SELECT A FROM X UNION SELECT A FROM Y) AS t ORDER BY "A" ASC');
  });

  it('quotes identifiers with embedded quotes', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT * FROM T',
        { columnName: 'WEIRD"NAME', direction: 'ASC' },
        null,
      ),
    ).toBe('SELECT * FROM T ORDER BY "WEIRD""NAME" ASC');
  });

  it('strips trailing semicolons before rewriting', () => {
    expect(
      wrapWithSortAndLimit(
        'SELECT * FROM T;',
        { columnName: 'A', direction: 'ASC' },
        null,
      ),
    ).toBe('SELECT * FROM T ORDER BY "A" ASC');
  });
});
