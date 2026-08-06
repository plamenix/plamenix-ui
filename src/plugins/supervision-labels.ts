/**
 * Shared human-readable labels for supervisor state (I7.4, I8.5).
 *
 * Used by `PluginPanelModal` (single-plugin) and `PermissionsPanel`
 * (multi-plugin) to keep status pill copy + crash-budget colours
 * consistent across both surfaces.
 */

import type {
  PluginDisableReason,
  PluginRestartPolicy,
  PluginStatus,
} from './types';

export const STATUS_LABEL: Record<PluginStatus, string> = {
  loaded: 'Loaded',
  active: 'Active',
  crashing: 'Crashing',
  stopped: 'Stopped',
  disabled: 'Disabled',
};

export const STATUS_PILL_CLASS: Record<PluginStatus, string> = {
  loaded: 'bg-bg-subtle text-fg-muted',
  active: 'bg-emerald-500/15 text-emerald-300',
  crashing: 'bg-amber-500/15 text-amber-300',
  stopped: 'bg-bg-subtle text-fg-muted',
  disabled: 'bg-red-500/15 text-red-300',
};

export const RESTART_POLICY_LABEL: Record<PluginRestartPolicy, string> = {
  permanent: 'Permanent (always restart)',
  transient: 'Transient (restart on crash only)',
  temporary: 'Temporary (never restart)',
};

export const DISABLE_REASON_LABEL: Record<PluginDisableReason, string> = {
  'crash-budget-exhausted':
    'Crash budget exhausted — the plugin crashed too many times in a short window.',
};

/** Crash-budget bar colour selector. `disabled` and high-usage states
 *  produce visually escalating fill colours so the user can scan a
 *  list at a glance. */
export function crashBudgetBarClass(used: number, isDisabled: boolean): string {
  if (isDisabled) return 'bg-red-500';
  if (used > 0) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/** Clamps `used / max` to a `[0, 100]` percentage. Defensive against
 *  `used > max` (which can happen if the supervisor's window slides
 *  before the UI refreshes). */
export function crashBudgetPercent(used: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}
