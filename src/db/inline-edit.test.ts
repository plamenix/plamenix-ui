import { describe, expect, it } from 'vitest';
import { isFixedPointType, isFloatType, isIntegerType, parseEditedValue } from './inline-edit.js';
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
