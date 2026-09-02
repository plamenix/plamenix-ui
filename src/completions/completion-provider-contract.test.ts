import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Completion, CompletionContext } from '@codemirror/autocomplete';
import {
  pluginContributionsToCompletionProviders,
  runApplicableCompletionProviders,
  type CompletionProviderContext,
  type CompletionProviderContributionPayload,
} from './completion-provider-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

const FAKE_CTX: CompletionProviderContext = {
  cm: {} as CompletionContext,
  word: { from: 0, to: 3, text: 'foo' },
  explicit: false,
};

function descriptors() {
  return pluginContributionsToCompletionProviders(
    registry.getContributions<CompletionProviderContributionPayload>('completion_providers'),
  );
}

describe('pluginContributionsToCompletionProviders (I5.12)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.merge', {
      completion_providers: [
        {
          id: 'merge-syntax',
          payload: {
            scope: 'sql',
            complete: () => [],
          } satisfies CompletionProviderContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.merge:merge-syntax');
    expect(d?.pluginId).toBe('com.example.merge');
    expect(d?.scope).toBe('sql');
  });

  it('respects registry priority order (lower wins; emits first)', () => {
    registerContributions('com.example.late', {
      completion_providers: [
        {
          id: 'late',
          priority: 300,
          payload: { scope: 'sql', complete: () => [] },
        },
      ],
    });
    registerContributions('com.example.early', {
      completion_providers: [
        {
          id: 'early',
          priority: 50,
          payload: { scope: 'sql', complete: () => [] },
        },
      ],
    });
    expect(descriptors().map((d) => d.id)).toEqual([
      'com.example.early:early',
      'com.example.late:late',
    ]);
  });
});

describe('runApplicableCompletionProviders (I5.12)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('filters by scope — sql + all surface in sql, plsql drops', () => {
    registerContributions('com.example.scopes', {
      completion_providers: [
        {
          id: 'sql-only',
          payload: { scope: 'sql', complete: () => [{ label: 'A' } as Completion] },
        },
        {
          id: 'plsql-only',
          payload: { scope: 'plsql', complete: () => [{ label: 'B' } as Completion] },
        },
        {
          id: 'all',
          payload: { scope: 'all', complete: () => [{ label: 'C' } as Completion] },
        },
      ],
    });
    const out = runApplicableCompletionProviders(descriptors(), 'sql', FAKE_CTX);
    expect(out.map((c) => c.label).sort()).toEqual(['A', 'C']);
  });

  it('flattens contributions in registry priority order', () => {
    registerContributions('com.example.first', {
      completion_providers: [
        {
          id: 'first',
          priority: 50,
          payload: { scope: 'sql', complete: () => [{ label: 'F1' }, { label: 'F2' }] as Completion[] },
        },
      ],
    });
    registerContributions('com.example.second', {
      completion_providers: [
        {
          id: 'second',
          priority: 100,
          payload: { scope: 'sql', complete: () => [{ label: 'S1' }] as Completion[] },
        },
      ],
    });
    expect(runApplicableCompletionProviders(descriptors(), 'sql', FAKE_CTX).map((c) => c.label)).toEqual([
      'F1',
      'F2',
      'S1',
    ]);
  });

  it('de-dupes by label — first emitter wins', () => {
    registerContributions('com.example.first', {
      completion_providers: [
        {
          id: 'first',
          priority: 50,
          payload: {
            scope: 'sql',
            complete: () => [{ label: 'SELECT', detail: 'first' } as Completion],
          },
        },
      ],
    });
    registerContributions('com.example.second', {
      completion_providers: [
        {
          id: 'second',
          priority: 100,
          payload: {
            scope: 'sql',
            complete: () => [{ label: 'SELECT', detail: 'second' } as Completion],
          },
        },
      ],
    });
    const out = runApplicableCompletionProviders(descriptors(), 'sql', FAKE_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toBe('first');
  });

  it('catches throwing providers — they drop out, others still emit', () => {
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = () => [{ label: 'OK' } as Completion];
    registerContributions('com.example.thrower', {
      completion_providers: [
        { id: 't', priority: 50, payload: { scope: 'sql', complete: thrower } },
      ],
    });
    registerContributions('com.example.ok', {
      completion_providers: [
        { id: 'o', priority: 100, payload: { scope: 'sql', complete: ok } },
      ],
    });
    const out = runApplicableCompletionProviders(descriptors(), 'sql', FAKE_CTX);
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(out.map((c) => c.label)).toEqual(['OK']);
  });
});
