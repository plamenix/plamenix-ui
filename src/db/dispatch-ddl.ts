import { notifyMutations } from '../toast/notify.js';
import type { SchemaDdl } from './schema-actions.js';
import type { StatementOutcome } from './types.js';

/**
 * What the shell does with a piece of generated DDL.
 *
 * `schemaDdl()` turns a menu action into a statement plus two flags, and
 * those flags select between three quite different behaviours: run it
 * silently, paste it into the editor for the user to read, or ask first
 * and then run it. Both shells implemented that fork, and the two had
 * drifted — the desktop copy stopped recording which SQL produced the
 * results it was displaying, so the tab kept showing an unsaved-changes
 * dot for a statement it had just run.
 */

/** Tab fields this writes. */
export interface DdlTabPatch {
  error?: string | null;
  busy?: boolean;
  sql?: string;
  results?: StatementOutcome[];
  executedSql?: string;
}

export interface DdlDispatchOptions {
  /** The tab's session, or `null` when disconnected — nothing runs
   *  without one, and pasting DDL into an editor with no connection
   *  would suggest otherwise. */
  sessionId: string | null;
  /** Runs the statement. The edition's transport. */
  execute: (sql: string) => Promise<StatementOutcome[]>;
  patch: (patch: DdlTabPatch) => void;
  /** Records the attempt in the recent-queries list. Called for both
   *  outcomes: a DROP that failed is a thing the user will want to find
   *  again. */
  record: (
    sql: string,
    startedAt: number,
    outcomes: StatementOutcome[] | null,
    error: string | null,
  ) => void;
  /** Reloads the object list. DDL is the only thing that changes it. */
  refreshSchema: () => void;
  /** Asks the user before a destructive statement. Injected rather than
   *  calling `window.confirm` here, both so this is testable and so a
   *  shell can move to a real dialog without touching this logic. */
  confirm: (prompt: string) => boolean;
  /** Wall-clock start, for the recent-queries duration. Injectable so a
   *  test is not at the mercy of the clock. */
  now?: () => number;
}

const DEFAULT_PROMPT = 'Run destructive statement?';

/**
 * Applies one piece of generated DDL.
 *
 * Three paths, in the order the flags are checked:
 *
 * - `autoExecute` — run it without asking and without showing it. For
 *   cheap reversible toggles like a trigger's ACTIVE flag, where a
 *   confirm would be noise. The results are deliberately *not* written
 *   to the tab: the user did not ask to see a grid, they clicked a
 *   toggle, and replacing whatever they were looking at would be a
 *   surprise.
 * - Neither flag — paste into the editor and stop. The user reads it,
 *   edits it if they like, and runs it themselves.
 * - `destructive` — ask, then run, and show what came back.
 *
 * @returns `true` when a statement actually ran against the database.
 * The caller uses this to decide whether the action happened, which is
 * what the `schema.action-applied` event reports.
 */
export async function dispatchSchemaDdl(
  ddl: SchemaDdl,
  options: DdlDispatchOptions,
): Promise<boolean> {
  const { sessionId, patch, confirm } = options;

  if (ddl.autoExecute) {
    if (sessionId === null) return false;
    patch({ error: null, busy: true });
    return runDdl(ddl.sql, options, false);
  }

  if (!ddl.destructive) {
    patch({ sql: ddl.sql });
    return false;
  }

  if (!confirm(ddl.confirmPrompt ?? DEFAULT_PROMPT)) return false;
  // Checked after the prompt rather than before: the session is what
  // the caller's error path reports on, and a confirm that silently
  // does nothing is worse than one that leads to a message.
  if (sessionId === null) return false;

  // The statement lands in the editor before it runs, so a failure
  // leaves the user with the exact text that failed rather than with
  // whatever they had typed before.
  patch({ error: null, busy: true, sql: ddl.sql });
  return runDdl(ddl.sql, options, true);
}

/** Runs one statement and reports it. `showResults` is false for the
 *  auto-execute path, where the user clicked a toggle rather than
 *  asking for a grid. */
async function runDdl(
  sql: string,
  options: DdlDispatchOptions,
  showResults: boolean,
): Promise<boolean> {
  const { execute, patch, record, refreshSchema } = options;
  const startedAt = (options.now ?? Date.now)();
  try {
    const outcomes = await execute(sql);
    if (showResults) {
      // `executedSql` alongside `results`, always. The tab strip reads
      // the two together to decide whether the editor buffer has
      // drifted from what produced the grid; writing one without the
      // other leaves the dirty-buffer dot lit for a statement that just
      // ran.
      patch({ results: outcomes, executedSql: sql });
    }
    notifyMutations(outcomes);
    record(sql, startedAt, outcomes, null);
    refreshSchema();
    return true;
  } catch (err) {
    patch({ error: String(err) });
    record(sql, startedAt, null, String(err));
    return false;
  } finally {
    patch({ busy: false });
  }
}
