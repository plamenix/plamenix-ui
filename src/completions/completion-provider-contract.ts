/**
 * Completion-provider contribution contract (I5.12).
 *
 * Plugins contribute CodeMirror autocomplete options through the
 * `completion_providers` extension point. The shell's `SqlEditor`
 * merges every applicable provider's output into the single
 * `autocompletion({override})` callback CodeMirror consumes.
 *
 * Built-in `@plamenix-builtin/completion-firebird-keywords` extracts
 * the existing `firebirdGlobalCompletions` (Firebird keywords +
 * builtins + types) as a provider. Third-party plugins add dialect-
 * specific extensions (Firebird 5+ `MERGE` syntax, custom UDF
 * libraries, ORM-generated table-name lists like Prisma / TypeORM
 * model names, OData-style functions, etc.) without forking the
 * editor.
 *
 * **Scope discriminator**:
 *   - `'sql'` — surfaces in plain SQL editors (the default for the
 *     SqlEditor today). All Firebird-dialect editors match.
 *   - `'plsql'` — surfaces in PL/SQL (procedure / trigger body)
 *     editors. Reserved for a future PSQL-specific editor surface;
 *     until then no consumer reads it.
 *   - `'all'` — surfaces everywhere.
 *
 * The `complete` callback receives a `CompletionProviderContext`
 * derived from CodeMirror's `CompletionContext`: it carries the
 * matched word range + `explicit` flag so providers can decide
 * whether to fire on bare cursor presses. Providers return a flat
 * `Completion[]`; the host wraps them into the `CompletionResult`
 * shape CodeMirror's override expects.
 */

import type { Completion, CompletionContext } from '@codemirror/autocomplete';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Editor surface the provider targets. */
export type CompletionScope = 'sql' | 'plsql' | 'all';

/** Context handed to each provider's `complete` callback. The CodeMirror
 *  `CompletionContext` is exposed verbatim so providers have access to
 *  the full editor state (matchBefore / explicit / pos / state). */
export interface CompletionProviderContext {
  /** Raw CodeMirror context — providers needing low-level access
   *  (`ctx.state.doc.lineAt(...)`, etc.) read from here. */
  cm: CompletionContext;
  /** Word the cursor is currently inside, or `null` when no token
   *  matches the `/\w+/` regex at the cursor position. Convenience
   *  shortcut over `cm.matchBefore(/\w+/)`. */
  word: { from: number; to: number; text: string } | null;
  /** Whether the user explicitly invoked completion (Ctrl-Space).
   *  Mirrors `cm.explicit`. Providers that only want to surface on
   *  explicit invocation gate on this. */
  explicit: boolean;
}

export interface CompletionProviderContributionPayload {
  scope: CompletionScope;
  /** Returns the list of completions to add at the current cursor
   *  position. Empty array signals "no completions"; the host filters
   *  empty arrays before merging. */
  complete: (ctx: CompletionProviderContext) => readonly Completion[];
}

/** Resolved descriptor ready for the editor's complete callback. */
export interface CompletionProviderDescriptor {
  id: string;
  pluginId: string;
  scope: CompletionScope;
  complete: (ctx: CompletionProviderContext) => readonly Completion[];
}

/** Maps registry contributions into descriptors in registry priority
 *  order. Providers with higher priority (lower number) emit their
 *  completions first — CodeMirror then de-dupes by label, so a
 *  high-priority provider's option wins when two providers emit the
 *  same label. */
export function pluginContributionsToCompletionProviders(
  contributions: ReadonlyArray<PluginContribution<CompletionProviderContributionPayload>>,
): CompletionProviderDescriptor[] {
  return contributions.map(({ pluginId, contribution }) => ({
    id: `${pluginId}:${contribution.id}`,
    pluginId,
    scope: contribution.payload.scope,
    complete: contribution.payload.complete,
  }));
}

/** Runs the registered providers applicable to a given scope, flattens
 *  their output, and returns deduped completions in original registry
 *  order. De-dupe key is `label` (CodeMirror's render key) — first
 *  provider wins for a given label. */
export function runApplicableCompletionProviders(
  descriptors: ReadonlyArray<CompletionProviderDescriptor>,
  scope: CompletionScope,
  ctx: CompletionProviderContext,
): Completion[] {
  const seen = new Set<string>();
  const out: Completion[] = [];
  for (const d of descriptors) {
    if (d.scope !== 'all' && d.scope !== scope) continue;
    let options: readonly Completion[];
    try {
      options = d.complete(ctx);
    } catch {
      continue;
    }
    for (const opt of options) {
      if (seen.has(opt.label)) continue;
      seen.add(opt.label);
      out.push(opt);
    }
  }
  return out;
}
