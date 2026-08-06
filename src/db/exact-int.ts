/**
 * Helpers for Firebird 64-bit integers, which cross the wire as decimal
 * text rather than JSON numbers.
 *
 * A `BIGINT` column, a generator, and a `MON$` counter all span the full
 * signed 64-bit range, while a JavaScript number is exact only to 2^53.
 * Firebird's maximum `BIGINT` read through a JSON number comes back as
 * `9223372036854776000`, and `9007199254740993` silently loses its last
 * digit. The Rust side declares these `#[specta(type = String)]`; these
 * helpers are how the UI formats, orders, and validates them without
 * routing the value through `Number`.
 */

/** Decimal integer, optionally signed, with no separators or exponent. */
const EXACT_INT = /^[+-]?\d+$/;

/**
 * Formats an exact integer for display, with locale digit grouping.
 *
 * Falls back to the raw text when the value does not parse, so an
 * unexpected payload renders as-is instead of throwing inside a cell.
 *
 * @param value Decimal integer text as received from the host.
 * @param locales Passed through to `BigInt.prototype.toLocaleString`.
 */
export function formatExactInt(value: string, locales?: string | string[]): string {
  const parsed = toBigInt(value);
  return parsed === null ? value : parsed.toLocaleString(locales);
}

/**
 * Orders two exact integers by numeric value.
 *
 * Comparing the strings directly would order them lexically, putting
 * `"10"` before `"9"` and mis-sorting every negative value. Unparseable
 * input sorts after everything that parses, so a malformed cell sinks to
 * the end rather than scrambling the column.
 *
 * @returns Negative when `a` precedes `b`, positive when it follows, `0`
 *   when they are numerically equal.
 */
export function compareExactInt(a: string, b: string): number {
  const left = toBigInt(a);
  const right = toBigInt(b);
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Validates user input as a 64-bit integer and normalises it.
 *
 * Rejects anything outside the signed 64-bit range, which is what
 * Firebird itself would refuse. Returns canonical text — a leading `+`
 * and redundant zeros are dropped — so equality checks against a value
 * from the host compare like with like.
 *
 * @returns The normalised decimal text, or `null` when the input is not
 *   a 64-bit integer.
 */
export function parseExactInt(input: string): string | null {
  const trimmed = input.trim();
  if (!EXACT_INT.test(trimmed)) return null;
  const parsed = BigInt(trimmed);
  if (parsed < INT64_MIN || parsed > INT64_MAX) return null;
  return parsed.toString();
}

/** True when the text is a well-formed 64-bit integer. */
export function isExactInt(value: string): boolean {
  return parseExactInt(value) !== null;
}

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

function toBigInt(value: string): bigint | null {
  const trimmed = value.trim();
  if (!EXACT_INT.test(trimmed)) return null;
  return BigInt(trimmed);
}
