import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lineColToOffset,
  pluginContributionsToDiagnosticProviders,
  runDiagnosticProviders,
  type DiagnosticProviderContributionPayload,
  type PlamenixDiagnostic,
} from './diagnostic-provider-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

function descriptors() {
  return pluginContributionsToDiagnosticProviders(
    registry.getContributions<DiagnosticProviderContributionPayload>('diagnostics_providers'),
  );
}

describe('pluginContributionsToDiagnosticProviders (I5.13)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.lint', {
      diagnostics_providers: [
        {
          id: 'missing-where',
          payload: { lint: () => [] } satisfies DiagnosticProviderContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.lint:missing-where');
    expect(d?.pluginId).toBe('com.example.lint');
  });

  it('respects registry priority order (lower wins; first in tooltip stack)', () => {
    registerContributions('com.example.late', {
      diagnostics_providers: [
        { id: 'late', priority: 300, payload: { lint: () => [] } },
      ],
    });
    registerContributions('com.example.early', {
      diagnostics_providers: [
        { id: 'early', priority: 50, payload: { lint: () => [] } },
      ],
    });
    expect(descriptors().map((d) => d.id)).toEqual([
      'com.example.early:early',
      'com.example.late:late',
    ]);
  });
});

describe('runDiagnosticProviders (I5.13)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('flattens output from every applicable provider', () => {
    registerContributions('com.example.a', {
      diagnostics_providers: [
        {
          id: 'a',
          payload: {
            lint: () => [
              { severity: 'error', line: 1, col: 1, message: 'A1' } as PlamenixDiagnostic,
              { severity: 'warning', line: 2, col: 1, message: 'A2' } as PlamenixDiagnostic,
            ],
          },
        },
      ],
    });
    registerContributions('com.example.b', {
      diagnostics_providers: [
        {
          id: 'b',
          payload: {
            lint: () => [
              { severity: 'info', line: 3, col: 1, message: 'B1' } as PlamenixDiagnostic,
            ],
          },
        },
      ],
    });
    const out = runDiagnosticProviders(descriptors(), 'foo');
    expect(out.map((d) => d.message).sort()).toEqual(['A1', 'A2', 'B1']);
  });

  it('catches throwing providers — they drop, others still emit', () => {
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = () => [
      { severity: 'warning', line: 1, col: 1, message: 'OK' } as PlamenixDiagnostic,
    ];
    registerContributions('com.example.t', {
      diagnostics_providers: [{ id: 't', payload: { lint: thrower } }],
    });
    registerContributions('com.example.o', {
      diagnostics_providers: [{ id: 'o', payload: { lint: ok } }],
    });
    const out = runDiagnosticProviders(descriptors(), 'foo');
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(out.map((d) => d.message)).toEqual(['OK']);
  });

  it('returns empty array when no providers registered', () => {
    expect(runDiagnosticProviders([], 'foo')).toEqual([]);
  });
});

describe('lineColToOffset (I5.13)', () => {
  it('returns 0 for line 1 col 1', () => {
    expect(lineColToOffset('SELECT 1', 1, 1)).toBe(0);
  });

  it('handles single-line offsets', () => {
    expect(lineColToOffset('SELECT 1', 1, 8)).toBe(7);
  });

  it('skips past newlines to reach later lines', () => {
    const sql = 'SELECT 1\nFROM t';
    expect(lineColToOffset(sql, 2, 1)).toBe(9); // F of FROM
    expect(lineColToOffset(sql, 2, 6)).toBe(14); // t of FROM t
  });

  it('clamps to document end for out-of-range positions', () => {
    expect(lineColToOffset('SELECT 1', 99, 1)).toBe(8);
    expect(lineColToOffset('SELECT 1', 1, 9999)).toBe(8);
  });

  it('returns 0 for line < 1', () => {
    expect(lineColToOffset('SELECT', 0, 1)).toBe(0);
  });
});
