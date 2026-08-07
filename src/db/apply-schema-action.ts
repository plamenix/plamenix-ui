import { emitSchemaActionApplied } from '../events/schema-events.js';
import { schemaActionApplyingChain } from '../interceptors/schema-action-applying.js';
import { schemaDdl } from './schema-actions.js';
import type { SchemaDdl } from './schema-actions.js';
import type { SchemaAction } from './types.js';

/**
 * One schema action, from menu click to event.
 *
 * Generate the DDL, let the `schema.action-applying` chain refuse it,
 * dispatch it, and announce it if it ran. This was 29 byte-identical
 * lines in each shell — everything it touches already lived in this
 * library except the dispatch itself, which is now shared too.
 */

export interface ApplySchemaActionOptions {
  tabId: string;
  /** The tab's session, or `null` when disconnected. */
  sessionId: string | null;
  /** Applies the generated DDL. See `dispatchSchemaDdl`; returns `true`
   *  only when a statement actually reached the database. */
  dispatch: (ddl: SchemaDdl) => Promise<boolean>;
  /** Reports a refusal from the chain. */
  patch: (patch: { error: string }) => void;
  /** Injectable so a test is not at the mercy of the clock. */
  now?: () => number;
}

/**
 * Applies a schema action and returns whether anything ran.
 *
 * The interceptor chain only runs when there is a session. That reads
 * like a hole and is not one: without a session the dispatch either
 * pastes the statement into the editor for the user to read — which
 * applies nothing and so has nothing to police — or, for a destructive
 * action, prompts and then stops for want of a session. Nothing reaches
 * a database along a path the chain did not see.
 *
 * The event fires only on a real execution, which is why `dispatch`
 * returning `false` for the paste path matters: a plugin listening for
 * `schema.action-applied` is told about changes, not about text that
 * appeared in an editor.
 */
export async function applySchemaAction(
  action: SchemaAction,
  options: ApplySchemaActionOptions,
): Promise<boolean> {
  const { tabId, sessionId, dispatch, patch } = options;
  const now = options.now ?? Date.now;
  const ddl = schemaDdl(action);

  if (sessionId !== null) {
    const decision = await schemaActionApplyingChain.run({
      tabId,
      sessionId,
      kind: action.kind,
      action: action.action,
      targetName: action.target.name,
      ddl: ddl.sql,
    });
    if (decision.action === 'cancel') {
      patch({ error: decision.reason });
      return false;
    }
  }

  const executed = await dispatch(ddl);
  if (!executed) return false;

  emitSchemaActionApplied({
    tabId,
    sessionId,
    kind: action.kind,
    action: action.action,
    targetName: action.target.name,
    ddl: ddl.sql,
    appliedAt: now(),
  });
  return true;
}
