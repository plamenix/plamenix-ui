/**
 * Menu-contribution contract (I5.2).
 *
 * Multiple right-click context menus across the shell read from the
 * same `menus` extension point: schema-object menus in `SchemaBrowser`
 * (table / view / procedure / trigger / generator / domain), the
 * (future) row context menu in `ResultTable`, the (future) tab
 * context menu in `TabStrip`, the (future) cell context menu, etc.
 * Each surface is discriminated by a `menuId` string the consumer
 * uses to filter contributions; plugins target one specific surface
 * per contribution (a "Duplicate as INSERT statement" item declares
 * `menuId: 'schema.table'`).
 *
 * Naming convention for `menuId` (matches the dotted-namespace style
 * the rest of the contribution-point ids use):
 *
 *   - `schema.table`, `schema.view`, `schema.procedure`,
 *     `schema.trigger`, `schema.generator`, `schema.domain` — schema
 *     browser right-click menus (active in I5.2).
 *   - `result.row`, `result.cell`, `tab.contextmenu` — additional
 *     surfaces planned for I5.2 part 2 (deferred to a separate
 *     section once their host menus are written; the contract is
 *     ready for them today).
 *
 * **when-clause grammar**: function-based for v1. Plugins ship a
 * predicate `(ctx) => boolean` against the discriminated context.
 * String-based DSLs (`'kind === "table" && target.primaryKey'`) need
 * a parser + sandboxed evaluator to be safe; deferred to I7's
 * manifest-declared menu work where serialisable predicates matter.
 * Function predicates are loaded via the plugin's ui.mjs and execute
 * inside the host context — same trust model as `run` callbacks.
 */

import type { ComponentType } from 'react';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Context handed to a menu item's `when` predicate + `run` callback.
 *  Concrete shape of `target` varies by `menuId` — consumers narrow
 *  via the discriminator before reading. */
export interface MenuContext<TTarget = unknown> {
  /** The menu surface that fired (`'schema.table'`, `'result.row'`,
   *  etc.). Plugins typically only register against one `menuId`, so
   *  this is more useful to `when` predicates that share a
   *  cross-surface callback than to per-surface ones. */
  menuId: string;
  /** Target object the menu is anchored to. For `schema.table` this
   *  is a `TableInfo`; for `result.row` it would be a row index
   *  + cells; etc. Discriminated at the consumer site. */
  target: TTarget;
}

export interface MenuContributionPayload<TTarget = unknown> {
  /** Primary label rendered in the menu row. Concise (`'DROP'`,
   *  `'Recompute statistics'`) — full sentences belong in `hint`. */
  label: string;
  /** Sub-label / one-line hint rendered under `label`. */
  hint?: string;
  /** Optional Lucide-style icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Menu surface this item targets. Exact match required — a
   *  contribution declaring `menuId: 'schema.table'` only surfaces
   *  in the table context menu, never in views / procedures / etc. */
  menuId: string;
  /** Optional group label. Items sharing a group cluster together
   *  with a separator between groups. Items with `tone: 'danger'`
   *  always sort last regardless of group. Items with no `group` go
   *  in the default group. */
  group?: string;
  /** `danger` renders red + always sorts to the bottom of the menu
   *  (with a separator above the danger cluster). */
  tone?: 'default' | 'danger';
  /** Optional visibility predicate. Items whose `when` returns false
   *  are filtered out before render. Use for context-aware items
   *  (e.g. "Rebuild fk constraints" only on tables that have any). */
  when?: (ctx: MenuContext<TTarget>) => boolean;
  /** Invoked on click. The shell closes the menu before this fires. */
  run: (ctx: MenuContext<TTarget>) => void;
}

/** Resolved menu item ready for render. The shell's existing context-
 *  menu component reads `label` / `hint` / `icon` / `tone` directly
 *  and dispatches via `run`. */
export interface MenuItemDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins declaring the same
   *  local id never collide on click. */
  id: string;
  pluginId: string;
  label: string;
  hint: string;
  icon?: ComponentType<{ className?: string }>;
  group: string | null;
  tone: 'default' | 'danger';
  /** Invokes the contribution's `run` with the context the consumer
   *  supplied at descriptor-build time. */
  run: () => void;
}

/**
 * Filters + maps registry contributions for a given menu surface into
 * render-ready descriptors:
 *
 *   1. Drop items whose `menuId` doesn't match `menuId`.
 *   2. Drop items whose `when` predicate (if any) returns false for
 *      the supplied `ctx`.
 *   3. Group by `group` label (alphabetically), default group last.
 *   4. Append `danger`-toned items at the bottom regardless of group.
 *
 * Within each cluster the registry's existing priority sort applies
 * (lower number = higher priority = appears first). The consumer
 * renders the resulting flat list; existing dumb context-menu
 * components keep their auto-separator logic between `default` and
 * `danger` rows.
 */
export function pluginContributionsToMenuItems<TTarget = unknown>(
  contributions: ReadonlyArray<PluginContribution<MenuContributionPayload<TTarget>>>,
  menuId: string,
  ctx: MenuContext<TTarget>,
): MenuItemDescriptor[] {
  // Preserve the registry's priority order within each group while
  // applying menuId filter + when guard.
  const matching: { pluginId: string; contribution: PluginContribution<MenuContributionPayload<TTarget>>['contribution'] }[] = [];
  for (const c of contributions) {
    if (c.contribution.payload.menuId !== menuId) continue;
    const when = c.contribution.payload.when;
    if (when && !when(ctx)) continue;
    matching.push({ pluginId: c.pluginId, contribution: c.contribution });
  }

  // Bucket by group + tone. Group order: named groups alphabetically,
  // then the default (unnamed) group, then danger items.
  type Bucket = { key: string; isDanger: boolean; items: MenuItemDescriptor[] };
  const named = new Map<string, Bucket>();
  const defaultGroup: Bucket = { key: '__default', isDanger: false, items: [] };
  const dangerGroup: Bucket = { key: '__danger', isDanger: true, items: [] };

  for (const { pluginId, contribution } of matching) {
    const p = contribution.payload;
    const desc: MenuItemDescriptor = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: p.label,
      hint: p.hint ?? '',
      group: p.group ?? null,
      tone: p.tone ?? 'default',
      run: () => p.run(ctx),
    };
    if (p.icon !== undefined) desc.icon = p.icon;
    if (p.tone === 'danger') {
      dangerGroup.items.push(desc);
    } else if (p.group) {
      let bucket = named.get(p.group);
      if (!bucket) {
        bucket = { key: p.group, isDanger: false, items: [] };
        named.set(p.group, bucket);
      }
      bucket.items.push(desc);
    } else {
      defaultGroup.items.push(desc);
    }
  }

  // Named groups alphabetically by group key for deterministic order.
  const sortedNamed = [...named.values()].sort((a, b) => a.key.localeCompare(b.key));
  const ordered: Bucket[] = [...sortedNamed, defaultGroup, dangerGroup];
  return ordered.flatMap((b) => b.items);
}
