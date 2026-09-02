/**
 * Toolbar-button contribution contract (I5.3).
 *
 * Plugins contribute buttons into three shell toolbar slots through
 * the `toolbar_buttons` extension point. Each contribution declares
 * which `location` it targets; the slot component in that location
 * renders all matching contributions in priority order alongside any
 * shell-owned buttons.
 *
 * Locations:
 *
 *   - `tab` — `QueryPanel` header (next to Reconnect / Stats /
 *     Disconnect / Execute). The shell-owned buttons in this row
 *     touch heavy shell state (Tauri command invocation, session
 *     lifecycle) and stay hardcoded; plugin buttons sit between the
 *     hint badges and the action cluster.
 *   - `tabstrip` — `TabStrip` (next to the `+ New tab` button). Use
 *     for global, session-independent shortcuts (open recent, palette
 *     toggles, etc.).
 *   - `status` — `StatusBar` footer (left of the brand attribution).
 *     Compact 11px-typography slot for plugin-supplied indicators
 *     (Slack-style "X unread", "Cache: warm/cold", current branch in
 *     the migration-management plugin, etc.).
 *
 * Unlike I5.2's menus, this contract does **not** ship a built-in
 * extraction. Most existing toolbar buttons touch shell state too
 * heavily to factor through the registry without entangling plugins
 * in the host's session lifecycle; the existing handlers stay
 * inline. Plugin-contributed buttons surface as **additions** to the
 * shell's existing rows.
 */

import type { ComponentType } from 'react';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Toolbar surface ids recognised by `ToolbarSlot`. */
export type ToolbarLocation = 'tab' | 'tabstrip' | 'status';

/** Visual variant the slot renders. Default styling matches the
 *  shell's secondary-button skin (bordered, hover:bg-elevated);
 *  `accent` matches the primary Execute-button skin; `warning` and
 *  `danger` match the reconnect / destructive button skins. */
export type ToolbarButtonVariant = 'default' | 'accent' | 'warning' | 'danger';

/** Context handed to a button's `when` predicate + `run` callback.
 *  Concrete shape depends on the location:
 *
 *    - `tab` — `{ sessionId: string | null, busy: boolean }`
 *    - `tabstrip` — `{ activeTabId: string | null }`
 *    - `status` — `{ sessionId: string | null }`
 *
 *  Consumers narrow at the slot site by passing a typed `ctx`. */
export interface ToolbarContext<TCtx = unknown> {
  location: ToolbarLocation;
  data: TCtx;
}

export interface ToolbarButtonContributionPayload<TCtx = unknown> {
  /** Display label. Slot component decides whether to render alongside
   *  the icon or hide it (compact `status` slot hides the label by
   *  default; pass `showLabel: true` in the slot props to force-show). */
  label: string;
  /** Tooltip / aria-label. Falls back to `label` when absent. */
  hint?: string;
  /** Optional Lucide-style icon. Required for the `status` slot's
   *  compact layout — labels are hidden there by default. */
  icon?: ComponentType<{ className?: string }>;
  /** Toolbar surface this button targets. Exact match required. */
  location: ToolbarLocation;
  /** Visual variant — see `ToolbarButtonVariant`. */
  variant?: ToolbarButtonVariant;
  /** Optional visibility predicate. Items whose `when` returns false
   *  are filtered out before render. */
  when?: (ctx: ToolbarContext<TCtx>) => boolean;
  /** Invoked on click. */
  run: (ctx: ToolbarContext<TCtx>) => void;
}

/** Resolved button ready for render. */
export interface ToolbarButtonDescriptor<TCtx = unknown> {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide on click. */
  id: string;
  pluginId: string;
  label: string;
  hint: string;
  icon?: ComponentType<{ className?: string }>;
  variant: ToolbarButtonVariant;
  /** Invokes the contribution's `run` with the captured context. */
  run: () => void;
  /** Captured ctx so `ToolbarSlot` can re-bind `run` cheaply when the
   *  ctx changes without rebuilding descriptors. */
  ctx: ToolbarContext<TCtx>;
}

/**
 * Filters + maps registry contributions for a given location into
 * render-ready descriptors. Within the location filter the registry's
 * existing priority sort applies (lower number = higher priority =
 * appears first). Items whose `when` returns false are dropped.
 */
export function pluginContributionsToToolbarButtons<TCtx = unknown>(
  contributions: ReadonlyArray<PluginContribution<ToolbarButtonContributionPayload<TCtx>>>,
  location: ToolbarLocation,
  data: TCtx,
): ToolbarButtonDescriptor<TCtx>[] {
  const out: ToolbarButtonDescriptor<TCtx>[] = [];
  const ctx: ToolbarContext<TCtx> = { location, data };
  for (const { pluginId, contribution } of contributions) {
    const p = contribution.payload;
    if (p.location !== location) continue;
    if (p.when && !p.when(ctx)) continue;
    const desc: ToolbarButtonDescriptor<TCtx> = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: p.label,
      hint: p.hint ?? p.label,
      variant: p.variant ?? 'default',
      run: () => p.run(ctx),
      ctx,
    };
    if (p.icon !== undefined) desc.icon = p.icon;
    out.push(desc);
  }
  return out;
}
