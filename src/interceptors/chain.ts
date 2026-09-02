/**
 * Generic interceptor chain primitive (I6.12; framework features
 * landed in I6.19).
 *
 * An interceptor is a handler the host invokes BEFORE a sensitive
 * action runs. Each handler gets the action's context and returns a
 * {@link InterceptorDecision} — one of three verbs:
 *
 *   - `continue` — pass-through, the chain falls to the next handler
 *     (or to the host if this was the last handler).
 *   - `cancel`   — veto the action with a human-readable reason. The
 *     chain short-circuits; later handlers do not run.
 *   - `replace`  — substitute a different context with a human-
 *     readable reason. The chain continues with the replaced
 *     context; subsequent handlers see the replaced ctx. The host
 *     receives the final replace decision at the end of the chain
 *     (assuming no subsequent cancel) and proceeds with the
 *     replaced ctx instead of the original.
 *
 * # Framework features (I6.19)
 *
 *   - **Priority ordering** — handlers run in ascending priority
 *     order (lower number first). Default priority is `100`.
 *     Same-priority handlers tie-break on registration order.
 *     Built-ins typically register at priority `50` so plugin
 *     handlers (default `100`) run after them.
 *   - **Cancel / Replace semantics** — see the verb list above. A
 *     cancel anywhere in the chain wins over preceding or later
 *     replaces; a replace propagates the new ctx forward through
 *     the remaining handlers; the chain returns the replace
 *     decision only if no later handler cancels.
 *   - **Budget enforcement** — the chain enforces a 500ms total
 *     wall-clock budget by default (override via `run` options).
 *     If the budget is exceeded BEFORE the next handler starts, the
 *     chain fails OPEN: it logs the trap via `onTrap` and returns
 *     `continue` (host proceeds with the original action). An
 *     already-running handler isn't killed (JavaScript can't cancel
 *     a promise) — its decision is honoured if it resolves before
 *     the next budget check, otherwise ignored.
 *   - **Fail-open on trap** — if a handler throws (or returns a
 *     rejected promise), the chain logs the error via `onTrap` and
 *     skips to the next handler. Plugin handlers are untrusted; one
 *     bad plugin shouldn't break the host. Cancel decisions from
 *     other handlers are still honoured.
 *
 * # Why fail-open
 *
 * Interceptors gate "the user is about to do X" — every false-
 * negative (action allowed when policy would have blocked it) is
 * recoverable through user judgement or downstream guards; every
 * false-positive (action blocked when policy would have allowed it)
 * locks the user out of their own DB. Failing OPEN on slow / crashed
 * interceptors trades policy strictness for app responsiveness —
 * the right trade for an IDE.
 */

/** Verbs an interceptor handler can return. `replace` carries a new
 *  context that subsequent handlers see (and that the host uses if
 *  no cancel intervenes). */
export type InterceptorDecision<TCtx = unknown> =
  | { action: 'continue' }
  | { action: 'cancel'; reason: string }
  | { action: 'replace'; ctx: TCtx; reason: string };

export type InterceptorHandler<TCtx> = (
  ctx: TCtx,
) => InterceptorDecision<TCtx> | Promise<InterceptorDecision<TCtx>>;

/** Options bag accepted by {@link InterceptorChain.use}. */
export interface InterceptorUseOptions {
  /** Lower number runs first; default `100`. Built-ins typically
   *  use `50` so plugin handlers run after them. Same priority →
   *  registration order tie-breaks. */
  priority?: number;
}

/** Disposable returned by {@link InterceptorChain.use} — call its
 *  `dispose()` to unregister the handler. */
export interface InterceptorRegistration {
  dispose(): void;
}

/** Options bag accepted by {@link InterceptorChain.run}. Both fields
 *  are optional; sensible defaults apply. */
export interface InterceptorRunOptions {
  /** Total wall-clock budget for the chain, in milliseconds.
   *  Default `500`. If exceeded BEFORE a handler starts, the chain
   *  fails open (returns `continue`). */
  budgetMs?: number;
  /** Sink for errors + budget-exceeded notices. Default: log to
   *  `console.error`. Tests pass a `vi.fn()` to assert on traps. */
  onTrap?: (err: unknown) => void;
  /** Clock injection — test-only. Defaults to `Date.now`. */
  now?: () => number;
}

