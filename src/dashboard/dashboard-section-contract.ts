/**
 * Dashboard-section contribution contract (I5.10).
 *
 * Plugins contribute cards into the `WelcomeDashboard` (and future
 * `StatsDashboard`) via the `dashboard_sections` extension point. The
 * shell renders each contribution in registry priority order; each
 * card's Component receives the shell-supplied `DashboardContext`
 * (session info + schema + recent-queries hooks) and decides what to
 * render.
 *
 * Built-in `@plamenix-builtin/dashboard-default-sections` extracts
 * the four legacy Welcome cards (Connection info / Entity counts /
 * Tips / Recent queries) as contributions. Third-party plugins add
 * "Active sessions" / "Lock waits" / "Cache hit ratio" / "Replica
 * lag" / "Slow query log" cards through the same surface.
 *
 * **Surface scope for M1**: this section ships the contract + the
 * Welcome surface consumer. The `StatsDashboard` surface (live MON$
 * stats with periodic refresh) is a heavier refactor — its sections
 * are tightly coupled to a single MonDatabase fetch — and lands when
 * a concrete refresh-driven plugin needs the contract there. The
 * `refreshIntervalSec` payload field is ready for that future
 * surface.
 */

import type { ComponentType } from 'react';
import type { Schema } from '../db/types.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Context handed to every dashboard section's Component. Fields are
 *  optional because per-surface contexts populate different subsets:
 *  Welcome supplies the session + schema + recent-queries surface,
 *  a future Stats surface would supply the MonDatabase + refresh
 *  tick. Plugins read what they need; absent fields signal "not
 *  applicable on this surface". */
export interface DashboardContext {
  sessionId?: string | null;
  user?: string;
  host?: string;
  port?: number;
  database?: string;
  engineVersion?: string | null;
  connectedAt?: number | null;
  schema?: Schema | null;
  /** Recent-queries bucket key for the active profile / tab. */
  recentKey?: string;
  /** Picks a recent SQL entry — host typically pastes it into the
   *  editor buffer. */
  onPickRecent?: (sql: string) => void;
}

export interface DashboardSectionContributionPayload {
  /** Optional title — section Components may render their own header
   *  instead. When provided, the shell can surface it in a future
   *  "rearrange dashboard" UI without mounting the Component. */
  title?: string;
  /** Optional Lucide-style icon. Same reason as `title` — host-side
   *  UIs (rearrange, hide/show) need to render the section's identity
   *  without instantiating the Component. */
  icon?: ComponentType<{ className?: string }>;
  /** Body component. Receives `{ctx}` with the surface's helpers. */
  Component: ComponentType<{ ctx: DashboardContext }>;
  /** Suggested refresh cadence in seconds. Stats-style sections
   *  declare this so the surface can re-render their Components at
   *  the interval; Welcome cards omit (no periodic refresh today).
   *  Reserved — surfaces consult it when they need it. */
  refreshIntervalSec?: number;
  /** Layout hint — `'full'` (default) spans the dashboard's full
   *  width; `'half'` halves it so two cards fit side-by-side on
   *  wide viewports. Reserved for the eventual grid refactor; the
   *  current Welcome surface renders sections vertically full-width. */
  span?: 'half' | 'full';
}

/** Resolved descriptor ready for the surface iterator. */
export interface DashboardSectionDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide. */
  id: string;
  pluginId: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  Component: ComponentType<{ ctx: DashboardContext }>;
  refreshIntervalSec: number | null;
  span: 'half' | 'full';
}

/** Maps registry contributions into descriptors in registry priority
 *  order (lower number = appears first in the dashboard). */
export function pluginContributionsToDashboardSections(
  contributions: ReadonlyArray<PluginContribution<DashboardSectionContributionPayload>>,
): DashboardSectionDescriptor[] {
  const out: DashboardSectionDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    const p = contribution.payload;
    const desc: DashboardSectionDescriptor = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      title: p.title ?? '',
      Component: p.Component,
      refreshIntervalSec: p.refreshIntervalSec ?? null,
      span: p.span ?? 'full',
    };
    if (p.icon !== undefined) desc.icon = p.icon;
    out.push(desc);
  }
  return out;
}
