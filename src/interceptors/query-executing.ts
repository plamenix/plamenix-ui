/**
 * `query.executing` interceptor chain (I6.12) — runs BEFORE each
 * `host.execute(sql)` call. Handlers can veto the execute (typical
 * use: confirmation modals for destructive statements; policy gates
 * that block production DDL; audit gates that require a comment).
 *
 * The shell wraps the execute call:
 *
 *     const decision = await queryExecutingChain.run(ctx);
 *     if (decision.action === 'cancel') {
 *       // surface decision.reason to the user; do not call host.execute
 *       return;
 *     }
 *     await host.execute(ctx.sql);
 *
 * Built-in interceptors (this module also ships them):
 *
 *   - {@link installDestructiveDropInterceptor} — detects DROP /
 *     TRUNCATE / unconstrained DELETE statements and asks the
 *     host-registered confirmation provider before allowing them.
 *
 * Future built-ins (out of scope today): read-only mode gate, policy
 * gate (regex deny-list), comment-required gate.
 */

import { InterceptorChain } from './chain.js';
import type { InterceptorRegistration } from './chain.js';

/** Context passed to every `query.executing` handler. Frozen at
 *  call time — handlers MAY NOT mutate fields (the chain primitive
 *  doesn't support modification today). */
export interface QueryExecutingContext {
  /** Tab the execute originates from. */
  tabId: string;
  /** Session the statement will run against. Never `null` because
   *  the shell only invokes the chain when a live session exists. */
  sessionId: string;
  /** Raw SQL string the user is about to run. May contain multiple
   *  statements separated by semicolons. */
  sql: string;
}

/** Singleton chain instance. Plugins call `queryExecutingChain.use(...)`
 *  to register their handlers; the shell calls `.run(ctx)` before each
 *  execute. */
export const queryExecutingChain = new InterceptorChain<QueryExecutingContext>();

// ---------------------------------------------------------------------------
// Confirmation provider — the bridge between policy code (this module)
// and host-rendered confirmation UI (the shell mounts a modal). The
// built-in destructive-DROP interceptor calls the provider; tests + the
// CLI pass-through (rare) leave it unset and the interceptor falls
// back to a deny-by-default decision (safer than silently allowing a
// drop when no UI is mounted).
// ---------------------------------------------------------------------------

/** A confirmation request the host renders. The shell-registered
 *  provider returns a promise that resolves to `true` (user
 *  confirmed) or `false` (user denied / dismissed). */
export interface ConfirmationRequest {
  /** Short headline for the modal. */
  title: string;
  /** Body copy explaining what's about to happen. */
  message: string;
  /** Confirm button label. */
  confirmLabel: string;
  /** Cancel button label. */
  cancelLabel: string;
  /** Visual treatment — `'danger'` for destructive ops (red confirm
   *  button), `'warn'` for less-severe (amber). */
  severity: 'danger' | 'warn';
}

export type ConfirmationProvider = (
  req: ConfirmationRequest,
) => Promise<boolean>;

let confirmationProvider: ConfirmationProvider | null = null;

/** Installs the host-side confirmation provider. The desktop +
 *  web shells call this once at boot with a function that renders
 *  the confirmation modal and returns the user's choice. Calling
 *  with `null` un-installs the provider (testing only). */
export function setConfirmationProvider(
  provider: ConfirmationProvider | null,
): void {
  confirmationProvider = provider;
}

/** Test-only — returns whether a confirmation provider is currently
 *  installed. */
export function __hasConfirmationProvider(): boolean {
  return confirmationProvider !== null;
}

// ---------------------------------------------------------------------------
// Destructive-DROP detection — regex-based statement classifier.
//
// Scope: `DROP TABLE|VIEW|PROCEDURE|TRIGGER|GENERATOR|SEQUENCE|DOMAIN|INDEX`,
// `TRUNCATE TABLE`, and `DELETE FROM ...` without a `WHERE` clause.
//
// Out of scope: SQL comments + string literals are NOT stripped. A
// statement like `SELECT 'DROP TABLE x' FROM dual` would falsely
// match. The cost-vs-value tradeoff favours false-positives (an
// extra confirmation modal) over false-negatives (a missed real
// drop). True parser-grade detection lands when the SQL lexer is
// promoted out of CodeMirror into a shared util.
// ---------------------------------------------------------------------------

const DROP_PATTERN =
  /\bdrop\s+(table|view|procedure|trigger|generator|sequence|domain|index)\b/i;

const TRUNCATE_PATTERN = /\btruncate\s+table\b/i;

const DELETE_PATTERN = /\bdelete\s+from\b/i;
const WHERE_PATTERN = /\bwhere\b/i;

/** Returns `true` if `sql` looks like one or more destructive
 *  statements that warrant a confirmation prompt. Exported for tests
 *  + reused by future built-ins (e.g. read-only mode gate). */
export function isDestructiveSql(sql: string): boolean {
  if (DROP_PATTERN.test(sql)) return true;
  if (TRUNCATE_PATTERN.test(sql)) return true;
  if (DELETE_PATTERN.test(sql) && !WHERE_PATTERN.test(sql)) return true;
  return false;
}

/** Installs the built-in destructive-DROP confirmation interceptor.
 *  Returns the registration disposable so the host can uninstall it
 *  (e.g. when the user enables "expert mode" in settings).
 *
 *  Behavior:
 *  - SQL doesn't match the destructive heuristic → `continue` (no
 *    prompt).
 *  - SQL matches AND a confirmation provider is installed → prompts
 *    via the provider. User confirms → `continue`. User denies →
 *    `cancel`.
 *  - SQL matches AND no provider is installed → `cancel` (safer
 *    than silently allowing a destructive drop). Tests that don't
 *    care about confirmation should not install this interceptor. */
export function installDestructiveDropInterceptor(): InterceptorRegistration {
  return queryExecutingChain.use(async (ctx) => {
    if (!isDestructiveSql(ctx.sql)) {
      return { action: 'continue' };
    }
    if (confirmationProvider === null) {
      return {
        action: 'cancel',
        reason:
          'Destructive statement blocked: no confirmation handler installed.',
      };
    }
    const confirmed = await confirmationProvider({
      title: 'Confirm destructive statement',
      message:
        'This statement drops, truncates, or deletes data that cannot be ' +
        'recovered without a backup. Proceed?',
      confirmLabel: 'Run anyway',
      cancelLabel: 'Cancel',
      severity: 'danger',
    });
    if (confirmed) return { action: 'continue' };
    return {
      action: 'cancel',
      reason: 'Cancelled by user at destructive-statement prompt.',
    };
  });
}
