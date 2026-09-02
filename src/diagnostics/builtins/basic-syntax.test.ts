import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  basicSyntaxLint,
  registerBuiltinBasicSyntaxDiagnostic,
  unregisterBuiltinBasicSyntaxDiagnostic,
} from './basic-syntax.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';

describe('basicSyntaxLint (I5.13)', () => {
  it('returns empty array for balanced SQL', () => {
    expect(basicSyntaxLint('SELECT (1 + 2) FROM customers;')).toEqual([]);
  });

  it('detects unmatched opening paren', () => {
    const out = basicSyntaxLint('SELECT (1 + 2 FROM customers;');
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe('unbalanced-paren');
    expect(out[0]?.severity).toBe('error');
    expect(out[0]?.line).toBe(1);
    expect(out[0]?.col).toBe(8); // position of '('
  });

  it('detects unmatched closing paren', () => {
    const out = basicSyntaxLint('SELECT 1) FROM customers;');
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe('unbalanced-paren');
    expect(out[0]?.message).toContain("Unmatched ')'");
  });

  it('respects doubled single quotes (Firebird escape)', () => {
    // `'O''Brien'` is one valid string. No diagnostic.
    expect(basicSyntaxLint("SELECT 'O''Brien' FROM customers;")).toEqual([]);
  });

  it('detects unterminated string literal', () => {
    const out = basicSyntaxLint("SELECT 'broken FROM customers;");
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe('unterminated-string');
  });

  it('detects unterminated block comment', () => {
    const out = basicSyntaxLint('SELECT 1 /* never closed');
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe('unterminated-block-comment');
  });

  it('ignores parens inside string literals + comments', () => {
    expect(basicSyntaxLint("SELECT 'hi (paren in string)' FROM t;")).toEqual([]);
    expect(basicSyntaxLint('SELECT 1 -- comment with (paren)')).toEqual([]);
    expect(basicSyntaxLint('/* (paren in block) */ SELECT 1;')).toEqual([]);
  });

  it('tracks line + col across newlines', () => {
    const sql = 'SELECT 1\nFROM (\n  customers';
    const out = basicSyntaxLint(sql);
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe('unbalanced-paren');
    expect(out[0]?.line).toBe(2);
    expect(out[0]?.col).toBe(6); // position of '(' on line 2
  });

  it('returns empty for empty input + does not throw on malformed', () => {
    expect(basicSyntaxLint('')).toEqual([]);
    expect(() => basicSyntaxLint('a'.repeat(10000))).not.toThrow();
  });
});

describe('registerBuiltinBasicSyntaxDiagnostic (I5.13)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinBasicSyntaxDiagnostic();
    registry.__reset();
  });

  it('registers under the built-in namespace at priority 200', () => {
    registerBuiltinBasicSyntaxDiagnostic();
    const contributions = registry.getContributions('diagnostics_providers');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/diagnostic-basic-syntax');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('basic-syntax');
    expect(contributions[0]?.contribution.priority).toBe(200);
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinBasicSyntaxDiagnostic();
    teardown();
    expect(registry.getContributions('diagnostics_providers')).toHaveLength(0);
    expect(() => registerBuiltinBasicSyntaxDiagnostic()).not.toThrow();
    expect(registry.getContributions('diagnostics_providers')).toHaveLength(1);
  });
});
