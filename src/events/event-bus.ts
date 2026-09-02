/**
 * In-process event bus for React-side plugins (I6.1).
 *
 * Two cooperating event-bus implementations exist in the Plamenix
 * runtime: this TypeScript bus serves React-side plugins (the
 * `@plamenix/ui` registry contributions discovered via
 * `usePluginContributions`); the Rust-side `EventBus` in
 * `plamenix-plugin-host` serves WASM Component-Model plugins. Both
 * share the same topic-grammar + subscription semantics; emits on
 * one side bridge to the other via the host wiring landing in I6.2-
 * I6.11 (one bridge per event family).
 *
 * **Topic grammar**:
 *   - Slash-separated namespace (`'query/executed'`,
 *     `'connection/health-changed'`, `'tab/opened'`).
 *   - Subscribers register a pattern that may contain glob wildcards:
 *     `'*'` matches one segment, `'**'` matches zero-or-more segments
 *     (the rest of the topic).
 *   - Examples:
 *     - `'query/executed'` matches exactly that topic.
 *     - `'query/*'` matches `'query/executed'` + `'query/failed'`.
 *     - `'**'` matches everything (debug / observability use case).
 *     - `'connection/**'` matches every connection-family event.
 *
 * **Subscription lifecycle**:
 *   - `subscribe(pattern, handler)` returns a `Disposable` — call
 *     `.dispose()` to unsubscribe. React-side subscribers typically
 *     pair the dispose with a `useEffect` cleanup; out-of-React
 *     subscribers store the Disposable on their teardown closure.
 *   - Subscribers can also be unregistered en masse via
 *     `unsubscribeByPluginId(pluginId)` — used when a plugin
 *     deactivates so its subscriptions don't outlive it.
 *
 * **Emit semantics**:
 *   - Synchronous fan-out. Handlers run in subscription order
 *     (FIFO). A throwing handler is caught + logged via the host's
 *     log sink, but does not break the fan-out for other subscribers.
 *   - Payload is opaque (`unknown`) — emitters and subscribers agree
 *     on the shape per topic. Topic vocabulary lives in
 *     `PLUGIN_ARCHITECTURE.md §10` (event catalog).
 *
 * **Thread model**: single-threaded (browser main thread, jsdom in
 * tests). No locking needed.
 */

import { getLogger } from '../log/index.js';

const log = getLogger('event-bus');

/** Disposable handle returned by `subscribe`. Idempotent — calling
 *  `.dispose()` more than once is a no-op. */
export interface Disposable {
  dispose(): void;
}

/** Subscriber callback shape. Receives the matched topic (useful
 *  when the subscribed pattern used wildcards) + the raw payload. */
export type EventHandler<TPayload = unknown> = (
  topic: string,
  payload: TPayload,
) => void;

interface InternalSubscription {
  id: number;
  pluginId: string;
  pattern: string;
  segments: ReadonlyArray<string>;
  handler: EventHandler;
}

/** Pre-tokenises a pattern into slash-separated segments. Reserved
 *  for the matcher; exposed so unit tests can assert tokenisation. */
export function tokenisePattern(pattern: string): string[] {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new Error('event pattern must be a non-empty string');
  }
  return pattern.split('/');
}

/** Returns `true` when `topic` matches `patternSegments`. Single-
 *  segment `'*'` matches exactly one segment; `'**'` matches zero or
 *  more (must be the last segment in the pattern). Exact-text
 *  segments require an exact match. */
export function matchesPattern(
  patternSegments: ReadonlyArray<string>,
  topic: string,
): boolean {
  if (typeof topic !== 'string' || topic.length === 0) return false;
  const topicSegments = topic.split('/');
  for (let i = 0; i < patternSegments.length; i++) {
    const p = patternSegments[i]!;
    if (p === '**') {
      // Greedy tail — `**` must be the final pattern segment to be
      // unambiguous. Anything from the current topic position on
      // matches.
      return i === patternSegments.length - 1;
    }
    const t = topicSegments[i];
    if (t === undefined) return false; // pattern longer than topic
    if (p === '*') continue;
    if (p !== t) return false;
  }
  return patternSegments.length === topicSegments.length;
}

export class EventBus {
  #nextId = 1;
  #subscriptions: InternalSubscription[] = [];

  /** Subscribes `handler` to every topic that matches `pattern`.
   *  See class doc for pattern grammar. */
  subscribe<TPayload = unknown>(
    pluginId: string,
    pattern: string,
    handler: EventHandler<TPayload>,
  ): Disposable {
    if (typeof pluginId !== 'string' || pluginId.length === 0) {
      throw new Error('pluginId must be a non-empty string');
    }
    const segments = tokenisePattern(pattern);
    const id = this.#nextId++;
    const entry: InternalSubscription = {
      id,
      pluginId,
      pattern,
      segments,
      handler: handler as EventHandler,
    };
    this.#subscriptions.push(entry);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        const idx = this.#subscriptions.findIndex((s) => s.id === id);
        if (idx >= 0) this.#subscriptions.splice(idx, 1);
      },
    };
  }

  /** Emits `payload` to every subscriber whose pattern matches
   *  `topic`. Returns the number of subscribers invoked. */
  emit<TPayload = unknown>(topic: string, payload: TPayload): number {
    if (typeof topic !== 'string' || topic.length === 0) {
      throw new Error('topic must be a non-empty string');
    }
    let invoked = 0;
    // Snapshot the subscription list before iterating — a subscriber
    // disposing itself or another subscription during dispatch
    // shouldn't break the in-flight fan-out.
    const snapshot = this.#subscriptions.slice();
    for (const sub of snapshot) {
      if (!matchesPattern(sub.segments, topic)) continue;
      try {
        sub.handler(topic, payload);
        invoked++;
      } catch (err) {
        log.error(
          `subscriber ${sub.pluginId}:${sub.pattern} threw on ${topic}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return invoked;
  }

  /** Removes every subscription registered by `pluginId`. Used when
   *  a plugin deactivates so its subscriptions don't outlive its
   *  registration. Returns the number of subscriptions dropped. */
  unsubscribeByPluginId(pluginId: string): number {
    const before = this.#subscriptions.length;
    this.#subscriptions = this.#subscriptions.filter((s) => s.pluginId !== pluginId);
    return before - this.#subscriptions.length;
  }

  /** Returns the current subscription count. Exposed for tests +
   *  the future Permissions panel's "X subscriptions held" badge. */
  subscriptionCount(): number {
    return this.#subscriptions.length;
  }

  /** Test-only: drops every subscription. */
  __reset(): void {
    this.#subscriptions = [];
    this.#nextId = 1;
  }
}

/** Process-wide singleton — same pattern as the contribution
 *  registry. Multiple shells (desktop + web) instantiate the same
 *  module, so they share this bus within their process. */
export const eventBus = new EventBus();
