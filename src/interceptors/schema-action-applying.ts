/**
 * `schema.action-applying` interceptor chain (I6.18) — runs BEFORE
 * a {@link SchemaAction} (from a `schema_actions` plugin contribution
 * OR the built-in DBA toolbox / schema-context-menu) is applied.
 * Handlers can veto the action (typical use: production-host DDL
 * gates, "DBA approval required" workflows, recreate-table
 * row-count thresholds).
 *
 * The shell wraps the schema-action dispatcher:
 *
 *     const decision = await schemaActionApplyingChain.run(ctx);
 *     if (decision.action === 'cancel') {
 *       // surface decision.reason; keep the source UI state intact;
 *       // do not call host.execute
 *       return;
 *     }
 *     await host.execute(ctx.ddl);
 *     emitSchemaActionApplied({...});
 *
 * The interceptor runs BEFORE `emitSchemaActionApplied` (I6.8). A
 * vetoed action does NOT fire the `schema/action-applied` event —
 * audit subscribers only see actions the policy chain admitted.
 *
 * Veto-only; no modification. Same rationale as I6.12-I6.17.
 *
 * Relationship to `query.executing` (I6.12): every schema action
 * eventually runs through `host.execute(ddl)`, so the destructive-
 * DROP built-in in I6.12 already catches schema actions that produce
 * `DROP …` SQL. `schema.action-applying` adds **semantic** context
 * (the `SchemaAction` discriminator + target name) that the raw SQL
 * doesn't carry — policies that need to distinguish "user dropped a
 * table via the schema panel" from "user typed DROP TABLE in the
 * editor" gate on this chain.
 *
 * No built-in interceptors today. A "block all DROP from schema
 * panel" universal default would land here if user demand surfaces.
 */

import { InterceptorChain } from './chain.js';
import type { SchemaAction } from '../db/types.js';

/** Context passed to every `schema.action-applying` handler. Frozen
 *  at call time — handlers MAY NOT mutate fields.
 *
 *  Mirrors the I6.8 `SchemaActionAppliedPayload` shape minus the
 *  `appliedAt` timestamp (the action hasn't run yet at intercept
 *  time). */
export interface SchemaActionApplyingContext {
  tabId: string;
  sessionId: string;
  /** Object kind the action targets (`table` / `view` / `procedure` /
   *  `trigger` / `generator`). Same discriminator as
   *  `SchemaAction.kind`. */
  kind: SchemaAction['kind'];
  /** Action verb (`drop` / `alter` / `create-index` / `recreate` /
   *  `next-value` / `set-value` / …). Same string as
   *  `SchemaAction.action`. */
  action: string;
  /** Name of the object the action targets. */
  targetName: string;
  /** DDL the host is about to execute. `null` for actions applied
   *  via something other than a single DDL statement (e.g.
   *  `next-value` reads via SELECT). Policies that gate on the SQL
   *  shape skip null entries. */
  ddl: string | null;
}

/** Singleton chain instance. Plugins call
 *  `schemaActionApplyingChain.use(...)` to register their handlers;
 *  the shell calls `.run(ctx)` from the schema-action dispatcher
 *  (App.tsx) BEFORE invoking `host.execute(ddl)` and BEFORE firing
 *  `emitSchemaActionApplied`. */
export const schemaActionApplyingChain =
  new InterceptorChain<SchemaActionApplyingContext>();
