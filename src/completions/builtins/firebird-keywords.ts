/**
 * Built-in Firebird keyword / builtin / type completions (I5.12) —
 * extracts the legacy `firebirdGlobalCompletions` static list (~200
 * entries: SELECT / FROM / WHERE / CAST / COALESCE / VARCHAR /
 * INTEGER / DATE / etc.) into a `completion_providers` contribution
 * registered under `@plamenix-builtin/completion-firebird-keywords`.
 *
 * The provider fires for the `sql` scope (every Firebird-dialect
 * editor today). Returns the full list every time — CodeMirror does
 * the prefix filtering against the matched word via its standard
 * scoring algorithm.
 *
 * Priority 200 → third-party completion providers at the default
 * priority 100 emit their options before the built-in, and the
 * de-dupe pass in `runApplicableCompletionProviders` keeps the
 * earliest-emitting provider's option when two providers ship the
 * same label. Community plugins overriding `SELECT` with a smarter
 * snippet variant win without unregistering the built-in.
 */

import type { Completion } from '@codemirror/autocomplete';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import { firebirdGlobalCompletions } from '../../db/firebird-dialect.js';
import type {
  CompletionProviderContributionPayload,
  CompletionProviderContext,
} from '../completion-provider-contract.js';

const BUILTIN_NAME = 'completion-firebird-keywords';

/** Pure callback for the provider — exposed for unit-testing without
 *  going through the registry. */
export function firebirdKeywordsComplete(
  _ctx: CompletionProviderContext,
): readonly Completion[] {
  return firebirdGlobalCompletions;
}

const payload: CompletionProviderContributionPayload = {
  scope: 'sql',
  complete: firebirdKeywordsComplete,
};

/** Registers the built-in Firebird keyword/builtin/type completions.
 *  Returns a teardown closure for `useEffect` pairing. */
export function registerBuiltinFirebirdKeywordsCompletion(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    completion_providers: [
      {
        id: 'firebird-keywords',
        priority: 200,
        payload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinFirebirdKeywordsCompletion(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
