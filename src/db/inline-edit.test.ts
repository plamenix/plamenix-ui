import { describe, expect, it } from 'vitest';
import {
  buildAllRowsDeleteSql,
  buildAllRowsUpdateSql,
  buildBulkDeleteSql,
  buildBulkUpdateSql,
  buildPrimaryKeyWhere,
  isFixedPointType,
  isFloatType,
  isIntegerType,
  parseEditedValue,
} from './inline-edit.js';
import type { ColumnInfo } from './types.js';

/**
 * Covers the write-back path: whatever `parseEditedValue` returns
 * becomes the literal in an emitted UPDATE, so a value rounded here is
 * a value silently rewritten in the user's table.
 */
function column(sqlType: string, nullable = true): ColumnInfo {
  return { name: 'VAL', sqlType, nullable, defaultSource: null } as ColumnInfo;
}

describe('exact integer columns', () => {
  it('keeps a BIGINT past 2^53 intact', () => {
    const result = parseEditedValue('9223372036854775807', column('BIGINT'));
    expect(result).toMatchObject({
      ok: true,
      value: { type: 'integer', value: '9223372036854775807' },
      literal: '9223372036854775807',
    });
  });

  it('rejects a value Firebird could not store', () => {
    const result = parseEditedValue('9223372036854775808', column('BIGINT'));
    expect(result.ok).toBe(false);
  });

  it('rejects a fractional draft', () => {
    expect(parseEditedValue('1.5', column('INTEGER')).ok).toBe(false);
  });
});

describe('exact fixed-point columns', () => {
  it('keeps every digit of a NUMERIC(18,4)', () => {
    const result = parseEditedValue('99999999999999.9999', column('NUMERIC(18,4)'));
    expect(result).toMatchObject({
      ok: true,
      value: { type: 'decimal', value: '99999999999999.9999' },
      literal: '99999999999999.9999',
    });
  });

  it('emits a bare literal so Firebird parses it as a number', () => {
    const result = parseEditedValue('12.34', column('DECIMAL(10,2)'));
    expect(result).toMatchObject({ ok: true, literal: '12.34' });
  });

  it('keeps the sign on sub-unit negatives', () => {
    expect(parseEditedValue('-0.0005', column('NUMERIC(18,4)'))).toMatchObject({
      ok: true,
      value: { type: 'decimal', value: '-0.0005' },
    });
  });

  it('rejects exponent form, which a scaled integer cannot represent', () => {
    expect(parseEditedValue('1e3', column('NUMERIC(18,4)')).ok).toBe(false);
  });
});

describe('genuine floats still round-trip as numbers', () => {
  it('DOUBLE PRECISION stays a float cell', () => {
    expect(parseEditedValue('3.14', column('DOUBLE PRECISION'))).toMatchObject({
      ok: true,
      value: { type: 'float', value: 3.14 },
    });
  });

  it('accepts exponent form, which IEEE-754 does represent', () => {
    expect(parseEditedValue('1e3', column('DOUBLE PRECISION')).ok).toBe(true);
  });
});

