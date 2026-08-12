import type { TxStatus } from './types.js';
import { hasUncommittedWork } from './transaction-status.js';

/**
 * Getting out of a statement that will not finish.
 *
 * There is no way to tell Firebird to stop. `fb_cancel_operation` is not
 * bound in the vendored native driver, and the pure-Rust backend — which
 * is the default — has no cancel operation in its wire protocol at all.
 * So a "Cancel" button that merely stopped waiting would leave the
 * server running the query, holding its transaction, while telling the
 * user it had stopped. That is worse than no button.
 *
 * What can be done truthfully is end the attachment. Detaching rolls
 * back the open transaction and the server stops the work with it. The
 * cost is real and has to be stated rather than buried: the session is
 * gone, and everything uncommitted goes with it. Hence
 * {@link abandonNeedsConfirmation} — the user is told what they are
 * about to lose before anything happens, and only when there is
 * something to lose.
 *
 * The subtle part is not the abandoning. It is that the statement's own
 * promise is still in flight and will reject once its session dies,
 * *after* the tab has already reconnected. See {@link isStaleSession}.
 */

/**
 * Whether abandoning would discard work the user has not committed.
 *
 * Only true for a manual transaction with statements in it. Autocommit
 * has nothing pending by definition, and an open-but-empty transaction
 * has nothing to lose — prompting in either case trains the user to
 * dismiss the prompt that matters.
 */
export function abandonNeedsConfirmation(txStatus: TxStatus | null | undefined): boolean {
  return hasUncommittedWork(txStatus);
}

/** What the user is told before the session is thrown away. */
export function describeAbandonCost(txStatus: TxStatus | null | undefined): string {
  const pending = txStatus?.pendingStatements ?? 0;
  const statements = pending === 1 ? '1 statement' : `${pending} statements`;
  return (
    `Stopping ends this session. The server has no way to cancel a running ` +
    `statement, so the connection has to be dropped — and your open ` +
    `transaction will be rolled back, discarding ${statements}. ` +
    `Plamenix will reconnect afterwards.`
  );
}

export interface AbandonOptions {
  /** The session to end. */
  sessionId: string;
  /** Ends the attachment. Rolling back is the host's job and the
   *  driver's `close` already does it. */
  close: (sessionId: string) => Promise<void>;
  /** Re-opens a session for the tab, exactly as a reconnect would. */
  reconnect: () => Promise<void>;
  /** Reports a failure to end the session. */
  onError: (message: string) => void;
}

/**
 * Ends the session a stuck statement is running in, then reconnects.
 *
 * Reconnects even when the close failed. A tab whose session is in an
 * unknown state is not a tab the user can do anything with, and the
 * reconnect is what returns it to a usable one — if the server is truly
 * gone, that attempt reports the real problem, which is more use than a
 * silent dead tab.
 */
export async function abandonStatement(options: AbandonOptions): Promise<void> {
  try {
    await options.close(options.sessionId);
  } catch (err) {
    options.onError(`Could not close the session cleanly: ${String(err)}`);
  }
  await options.reconnect();
}

/**
 * Whether a settled statement belongs to a session the tab has left.
 *
 * The race this closes: abandoning ends the session while the execute
 * is still awaiting it. The execute then rejects — correctly, its
 * session died — and its `catch` would stamp an error on a tab that has
 * already reconnected and is sitting there looking healthy. Its
 * `finally` would clear `busy` on a tab that may be busy with something
 * else by then.
 *
 * So every handler that writes a statement's outcome back to a tab
 * compares the session it ran against with the session the tab holds
 * now, and drops the result if they differ. The statement is not
 * *wrong*; it is about a session nobody is looking at any more.
 */
export function isStaleSession(ranAgainst: string, tabHoldsNow: string | null): boolean {
  return ranAgainst !== tabHoldsNow;
}
