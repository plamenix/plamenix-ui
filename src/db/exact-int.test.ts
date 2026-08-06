import { describe, expect, it } from 'vitest';
import { compareExactInt, formatExactInt, isExactInt, parseExactInt } from './exact-int.js';

/** Firebird's BIGINT bounds, and the first integer JS cannot represent. */
const FB_MAX_BIGINT = '9223372036854775807';
const FB_MIN_BIGINT = '-9223372036854775808';
const FIRST_INEXACT_IN_JS = '9007199254740993';

describe('formatExactInt', () => {
  it('keeps every digit of a value past 2^53', () => {
    // Number(FB_MAX_BIGINT) would render 9,223,372,036,854,776,000.
    expect(formatExactInt(FB_MAX_BIGINT, 'en-US')).toBe('9,223,372,036,854,775,807');
    expect(formatExactInt(FIRST_INEXACT_IN_JS, 'en-US')).toBe('9,007,199,254,740,993');
  });

  it('handles negatives and zero', () => {
    expect(formatExactInt(FB_MIN_BIGINT, 'en-US')).toBe('-9,223,372,036,854,775,808');
    expect(formatExactInt('0', 'en-US')).toBe('0');
  });

  it('passes malformed input through rather than throwing in a cell', () => {
    expect(formatExactInt('not a number')).toBe('not a number');
    expect(formatExactInt('')).toBe('');
  });
});

describe('compareExactInt', () => {
  it('orders numerically, not lexically', () => {
    expect(compareExactInt('9', '10')).toBeLessThan(0);
    expect(compareExactInt('-5', '3')).toBeLessThan(0);
    expect(compareExactInt('100', '100')).toBe(0);
  });

  it('distinguishes values that collide once through a JS number', () => {
    // Both of these become 9007199254740992 if routed through Number.
    expect(compareExactInt('9007199254740992', FIRST_INEXACT_IN_JS)).toBeLessThan(0);
  });

  it('sorts a column the way a user expects', () => {
    const sorted = ['10', '9', '-1', FB_MAX_BIGINT, '0'].sort(compareExactInt);
    expect(sorted).toEqual(['-1', '0', '9', '10', FB_MAX_BIGINT]);
  });

  it('sinks unparseable values to the end instead of scrambling the column', () => {
    const sorted = ['10', 'oops', '2'].sort(compareExactInt);
    expect(sorted).toEqual(['2', '10', 'oops']);
  });
});

describe('parseExactInt', () => {
  it('normalises accepted input', () => {
    expect(parseExactInt(' 42 ')).toBe('42');
    expect(parseExactInt('+7')).toBe('7');
    expect(parseExactInt('007')).toBe('7');
    expect(parseExactInt(FB_MAX_BIGINT)).toBe(FB_MAX_BIGINT);
  });

  it('rejects anything Firebird would reject', () => {
    expect(parseExactInt('9223372036854775808')).toBeNull(); // one past INT64_MAX
    expect(parseExactInt('-9223372036854775809')).toBeNull();
    expect(parseExactInt('1.5')).toBeNull();
    expect(parseExactInt('1e3')).toBeNull();
    expect(parseExactInt('1,000')).toBeNull();
    expect(parseExactInt('')).toBeNull();
  });

  it('accepts the full range the old Number.isSafeInteger gate refused', () => {
    expect(isExactInt(FIRST_INEXACT_IN_JS)).toBe(true);
    expect(isExactInt(FB_MIN_BIGINT)).toBe(true);
  });
});