const DEFAULT_PRIORITY = 100;
const DEFAULT_BUDGET_MS = 500;

const CONTINUE = Object.freeze({ action: 'continue' as const });

interface RegisteredHandler<TCtx> {
  readonly id: number;
  readonly handler: InterceptorHandler<TCtx>;
  readonly priority: number;
  readonly insertionOrder: number;
}

export class InterceptorChain<TCtx> {
  private readonly handlers = new Map<number, RegisteredHandler<TCtx>>();
  private nextHandlerId = 1;
  private nextInsertionOrder = 1;

  /** Registers a handler. Returns a disposable that unregisters it.
   *  `options.priority` defaults to `100`; lower numbers run first. */
  use(
    handler: InterceptorHandler<TCtx>,
    options: InterceptorUseOptions = {},
  ): InterceptorRegistration {
    const id = this.nextHandlerId++;
    const priority = options.priority ?? DEFAULT_PRIORITY;
    const insertionOrder = this.nextInsertionOrder++;
    this.handlers.set(id, { id, handler, priority, insertionOrder });
    return {
      dispose: () => {
        this.handlers.delete(id);
      },
    };
  }

  /** Runs the chain against `ctx`.
   *
   *  Return value:
   *   - `{action: 'continue'}` — host proceeds with the ORIGINAL ctx.
   *   - `{action: 'cancel', reason}` — host aborts the action and
   *     surfaces `reason` to the user.
   *   - `{action: 'replace', ctx, reason}` — host proceeds with the
   *     REPLACED ctx (and may log `reason` for audit transparency).
   *
   *  Errors thrown by handlers are caught + reported via `onTrap`;
   *  the chain skips the trapping handler and continues with the
   *  next one (fail-open). Budget exhaustion is also reported via
   *  `onTrap` and falls through to `continue`. */
  async run(
    ctx: TCtx,
    options: InterceptorRunOptions = {},
  ): Promise<InterceptorDecision<TCtx>> {
    const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    const onTrap =
      options.onTrap ??
      ((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Interceptor trap:', err);
      });
    const now = options.now ?? Date.now;
    const startedAt = now();

    // Snapshot before dispatch — a handler may dispose itself or
    // another handler during execution; the in-flight snapshot keeps
    // the iteration stable (mirrors I6.1 event-bus semantics).
    // Sort by priority ascending, registration order tie-break.
    const snapshot = Array.from(this.handlers.values()).sort(
      (a, b) =>
        a.priority - b.priority || a.insertionOrder - b.insertionOrder,
    );

    let currentCtx = ctx;
    let lastReplaceReason: string | null = null;

    for (const reg of snapshot) {
      if (now() - startedAt >= budgetMs) {
        onTrap(
          new Error(
            `Interceptor chain exceeded ${budgetMs}ms budget; failing open at handler #${reg.id}.`,
          ),
        );
        break;
      }
      let decision: InterceptorDecision<TCtx>;
      try {
        decision = await reg.handler(currentCtx);
      } catch (err) {
        onTrap(err);
        continue;
      }
      if (decision.action === 'cancel') {
        return decision;
      }
      if (decision.action === 'replace') {
        currentCtx = decision.ctx;
        lastReplaceReason = decision.reason;
      }
      // 'continue' falls through
    }

    if (lastReplaceReason !== null) {
      return {
        action: 'replace',
        ctx: currentCtx,
        reason: lastReplaceReason,
      };
    }
    return CONTINUE;
  }

  /** Test-only — clears every registered handler. Use in
   *  `beforeEach` to keep test runs isolated. */
  __reset(): void {
    this.handlers.clear();
    this.nextHandlerId = 1;
    this.nextInsertionOrder = 1;
  }

  /** Test-only — returns the current handler count. */
  __size(): number {
    return this.handlers.size;
  }
}
