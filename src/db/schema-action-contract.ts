/**
 * Schema-action contribution-point contract.
 *
 * Plugins contribute schema-object actions (RECREATE TABLE, SET
 * STATISTICS INDEX, future "rebuild all indexes", "force write",
 * "compact table", etc.) at the `schema_actions` extension point.
 * Each contribution declares which schema-object kinds it applies to
 * (`table`, `view`, `procedure`, …) and the SQL it emits when
 * invoked. The shell's SchemaBrowser action menu enumerates
 * contributions filtered by the kind of the currently-focused
 * object.
 *
 * Built-in `@plamenix-builtin/dba-toolbox` (I4.8) extracts the two
 * existing TABLE-only actions hardcoded in `schema-actions.ts` —
 * `recreate-table` + `recompute-statistics` — into contributions
 * through this point. Third-party packs (a "DBA toolbox" plugin
 * adding 20 more actions: rebuild indexes, force writes, sweep
 * interval, fragmentation check, etc.) plug in without core PRs.
 */

import type { ColumnInfo, TableInfo } from './types.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Schema-object kinds the registry recognises. Matches the
 *  `SchemaBrowser` section taxonomy (tables / views / procedures /
 *  triggers / generators / domains). */
export type SchemaObjectKind =
  | 'table'
  | 'view'
  | 'procedure'
  | 'trigger'
  | 'generator'
  | 'domain';

/** Context handed to a schema action when the user invokes it. The
 *  shape is currently TABLE-shaped (most actions target tables); as
 *  view/procedure/etc. actions land, the discriminated union grows. */
export interface SchemaActionContext {
  kind: SchemaObjectKind;
  /** The target schema object — exact shape depends on `kind`. For
   *  M1 the most common case is TableInfo. */
  target: TableInfo | { name: string; columns?: ColumnInfo[] };
}

export interface SchemaActionContributionPayload {
  /** Display label shown in the action menu. */
  label: string;
  /** Optional tooltip / one-line description. */
  hint?: string;
  /** Schema-object kinds this action applies to. Action menu filters
   *  contributions whose `applicableKinds` includes the focused
   *  object's kind. */
  applicableKinds: readonly SchemaObjectKind[];
  /** Destructive actions render with a warning style + require a
   *  confirm step (the shell's existing destructive-action UX). */
  destructive?: boolean;
  /** Confirmation prompt — string for static prompts, function for
   *  prompts that need the target name interpolated. */
  confirmPrompt?: string | ((ctx: SchemaActionContext) => string);
  /** Produces the DDL the host runs when the user confirms. */
  buildSql: (ctx: SchemaActionContext) => string;
}

/** One resolved schema action ready for menu rendering — payload
 *  fields plus the registry identifiers needed for stable React keys
 *  and click dispatch. */
export interface SchemaActionDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local action id do not collide on menu keys. */
  id: string;
  pluginId: string;
  label: string;
  hint?: string;
  destructive: boolean;
  /** Resolved confirm prompt string for the supplied context, or
   *  `null` when the action does not require confirmation. */
  confirmPrompt: string | null;
  /** Calls the plugin's `buildSql` with the context; centralised
   *  here so menu consumers don't have to thread the ctx into every
   *  callback. */
  buildSql: () => string;
}

/**
 * Filters + maps registry contributions for a given target into
 * menu-ready descriptors. The action menu in SchemaBrowser consumes
 * this directly: one call per object-focus change, results spread
 * into the existing menu-item list.
 */
export function pluginContributionsToSchemaActions(
  contributions: ReadonlyArray<PluginContribution<SchemaActionContributionPayload>>,
  ctx: SchemaActionContext,
): SchemaActionDescriptor[] {
  const out: SchemaActionDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    if (!contribution.payload.applicableKinds.includes(ctx.kind)) continue;
    const confirmPrompt = (() => {
      const p = contribution.payload.confirmPrompt;
      if (typeof p === 'string') return p;
      if (typeof p === 'function') return p(ctx);
      return null;
    })();
    const desc: SchemaActionDescriptor = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: contribution.payload.label,
      destructive: contribution.payload.destructive ?? false,
      confirmPrompt,
      buildSql: () => contribution.payload.buildSql(ctx),
    };
    if (contribution.payload.hint !== undefined) {
      desc.hint = contribution.payload.hint;
    }
    out.push(desc);
  }
  return out;
}