describe('type predicates', () => {
  it('separates exact fixed-point from approximate float', () => {
    expect(isFixedPointType('NUMERIC(18,4)')).toBe(true);
    expect(isFixedPointType('DECIMAL(10,2)')).toBe(true);
    expect(isFixedPointType('DOUBLE PRECISION')).toBe(false);
    // Unscaled NUMERIC is an integer type in Firebird.
    expect(isFixedPointType('NUMERIC')).toBe(false);
    expect(isIntegerType('BIGINT')).toBe(true);
  });

  it('isFloatType still matches fixed-point for callers that only ask about fractions', () => {
    expect(isFloatType('NUMERIC(18,4)')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bulk statements — the multi-row destructive paths.
//
// These had no tests at all. The eleven above cover single-cell edits,
// which touch one row identified by its full primary key; everything
// below rewrites or deletes an arbitrary number of rows at once, and
// two of the builders will happily emit a statement with no WHERE
// clause when asked to.
//
// The invariant worth holding onto is narrow: a statement built from a
// *selection* must be bounded by that selection. Only the explicit
// all-rows builders may be unbounded, and only when a caller passed no
// predicate.
// ---------------------------------------------------------------------------

describe('buildPrimaryKeyWhere', () => {
  it('uses IN for a single-column key', () => {
    expect(
      buildPrimaryKeyWhere({
        pkColumns: ['ID'],
        rows: [{ literals: ['1'] }, { literals: ['2'] }, { literals: ['3'] }],
      }),
    ).toBe('ID IN (1, 2, 3)');
  });

  it('expands a composite key to OR-of-AND', () => {
    // Firebird does not accept row-value IN syntax, which is why this
    // shape exists at all.
    expect(
      buildPrimaryKeyWhere({
        pkColumns: ['ORG_ID', 'USER_ID'],
        rows: [{ literals: ['1', '10'] }, { literals: ['2', '20'] }],
      }),
    ).toBe('(ORG_ID = 1 AND USER_ID = 10) OR (ORG_ID = 2 AND USER_ID = 20)');
  });

  it('refuses to build a predicate from no rows', () => {
    // Without this the caller would get an empty WHERE body and, once
    // concatenated, a DELETE that matches the whole table.
    expect(() => buildPrimaryKeyWhere({ pkColumns: ['ID'], rows: [] })).toThrow();
  });

  it('refuses to build a predicate from no key columns', () => {
    // A table with no primary key cannot have its rows identified, and
    // the composite branch would otherwise emit `() OR ()` — invalid
    // SQL that fails at the server with a message about syntax rather
    // than about the missing key.
    expect(() =>
      buildPrimaryKeyWhere({ pkColumns: [], rows: [{ literals: [] }] }),
    ).toThrow();
  });

  it('quotes identifiers that are not plain uppercase', () => {
    // Firebird folds unquoted identifiers to upper case, so a
    // lower-case or mixed-case column has to be quoted or it names a
    // different column than the user sees.
    expect(
      buildPrimaryKeyWhere({ pkColumns: ['user_id'], rows: [{ literals: ['1'] }] }),
    ).toBe('"user_id" IN (1)');
  });

  it('escapes a double quote inside an identifier', () => {
    expect(
      buildPrimaryKeyWhere({ pkColumns: ['we"ird'], rows: [{ literals: ['1'] }] }),
    ).toBe('"we""ird" IN (1)');
  });
});

describe('buildBulkDeleteSql', () => {
  it('bounds the delete by the selected keys', () => {
    expect(
      buildBulkDeleteSql({
        table: 'CUSTOMERS',
        pkColumns: ['ID'],
        rows: [{ literals: ['7'] }, { literals: ['9'] }],
      }),
    ).toBe('DELETE FROM CUSTOMERS WHERE ID IN (7, 9)');
  });

  it('never emits an unbounded delete', () => {
    // The invariant. A selection-scoped delete that lost its WHERE
    // would empty the table, and the confirm prompt the user saw would
    // have named a row count rather than the whole table.
    const sql = buildBulkDeleteSql({
      table: 'CUSTOMERS',
      pkColumns: ['ORG_ID', 'USER_ID'],
      rows: [{ literals: ['1', '10'] }],
    });
    expect(sql).toMatch(/\bWHERE\b/);
    expect(sql).not.toBe('DELETE FROM CUSTOMERS');
  });

  it('propagates the no-rows refusal instead of deleting everything', () => {
    expect(() =>
      buildBulkDeleteSql({ table: 'CUSTOMERS', pkColumns: ['ID'], rows: [] }),
    ).toThrow();
  });
});

describe('buildBulkUpdateSql', () => {
  it('applies one literal to every selected row', () => {
    expect(
      buildBulkUpdateSql({
        table: 'CUSTOMERS',
        columnName: 'STATUS',
        newLiteral: "'archived'",
        pkColumns: ['ID'],
        rows: [{ literals: ['7'] }, { literals: ['9'] }],
      }),
    ).toBe("UPDATE CUSTOMERS SET STATUS = 'archived' WHERE ID IN (7, 9)");
  });

  it('never emits an unbounded update', () => {
    const sql = buildBulkUpdateSql({
      table: 'CUSTOMERS',
      columnName: 'STATUS',
      newLiteral: 'NULL',
      pkColumns: ['ID'],
      rows: [{ literals: ['1'] }],
    });
    expect(sql).toMatch(/\bWHERE\b/);
  });

  it('quotes the target column', () => {
    expect(
      buildBulkUpdateSql({
        table: 'my_table',
        columnName: 'my_col',
        newLiteral: '1',
        pkColumns: ['ID'],
        rows: [{ literals: ['1'] }],
      }),
    ).toBe('UPDATE "my_table" SET "my_col" = 1 WHERE ID IN (1)');
  });

  it('propagates the no-rows refusal', () => {
    expect(() =>
      buildBulkUpdateSql({
        table: 'CUSTOMERS',
        columnName: 'STATUS',
        newLiteral: 'NULL',
        pkColumns: ['ID'],
        rows: [],
      }),
    ).toThrow();
  });
});

describe('all-rows builders', () => {
  it('emits an unbounded delete only when no predicate was given', () => {
    // Deliberately unbounded, and the only builder here that is. The
    // call site pairs it with a confirm naming the scope; this test
    // exists so the shape is stated rather than discovered.
    expect(buildAllRowsDeleteSql({ table: 'CUSTOMERS', predicate: null })).toBe(
      'DELETE FROM CUSTOMERS',
    );
  });

  it('bounds the delete when the active filter supplies a predicate', () => {
    expect(
      buildAllRowsDeleteSql({ table: 'CUSTOMERS', predicate: "STATUS = 'stale'" }),
    ).toBe("DELETE FROM CUSTOMERS WHERE STATUS = 'stale'");
  });

  it('emits an unbounded update only when no predicate was given', () => {
    expect(
      buildAllRowsUpdateSql({
        table: 'CUSTOMERS',
        columnName: 'STATUS',
        newLiteral: 'NULL',
        predicate: null,
      }),
    ).toBe('UPDATE CUSTOMERS SET STATUS = NULL');
  });

  it('bounds the update when a predicate is given', () => {
    expect(
      buildAllRowsUpdateSql({
        table: 'CUSTOMERS',
        columnName: 'STATUS',
        newLiteral: 'NULL',
        predicate: 'ID > 100',
      }),
    ).toBe('UPDATE CUSTOMERS SET STATUS = NULL WHERE ID > 100');
  });
});
