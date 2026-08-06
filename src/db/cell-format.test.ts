import { describe, expect, it } from 'vitest';
import {
  cellToCsv,
  cellToJson,
  cellToPlainText,
  cellToSqlLiteral,
  cellToXlsx,
} from './cell-format.js';
import type { ColumnValue } from './types.js';

/**
 * Every export path has to carry a Firebird BIGINT out intact. These
 * pin the guarantee at the point it is easiest to lose: a value past
 * 2^53, which any trip through a JavaScript number would round.
 */
const FB_MAX_BIGINT = '9223372036854775807';
const bigint: ColumnValue = { type: 'integer', value: FB_MAX_BIGINT };

describe('exact integers survive every export format', () => {
  it('csv keeps every digit', () => {
    expect(cellToCsv(bigint, ',')).toBe(FB_MAX_BIGINT);
  });

  it('copy-cell keeps every digit', () => {
    expect(cellToPlainText(bigint)).toBe(FB_MAX_BIGINT);
  });

  it('sql literal keeps every digit', () => {
    expect(cellToSqlLiteral(bigint)).toBe(FB_MAX_BIGINT);
  });

  it('json keeps every digit, as text', () => {
    // Quoted deliberately: JSON.parse would round an unquoted BIGINT in
    // any JavaScript consumer. Uniform typing beats a column whose type
    // changes with magnitude.
    expect(cellToJson(bigint)).toBe(FB_MAX_BIGINT);
    expect(JSON.parse(JSON.stringify(cellToJson(bigint)))).toBe(FB_MAX_BIGINT);
  });

  it('xlsx falls back to text past the safe-integer range', () => {
    // A spreadsheet number is a double, so beyond 2^53 text is the only
    // representation that does not corrupt the value.
    expect(cellToXlsx(bigint)).toEqual({ value: FB_MAX_BIGINT });
  });

  it('xlsx still emits a real number for ordinary values, so columns stay summable', () => {
    expect(cellToXlsx({ type: 'integer', value: '42' })).toEqual({ value: 42 });
    expect(cellToXlsx({ type: 'integer', value: '-7' })).toEqual({ value: -7 });
  });
});

describe('non-integer cells are unaffected', () => {
  it('floats stay numbers — they are approximate by definition', () => {
    expect(cellToJson({ type: 'float', value: 3.14 })).toBe(3.14);
    expect(cellToXlsx({ type: 'float', value: 3.14 })).toEqual({ value: 3.14 });
  });

  it('null, bool, and text project as before', () => {
    expect(cellToJson({ type: 'null' })).toBeNull();
    expect(cellToJson({ type: 'bool', value: true })).toBe(true);
    expect(cellToJson({ type: 'text', value: 'hi' })).toBe('hi');
    expect(cellToCsv({ type: 'bool', value: false }, ',')).toBe('false');
  });

  it('blobs summarise rather than embedding a body', () => {
    const blob: ColumnValue = {
      type: 'blob',
      value: { id: 'b1', sizeBytes: 9, peekHex: 'cafef00d' },
    };
    expect(String(cellToJson(blob))).toContain('9 bytes');
    expect(cellToSqlLiteral(blob)).toContain('NULL');
  });
});

describe('exact fixed-point values survive every export format', () => {
  // NUMERIC(18,4) money value whose scaled integer is past 2^53, so the
  // upstream driver's f64 path could not represent it.
  const money: ColumnValue = { type: 'decimal', value: '99999999999999.9999' };

  it('csv, copy-cell and xml keep every digit', () => {
    expect(cellToCsv(money, ',')).toBe('99999999999999.9999');
    expect(cellToPlainText(money)).toBe('99999999999999.9999');
  });

  it('sql literal stays a bare number so a re-import parses it as one', () => {
    expect(cellToSqlLiteral(money)).toBe('99999999999999.9999');
  });

  it('json keeps it as text for the same reason integers are text', () => {
    expect(cellToJson(money)).toBe('99999999999999.9999');
  });

  it('negative sub-unit values keep their sign', () => {
    expect(cellToCsv({ type: 'decimal', value: '-0.0005' }, ',')).toBe('-0.0005');
  });
});
