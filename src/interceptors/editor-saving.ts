/**
 * `editor.saving` interceptor chain (I6.17) — runs BEFORE the SQL
 * editor "saves" its content. In Plamenix there's no separate save
 * action: pressing the execute shortcut (⌘/Ctrl+Enter) is the only
 * persistence event for editor text — the execute path captures the
 * SQL into `tab.executedSql`, which is what the rest of the app
 * (history, recent-queries) treats as "saved".
 *
 * This chain is narrower than `query.executing` (I6.12) on purpose:
 *
 *   - `query.executing` fires for EVERY `host.execute(sql)` call,
 *     including SQL the user never typed (schema-action DDL,
 *     inline-edit UPDATEs, bulk-delete DELETEs).
 *   - `editor.saving` fires ONLY when the user presses the execute
 *     shortcut from the SQL editor itself.
 *
 * Use this chain for "format-on-save" style policies that should
 * touch user-authored SQL but not auto-generated SQL: lint gates
 * ("save blocked: SQL is missing a comment"), formatting checks
 * ("indentation drift detected — run :format first"), unsaved-work
 * confirmations ("you have unsaved bookmarks — proceed?"). The
 * editor-execute path runs BOTH this chain AND `query.executing`,
 * in that order (editor-saving first, then query-executing).
 *
 * Veto-only; no modification. Same rationale as the other I6.12-I6.16
 * chains — a "format on save" interceptor that silently rewrites the
 * editor buffer would surprise users; the right shape is a policy
 * that vetoes + surfaces a fix-suggestion in the reason string.
 *
 * No built-in interceptors today.
 */

import { InterceptorChain } from './chain.js';

/** Context passed to every `editor.saving` handler. Frozen at call
 *  time — handlers MAY NOT mutate fields. */
export interface EditorSavingContext {
  tabId: string;
  sessionId: string;
  /** Current editor buffer — the SQL about to be executed. Same
   *  string the shell would then pass to `host.execute` (assuming
   *  this chain + `query.executing` both return `continue`). */
  sql: string;
}

/** Singleton chain instance. Plugins call `editorSavingChain.use(...)`
 *  to register their handlers; the shell calls `.run(ctx)` from the
 *  SqlEditor execute path (Mod-Enter handler + the toolbar "Execute"
 *  button) BEFORE the `query.executing` chain. */
export const editorSavingChain = new InterceptorChain<EditorSavingContext>();
