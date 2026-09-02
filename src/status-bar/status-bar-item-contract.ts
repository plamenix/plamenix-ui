/**
 * Status-bar item contribution contract (I5.11).
 *
 * Plugins contribute arbitrary React components into the bottom
 * status-bar through the `status_bar_items` extension point. Each
 * contribution declares an `alignment` (`'left'` or `'right'`); the
 * shell renders left-aligned items left of the central spacer, and
 * right-aligned items right of it (where the I5.3 `ToolbarSlot
 * location="status"` buttons and the brand attribution already sit).
 *
 * Distinct from I5.3 `toolbar_buttons` `location: 'status'` —
 * `toolbar_buttons` is button-shaped (label + icon + click → run);
 * `status_bar_items` is component-shaped (arbitrary JSX: badges,
 * dropdowns, timers, indicator chips, etc.). Plugin authors pick
 * `toolbar_buttons` for a plain "do something" button and
 * `status_bar_items` for richer status displays.
 *
 * Built-in `@plamenix-builtin/status-bar-default-items` extracts the
 * five legacy left-side items (connection-health dot, masked DSN +
 * copy button, last-FROM table, row count, last query duration) as
 * contributions. Third-party adds "Server timezone", "Slow query
 * badge", "Active sessions count", "Replica lag", etc.
 */

import type { ComponentType } from 'react';
import type { StatementOutcome } from '../db/types.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Side the item appears on within the status bar. */
export type StatusBarAlignment = 'left' | 'right';

/** Context handed to every status-bar item's Component. All fields
 *  optional because some items only need a subset (a "Server
 *  timezone" plugin reads `sessionId` only). Components return
 *  `null` when their data isn't available so the host can simply
 *  filter them out at render time. */
export interface StatusBarContext {
  sessionId?: string | null;
  health?: 'unknown' | 'healthy' | 'reconnecting' | 'dead';
  user?: string;
  host?: string;
  port?: number;
  database?: string;
  /** Raw SQL of the most recent execute — built-in `table-from-SQL`
   *  parses the leading `FROM <table>` clause to surface a short
   *  table hint. */
  executedSql?: string | null;
  /** Most recent statement outcome batch — built-in `row-count`
   *  reads the trailing affected/row count. */
  results?: StatementOutcome[] | null;
  /** Recent-queries bucket key — built-in `last-duration` pulls the
   *  most recent execution's `durationMs` from this bucket. */
  recentKey?: string;
}

export interface StatusBarItemContributionPayload {
  alignment: StatusBarAlignment;
  /** Body component. Receives `{ctx}` with the shell-supplied helpers.
   *  Returns `null` to opt out (item not applicable to current
   *  context — e.g. "no session, no DSN to copy"). */
  Component: ComponentType<{ ctx: StatusBarContext }>;
}

/** Resolved descriptor ready for the status-bar iterator. */
export interface StatusBarItemDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide. */
  id: string;
  pluginId: string;
  alignment: StatusBarAlignment;
  Component: ComponentType<{ ctx: StatusBarContext }>;
}

/** Maps registry contributions into descriptors in registry priority
 *  order (lower = appears first within its alignment group). */
export function pluginContributionsToStatusBarItems(
  contributions: ReadonlyArray<PluginContribution<StatusBarItemContributionPayload>>,
): StatusBarItemDescriptor[] {
  return contributions.map(({ pluginId, contribution }) => ({
    id: `${pluginId}:${contribution.id}`,
    pluginId,
    alignment: contribution.payload.alignment,
    Component: contribution.payload.Component,
  }));
}

/** Convenience: returns only items matching `alignment`. */
export function statusBarItemsByAlignment(
  descriptors: ReadonlyArray<StatusBarItemDescriptor>,
  alignment: StatusBarAlignment,
): StatusBarItemDescriptor[] {
  return descriptors.filter((d) => d.alignment === alignment);
}
