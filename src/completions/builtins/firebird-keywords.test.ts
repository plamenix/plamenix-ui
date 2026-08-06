import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompletionContext } from '@codemirror/autocomplete';
import {
  firebirdKeywordsComplete,
  registerBuiltinFirebirdKeywordsCompletion,
  unregisterBuiltinFirebirdKeywordsCompletion,
} from './firebird-keywords.js';
import { firebirdGlobalCompletions } from '../../db/firebird-dialect.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';
import type { CompletionProviderContext } from '../completion-provider-contract.js';

const FAKE_CTX: CompletionProviderContext = {
  cm: {} as CompletionContext,
  word: { from: 0, to: 0, text: '' },
  explicit: false,
};

describe('firebirdKeywordsComplete (I5.12)', () => {
  it('returns the full canonical Firebird completion list', () => {
    expect(firebirdKeywordsComplete(FAKE_CTX)).toBe(firebirdGlobalCompletions);
  });
});

describe('registerBuiltinFirebirdKeywordsCompletion (I5.12)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinFirebirdKeywordsCompletion();
    registry.__reset();
  });

  it('registers under the built-in namespace at priority 200 targeting the sql scope', () => {
    registerBuiltinFirebirdKeywordsCompletion();
    const contributions = registry.getContributions('completion_providers');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe(
      '@plamenix-builtin/completion-firebird-keywords',
    );
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('firebird-keywords');
    expect(contributions[0]?.contribution.priority).toBe(200);
    expect((contributions[0]?.contribution.payload as { scope: string }).scope).toBe('sql');
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinFirebirdKeywordsCompletion();
    teardown();
    expect(registry.getContributions('completion_providers')).toHaveLength(0);
    expect(() => registerBuiltinFirebirdKeywordsCompletion()).not.toThrow();
    expect(registry.getContributions('completion_providers')).toHaveLength(1);
  });
});
