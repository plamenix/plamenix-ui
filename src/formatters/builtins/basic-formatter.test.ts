import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatSqlBasic,
  registerBuiltinBasicSqlFormatter,
  unregisterBuiltinBasicSqlFormatter,
} from './basic-formatter.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';

describe('formatSqlBasic (I5.6)', () => {
  it('upper-cases recognised keywords', () => {
    expect(formatSqlBasic('select id from customers where active = true')).toContain(
      'SELECT',
    );
    expect(formatSqlBasic('select id from customers where active = true')).toContain(
      'FROM',
    );
    expect(formatSqlBasic('select id from customers where active = true')).toContain(
      'WHERE',
    );
  });

  it('preserves identifier case inside double-quoted spans', () => {
    const out = formatSqlBasic('select "MixedCase" from "Quoted"');
    expect(out).toContain('"MixedCase"');
    expect(out).toContain('"Quoted"');
  });

  it('preserves string literals verbatim (single quotes with doubled inner)', () => {
    const out = formatSqlBasic("select 'O''Brien' from customers");
    expect(out).toContain("'O''Brien'");
  });

  it('preserves line comments verbatim', () => {
    const out = formatSqlBasic('select 1 -- inline note');
    expect(out).toContain('-- inline note');
  });

  it('preserves block comments verbatim', () => {
    const out = formatSqlBasic('/* block */ select 1');
    expect(out).toContain('/* block */');
  });

  it('breaks clauses onto new lines (SELECT / FROM / WHERE / ORDER BY)', () => {
    const out = formatSqlBasic(
      'select id, name from customers where active = true order by id',
    );
    expect(out).toContain('SELECT');
    // FROM / WHERE / ORDER BY each start their own line.
    const lines = out.split('\n');
    expect(lines.some((l) => l.startsWith('FROM'))).toBe(true);
    expect(lines.some((l) => l.startsWith('WHERE'))).toBe(true);
    expect(lines.some((l) => l.startsWith('ORDER BY'))).toBe(true);
  });

  it('returns input unchanged for empty / non-string input', () => {
    expect(formatSqlBasic('')).toBe('');
  });

  it('does not throw on malformed input — round-trips unchanged-ish', () => {
    // Unbalanced quote — tokeniser bails or returns best-effort,
    // but never throws.
    expect(() => formatSqlBasic("select 'broken")).not.toThrow();
  });
});

describe('registerBuiltinBasicSqlFormatter (I5.6)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinBasicSqlFormatter();
    registry.__reset();
  });

  it('registers one contribution under the built-in namespace at priority 200', () => {
    registerBuiltinBasicSqlFormatter();
    const contributions = registry.getContributions('sql_formatters');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/sql-formatter-basic');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('basic');
    expect(contributions[0]?.contribution.priority).toBe(200);
  });

  it('payload targets firebird dialect + label is "Basic (built-in)"', () => {
    registerBuiltinBasicSqlFormatter();
    const c = registry.getContributions('sql_formatters')[0];
    expect(c?.contribution.payload).toMatchObject({
      label: 'Basic (built-in)',
      dialect: 'firebird',
    });
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinBasicSqlFormatter();
    teardown();
    expect(registry.getContributions('sql_formatters')).toHaveLength(0);
    expect(() => registerBuiltinBasicSqlFormatter()).not.toThrow();
    expect(registry.getContributions('sql_formatters')).toHaveLength(1);
  });
});
