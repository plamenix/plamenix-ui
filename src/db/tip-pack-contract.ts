/**
 * Tip-pack contribution-point contract.
 *
 * Plugins (built-in or third-party) contribute tip catalogs at the
 * `tip_packs` extension point. The WelcomeDashboard's TipsCard
 * surfaces tips from across every registered pack (built-in
 * Firebird tips, future locale packs, vendor-specific packs like an
 * IBSurgeon EPF tip pack); the host applies the active engine
 * version filter at the merge boundary using
 * [`filterTipsForVersion`] already exported from `./firebird-tips.ts`.
 *
 * Built-in extraction (`@plamenix-builtin/firebird-tips`) lands in
 * I4.7 — the 32 hand-curated Firebird tips become a contribution
 * instead of a static import. Existing direct consumers of
 * `FIREBIRD_TIPS` keep working until the WelcomeDashboard refactor
 * lands later (consumer wiring); the registry path is additive.
 */

import type { PluginContribution } from '../plugin-react/usePluginContributions.js';
import type { FirebirdTip } from './firebird-tips.js';

/** Tip-pack payload shape — plugins package a self-contained tip
 *  list. The host enumerates packs, applies version filtering, and
 *  rotates through the merged set. */
export interface TipPackContributionPayload {
  /** Author-facing pack title (shown in a future tip-pack picker). */
  title: string;
  /** Pack-internal tip catalog. Each tip's `minVersion?` is honored
   *  identically to the existing default pack. */
  tips: readonly FirebirdTip[];
}

/**
 * Flattens every registered tip pack into a single tip array,
 * preserving registration / priority order from the registry. The
 * WelcomeDashboard's existing `filterTipsForVersion` consumes this
 * flat list directly.
 *
 * Each pack's `tips` are appended in order — no dedup. If two packs
 * happen to ship a tip with the same id, both surface; rotation
 * shows them sequentially. Dedup is plugin-author responsibility +
 * a possible future I5 lint, not a registry-level concern.
 */
export function flattenTipPacks(
  contributions: ReadonlyArray<PluginContribution<TipPackContributionPayload>>,
): FirebirdTip[] {
  const out: FirebirdTip[] = [];
  for (const { contribution } of contributions) {
    out.push(...contribution.payload.tips);
  }
  return out;
}
