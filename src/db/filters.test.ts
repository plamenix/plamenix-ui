import { describe, expect, it } from 'vitest';
import { buildFilterPredicate, type ColumnFilter } from './filters.js';
import type { ColumnInfo } from './types.js';

const TEXT: ColumnInfo = {
  name: 'NAME',
  sqlType: 'VARCHAR',
  nullable: true,
  defaultSource: null,
  position: 0,
  size: 64,
  precision: null,
  scale: null,
  charset: 'UTF8',
};

const NUM: ColumnInfo = {
  ...TEXT,
  name: 'AGE',
  sqlType: 'INTEGER',
  size: null,
};

function info(...cols: ColumnInfo[]): Map<string, ColumnInfo> {
  return new Map(cols.map((c) => [c.name, c]));
}

describe('buildFilterPredicate — Firebird operators', () => {
  it('CONTAINING quotes value as string', () => {
    const filters: ColumnFilter[] = [{ columnName: 'NAME', operator: 'CONTAINING', value: 'alex' }];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(`"NAME" CONTAINING 'alex'`);
  });

  it('STARTING WITH renders as prefix predicate', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'STARTING WITH', value: 'Mr.' },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(`"NAME" STARTING WITH 'Mr.'`);
  });

  it('NOT CONTAINING / NOT STARTING WITH negated forms render', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'NOT CONTAINING', value: 'admin' },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(`"NAME" NOT CONTAINING 'admin'`);
  });

  it('SIMILAR TO accepts the regex string as-is', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'SIMILAR TO', value: '[A-Z][a-z]+' },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(
      `"NAME" SIMILAR TO '[A-Z][a-z]+'`,
    );
  });

  it('BETWEEN expects two comma-separated values; numeric column inlines numbers', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'AGE', operator: 'BETWEEN', value: '18,65' },
    ];
    expect(buildFilterPredicate(filters, info(NUM))).toBe(`"AGE" BETWEEN 18 AND 65`);
  });

  it('BETWEEN with text column quotes both sides', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'BETWEEN', value: 'A,M' },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(`"NAME" BETWEEN 'A' AND 'M'`);
  });

  it('BETWEEN with single value is dropped', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'AGE', operator: 'BETWEEN', value: '18' },
    ];
    expect(buildFilterPredicate(filters, info(NUM))).toBeNull();
  });

  it('IN comma-separates numeric values', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'AGE', operator: 'IN', value: '20,30,40' },
    ];
    expect(buildFilterPredicate(filters, info(NUM))).toBe(`"AGE" IN (20, 30, 40)`);
  });

  it('IN quotes text values', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'IN', value: 'Alice,Bob,Carol' },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(
      `"NAME" IN ('Alice', 'Bob', 'Carol')`,
    );
  });

  it('IN with empty list returns null (no clause)', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'IN', value: '' },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBeNull();
  });

  it('NOT IN negated form renders', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'AGE', operator: 'NOT IN', value: '0,1,2' },
    ];
    expect(buildFilterPredicate(filters, info(NUM))).toBe(`"AGE" NOT IN (0, 1, 2)`);
  });

  it('NOT BETWEEN renders both sides', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'AGE', operator: 'NOT BETWEEN', value: '0,100' },
    ];
    expect(buildFilterPredicate(filters, info(NUM))).toBe(`"AGE" NOT BETWEEN 0 AND 100`);
  });

  it('IS NULL emits no value', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'IS NULL', value: '' },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(`"NAME" IS NULL`);
  });

  it('escapes single quotes in IN list entries', () => {
    const filters: ColumnFilter[] = [
      { columnName: 'NAME', operator: 'IN', value: "O'Brien,Smith" },
    ];
    expect(buildFilterPredicate(filters, info(TEXT))).toBe(
      `"NAME" IN ('O''Brien', 'Smith')`,
    );
  });
});
