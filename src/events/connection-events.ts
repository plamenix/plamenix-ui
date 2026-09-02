/**
 * Connection events (I6.5) — per-tab session-lifecycle emit family.
 * Same diff-on-subscribe shape as tab-events (I6.4); subscribes to
 * `useTabsStore` and walks each tab's `sessionId` / `health` /
 * `error` transitions.
 *
 *   - `connection/opened`         — tab's `sessionId` went `null → string`
 *   - `connection/closed`         — tab's `sessionId` went `string → null`
 *   - `connection/health-changed` — tab's `health` transitioned (e.g.
 *                                    `unknown → healthy`,
 *                                    `healthy → reconnecting`,
 *                                    `reconnecting → dead`)
 *   - `connection/failed`         — best-effort: tab's `error`
 *                                    transitions `null → non-null`
 *                                    while `sessionId` is null
 *                                    (catches the connect-error path;
 *                                    documented as best-effort because
 *                                    the same field surfaces other
 *                                    error kinds too)
 *
 * Subscribers correlate events by `tabId` — a single tab can fire
 * many `health-changed` events over its session lifetime.
 */

import { useEffect, useRef } from 'react';
import { eventBus } from './event-bus.js';
import { useTabsStore, type TabState } from '../db/tabs-store.js';

/** Topic literals. */
export const CONNECTION_OPENED = 'connection/opened' as const;
export const CONNECTION_FAILED = 'connection/failed' as const;
export const CONNECTION_CLOSED = 'connection/closed' as const;
export const CONNECTION_HEALTH_CHANGED = 'connection/health-changed' as const;

/** Health state union, mirrored from `TabState.health` so subscribers
 *  don't have to import the larger tabs-store types. */
export type ConnectionHealth = 'unknown' | 'healthy' | 'reconnecting' | 'dead';

export interface ConnectionOpenedPayload {
  tabId: string;
  sessionId: string;
  /** Connection target fields — copied from the tab's form at emit
   *  time so the subscriber can build a DSN without re-reading the
   *  store (and getting a different in-flight form). */
  host: string;
  port: number;
  database: string;
  user: string;
  openedAt: number;
}

export interface ConnectionFailedPayload {
  tabId: string;
  /** Same target fields as `opened` — useful for grouping
   *  failed-connect attempts in observability dashboards. */
  host: string;
  port: number;
  database: string;
  user: string;
  /** Error message captured from `tab.error`. */
  error: string;
  failedAt: number;
}

export interface ConnectionClosedPayload {
  tabId: string;
  /** Previous sessionId before close (the current one is `null`). */
  previousSessionId: string;
  closedAt: number;
}

export interface ConnectionHealthChangedPayload {
  tabId: string;
  /** Current sessionId, or `null` when health transitioned while
   *  disconnected (rare but possible — e.g. `unknown → dead` on a
   *  failed initial probe). */
  sessionId: string | null;
  previousHealth: ConnectionHealth;
  nextHealth: ConnectionHealth;
  changedAt: number;
}

export function emitConnectionOpened(payload: ConnectionOpenedPayload): void {
  eventBus.emit<ConnectionOpenedPayload>(CONNECTION_OPENED, payload);
}
export function emitConnectionFailed(payload: ConnectionFailedPayload): void {
  eventBus.emit<ConnectionFailedPayload>(CONNECTION_FAILED, payload);
}
export function emitConnectionClosed(payload: ConnectionClosedPayload): void {
  eventBus.emit<ConnectionClosedPayload>(CONNECTION_CLOSED, payload);
}
export function emitConnectionHealthChanged(
  payload: ConnectionHealthChangedPayload,
): void {
  eventBus.emit<ConnectionHealthChangedPayload>(CONNECTION_HEALTH_CHANGED, payload);
}

/** Per-tab snapshot for the diff. Decoupled from the full `TabState`
 *  so unit tests can drive the diff with a minimal fixture. */
export interface ConnectionSnapshot {
  id: string;
  sessionId: string | null;
  health: ConnectionHealth;
  error: string | null;
  host: string;
  port: number;
  database: string;
  user: string;
}

/** Pure diff — exposed for unit tests. Emits at most four events
 *  per tab per transition (typically just one). Returns total event
 *  count emitted across all tabs. */
export function diffAndEmitConnectionEvents(
  prev: ReadonlyArray<ConnectionSnapshot>,
  next: ReadonlyArray<ConnectionSnapshot>,
  now: () => number = Date.now,
): number {
  let count = 0;
  const prevById = new Map(prev.map((t) => [t.id, t]));
  for (const t of next) {
    const before = prevById.get(t.id);
    if (!before) {
      // New tab — emit `opened` if it already has a session at
      // first observation (so subscribers mounting late see the
      // current state).
      if (t.sessionId !== null) {
        emitConnectionOpened({
          tabId: t.id,
          sessionId: t.sessionId,
          host: t.host,
          port: t.port,
          database: t.database,
          user: t.user,
          openedAt: now(),
        });
        count++;
      }
      continue;
    }

    // sessionId transitions
    if (before.sessionId === null && t.sessionId !== null) {
      emitConnectionOpened({
        tabId: t.id,
        sessionId: t.sessionId,
        host: t.host,
        port: t.port,
        database: t.database,
        user: t.user,
        openedAt: now(),
      });
      count++;
    } else if (before.sessionId !== null && t.sessionId === null) {
      emitConnectionClosed({
        tabId: t.id,
        previousSessionId: before.sessionId,
        closedAt: now(),
      });
      count++;
    }

    // error transition: null → non-null while sessionId is null
    // is the best-effort signal for a failed connect attempt.
    if (
      before.error === null &&
      t.error !== null &&
      t.sessionId === null
    ) {
      emitConnectionFailed({
        tabId: t.id,
        host: t.host,
        port: t.port,
        database: t.database,
        user: t.user,
        error: t.error,
        failedAt: now(),
      });
      count++;
    }

    // health transitions
    if (before.health !== t.health) {
      emitConnectionHealthChanged({
        tabId: t.id,
        sessionId: t.sessionId,
        previousHealth: before.health,
        nextHealth: t.health,
        changedAt: now(),
      });
      count++;
    }
  }
  return count;
}

function toSnapshot(state: {
  tabs: ReadonlyArray<TabState>;
}): ConnectionSnapshot[] {
  return state.tabs.map((t) => ({
    id: t.id,
    sessionId: t.sessionId,
    health: t.health,
    error: t.error,
    host: t.form.host,
    port: t.form.port,
    database: t.form.database,
    user: t.form.user,
  }));
}

/** React hook that subscribes to `useTabsStore` + emits connection
 *  events on every relevant transition. Mount once at the App
 *  component:
 *
 *    useEmitConnectionEvents();
 *
 *  Initial mount captures the current store + diffs against empty,
 *  so any tab already holding a session at mount emits
 *  `connection/opened` (subscribers mounting late see current state). */
export function useEmitConnectionEvents(): void {
  const prevRef = useRef<ConnectionSnapshot[]>([]);
  useEffect(() => {
    const initial = toSnapshot(useTabsStore.getState());
    diffAndEmitConnectionEvents(prevRef.current, initial);
    prevRef.current = initial;
    const unsubscribe = useTabsStore.subscribe((state) => {
      const next = toSnapshot(state);
      diffAndEmitConnectionEvents(prevRef.current, next);
      prevRef.current = next;
    });
    return () => unsubscribe();
  }, []);
}
