/**
 * Schema events (I6.8) — two topics covering schema observation +
 * mutation:
 *
 *   - `schema/described`       — fires when a tab's `schema` field
 *                                 transitions to a new (non-null)
 *                                 reference. Diff-on-subscribe shape
 *                                 (same as I6.4 / I6.5 / I6.6) — the
 *                                 schema describe call replaces the
 *                                 array reference, so identity change
 *                                 is the trigger.
 *   - `schema/action-applied`  — fires after a `SchemaAction` (from a
 *                                 `schema_actions` plugin contribution
 *                                 OR the built-in DBA toolbox) is
 *                                 applied successfully. Imperative
 *                                 emit at the call site (the action
 *                                 dispatcher knows when the host's
 *                                 execute resolved).
 *
 * Both events carry enough context (tabId, sessionId, object counts /
 * action descriptor) for subscribers building schema-watch dashboards
 * or audit logs without re-reading the store.
 */

import { useEffect, useRef } from 'react';
import { eventBus } from './event-bus.js';
import { useTabsStore, type TabState } from '../db/tabs-store.js';
import type { Schema, SchemaAction } from '../db/types.js';

/** Topic literals. */
export const SCHEMA_DESCRIBED = 'schema/described' as const;
export const SCHEMA_ACTION_APPLIED = 'schema/action-applied' as const;

export interface SchemaDescribedPayload {
  tabId: string;
  /** Session whose `describe` call produced the schema. `null` is
   *  invalid for a real describe but kept nullable for uniformity
   *  with the other event families. */
  sessionId: string | null;
  /** Counts per object kind — cheap summary subscribers can render
   *  without copying the whole schema. Subscribers needing the full
   *  schema read it from `useTabsStore.getState().tabs[…].schema`. */
  tableCount: number;
  procedureCount: number;
  triggerCount: number;
  generatorCount: number;
  domainCount: number;
  describedAt: number;
}

export interface SchemaActionAppliedPayload {
  tabId: string;
  sessionId: string | null;
  /** Object kind the action targeted (`table` / `view` / `procedure` /
   *  `trigger` / `generator`). Same discriminator as `SchemaAction.kind`. */
  kind: SchemaAction['kind'];
  /** Action verb (`drop` / `alter` / `create-index` / `recreate` / …).
   *  Same string as `SchemaAction.action`. */
  action: string;
  /** Name of the object the action targeted (e.g. table name,
   *  procedure name). Extracted from the action's `target.name`. */
  targetName: string;
  /** DDL the host executed to apply the action — captured so audit
   *  subscribers can log the exact statement that ran without having
   *  to re-derive it via `schemaDdl()`. May be `null` for actions
   *  that were applied via something other than a single DDL
   *  statement (e.g. `next-value` which reads via SELECT). */
  ddl: string | null;
  appliedAt: number;
}

export function emitSchemaDescribed(payload: SchemaDescribedPayload): void {
  eventBus.emit<SchemaDescribedPayload>(SCHEMA_DESCRIBED, payload);
}

export function emitSchemaActionApplied(
  payload: SchemaActionAppliedPayload,
): void {
  eventBus.emit<SchemaActionAppliedPayload>(SCHEMA_ACTION_APPLIED, payload);
}

/** Per-tab snapshot for the diff. Decoupled from the full `TabState`
 *  so unit tests can drive the diff with a minimal fixture. */
export interface SchemaSnapshot {
  id: string;
  sessionId: string | null;
  /** Reference-identity-tracked. Diff fires when this changes to a
   *  different non-null reference. */
  schema: Schema | null;
}

function countSchema(schema: Schema): {
  tableCount: number;
  procedureCount: number;
  triggerCount: number;
  generatorCount: number;
  domainCount: number;
} {
  return {
    tableCount: schema.tables.length,
    procedureCount: schema.procedures?.length ?? 0,
    triggerCount: schema.triggers?.length ?? 0,
    generatorCount: schema.generators?.length ?? 0,
    domainCount: schema.domains?.length ?? 0,
  };
}

/** Pure diff — exposed for unit tests. Emits `schema/described` for
 *  each tab whose `schema` reference changed to a non-null value.
 *  Returns total event count emitted across all tabs. */
export function diffAndEmitSchemaEvents(
  prev: ReadonlyArray<SchemaSnapshot>,
  next: ReadonlyArray<SchemaSnapshot>,
  now: () => number = Date.now,
): number {
  let count = 0;
  const prevById = new Map(prev.map((t) => [t.id, t]));
  for (const t of next) {
    const before = prevById.get(t.id);
    const prevSchema = before?.schema ?? null;
    if (t.schema === null || t.schema === prevSchema) continue;
    emitSchemaDescribed({
      tabId: t.id,
      sessionId: t.sessionId,
      ...countSchema(t.schema),
      describedAt: now(),
    });
    count++;
  }
  return count;
}

function toSnapshot(state: {
  tabs: ReadonlyArray<TabState>;
}): SchemaSnapshot[] {
  return state.tabs.map((t) => ({
    id: t.id,
    sessionId: t.sessionId,
    schema: t.schema,
  }));
}

/** React hook that subscribes to `useTabsStore` + emits
 *  `schema/described` events on every schema-reference change. Mount
 *  once at the App component:
 *
 *    useEmitSchemaEvents();
 *
 *  Initial mount captures the current store snapshot — if a tab
 *  already holds a schema at mount, the diff against the empty
 *  baseline emits one `schema/described` per such tab so subscribers
 *  mounting late see the current state. */
export function useEmitSchemaEvents(): void {
  const prevRef = useRef<SchemaSnapshot[]>([]);
  useEffect(() => {
    const initial = toSnapshot(useTabsStore.getState());
    diffAndEmitSchemaEvents(prevRef.current, initial);
    prevRef.current = initial;
    const unsubscribe = useTabsStore.subscribe((state) => {
      const next = toSnapshot(state);
      diffAndEmitSchemaEvents(prevRef.current, next);
      prevRef.current = next;
    });
    return () => unsubscribe();
  }, []);
}
